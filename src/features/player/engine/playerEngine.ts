import {
  usePlayerStore,
  type PlayerCommand,
  type PlayerStatus,
  type RepeatMode,
  type PlayerState,
  type PlaybackContextInput,
} from "../store/playerStore";
import { playerRuntime } from "./playerRuntime";
import { log } from "@/shared/utils/logger";
import type { Track } from "@/shared/types";
import { FailureGuard } from "./failureGuard";
import { LyricsLoader } from "./lyricsLoader";
import { NextTrackPrefetch } from "./nextTrackPrefetch";
import { resolveContext } from "./playbackContext";
import { ListenOutbox } from "./listenOutbox";
import { PlaybackTelemetry } from "./playbackTelemetry";
import { QueueMemory } from "./queueMemory";
import { QueueEditor } from "./queueEditor";
import { hasPrevious, nextIndex, normalizeQueue, previousIndex, shuffle, shuffleUpcoming } from "./queueOrder";
import { ShuffleControl } from "./shuffleControl";
import { SmartShuffle } from "./smartShuffle";
import { clampPosition, loadTrack, pausePlayback, resumePlayback, seekPlayback, stopPlayback } from "./transport";
import { describeSample } from "./wave";
import { WaveFeed } from "./waveFeed";

export { usePlayerStore, type PlayerStatus, type RepeatMode, type PlayerState };

export interface PlaySource {
  context?: PlaybackContextInput;
  cover?: string | null;
}

/** What another device plays, to go on with it here. */
export interface PlaybackHandoff {
  queue: Track[];
  index: number;
  positionMs: number;
  context: string | null;
  contextTitle: string | null;
  contextCover: string | null;
  shuffle: boolean;
  repeat: RepeatMode;
}

type CommandHandlers = { [K in PlayerCommand["type"]]: (command: Extract<PlayerCommand, { type: K }>) => void };

const RESTART_THRESHOLD_MS = 3000;
const SEEK_BACK_THRESHOLD_MS = 3000;

const store = () => usePlayerStore.getState();

function randomIndex(length: number, preferred?: number): number {
  const inRange = preferred !== undefined && preferred >= 0 && preferred < length;
  return inRange ? preferred : Math.floor(Math.random() * length);
}

class PlayerEngine {
  private sessionId = 0;
  private readonly memory = new QueueMemory();
  private readonly listens = new ListenOutbox();
  private readonly telemetry = new PlaybackTelemetry(this.listens);
  private readonly lyrics = new LyricsLoader();
  private readonly prefetch = new NextTrackPrefetch(this.lyrics);
  private readonly preloadNext = () => this.prefetch.run();
  private readonly smartSlots = new SmartShuffle(() => this.memory.masterPlaylist, this.preloadNext);
  private readonly shuffleControl = new ShuffleControl({ memory: this.memory, smartSlots: this.smartSlots, onQueueChanged: this.preloadNext });
  private readonly queueEditor = new QueueEditor({ memory: this.memory, onQueueChanged: this.preloadNext });
  private readonly wave = new WaveFeed({ session: () => this.sessionId, onQueueGrown: this.preloadNext });
  private readonly failures = new FailureGuard({ skip: () => void this.skipNext(), stop: () => stopPlayback() });

  private readonly commandHandlers: CommandHandlers = {
    PLAY_REQUESTED: ({ track, queue, context, contextCover }) =>
      void this.playTrack(track, queue, { context, cover: contextCover }),
    PAUSE_REQUESTED: () => this.pause(),
    RESUME_REQUESTED: () => this.resume(),
    SEEK_COMMITTED: ({ positionMs }) => this.seek(positionMs),
    SKIP_NEXT: ({ isAutoEnd }) => void this.skipNext(isAutoEnd),
    SKIP_PREVIOUS: () => void this.skipPrevious(),
    SET_VOLUME: ({ volume }) => this.setVolume(volume),
    TOGGLE_PLAY_PAUSE: () => this.togglePlayPause(),
  };

  constructor() {
    usePlayerStore.setState({ dispatch: (command) => this.dispatch(command) });
    this.bindRuntime();
    if (typeof window === "undefined") return;
    window.addEventListener("beforeunload", () => this.telemetry.flush());
    this.listens.watch();
    void this.listens.drain();
    this.watchStore();
    if (usePlayerStore.persist.hasHydrated()) this.restoreHydratedTrack();
    else usePlayerStore.persist.onFinishHydration(() => this.restoreHydratedTrack());
  }

  public subscribe(listener: () => void): () => void {
    return usePlayerStore.subscribe(listener);
  }

  public getSnapshot(): PlayerState {
    return store();
  }

  public dispatch(command: PlayerCommand): void {
    const handler = this.commandHandlers[command.type] as (command: PlayerCommand) => void;
    handler(command);
  }

  /**
   * Starts `track` and makes `queue` the new queue; with shuffle on, the tracks after it are shuffled.
   * @param queue - the list the track was picked from; just the track when omitted
   * @param source - context shown as "playing from" and its cover
   */
  public async playTrack(track: Track, queue?: Track[], source: PlaySource = {}): Promise<void> {
    const normalized = normalizeQueue(queue ?? [track], track);
    const index = Math.max(0, normalized.findIndex((item) => item.id === track.id));
    const plan = store().shuffle ? shuffleUpcoming(normalized, index) : { queue: normalized, original: [] };
    this.applySource(source);
    this.memory.remember(normalized, plan.original);
    this.startList(plan.queue[index] ?? track, index, plan.queue);
  }

  /** Jumps to a row of the current queue, keeping the queue, its order and the context. */
  public async playFromQueue(index: number): Promise<void> {
    if (!store().queue[index]) return;
    this.wave.restart();
    this.jumpTo(index);
    void this.smartSlots.fill();
  }

  /**
   * Plays `tracks` in random order.
   * @param startIndex - track to start from; a random one when omitted
   */
  public async playShuffled(tracks: Track[], source: PlaySource = {}, startIndex?: number): Promise<void> {
    if (tracks.length === 0) return;
    const seedIndex = randomIndex(tracks.length, startIndex);
    const seed = tracks[seedIndex];
    const rest = tracks.filter((_, i) => i !== seedIndex);
    this.memory.remember(tracks, rest);
    store().setShuffle(true);
    this.applySource(source);
    this.startList(seed, 0, [seed, ...shuffle(rest)]);
  }

  /**
   * Goes on with what another device played: its queue, place and modes. The order
   * before shuffling stays on that device, so shuffle turned off here keeps the order as is.
   */
  public takeOver({ queue, index, positionMs, context, contextTitle, contextCover, shuffle, repeat }: PlaybackHandoff): void {
    const track = queue[index];
    if (!track) return;
    this.memory.remember(queue, []);
    usePlayerStore.setState({
      playbackContext: context,
      playbackContextTitle: contextTitle,
      playbackContextCover: contextCover,
      shuffle,
      smartShuffle: false,
      repeat,
    });
    this.wave.restart();
    this.sessionId += 1;
    loadTrack(track, index, queue, positionMs);
  }

  /** Plays `track` at once and fills the queue with similar tracks when the radio answers. */
  public async startRadioStation(track: Track): Promise<void> {
    this.applySource({ context: { id: `radio:${track.id}`, title: track.title }, cover: track.coverUrl ?? null });
    store().setSmartShuffle(false);
    this.memory.setOriginalUpcoming([]);
    this.wave.restart();
    this.startTrack(track, 0, [track]);
    const additions = await this.wave.fetchStation(track);
    if (additions) this.fillStation(track, additions);
  }

  public pause(): void {
    pausePlayback();
  }

  public resume(): void {
    resumePlayback();
  }

  public togglePlayPause(): void {
    const { status } = store();
    if (status === "playing" || status === "loading") this.pause();
    else this.resume();
  }

  /** @param isAutoEnd - the track ran out by itself, so repeat-one plays it again */
  public async skipNext(isAutoEnd = false): Promise<void> {
    const index = nextIndex(store(), isAutoEnd);
    if (index === null) {
      stopPlayback();
      store().setFullscreen(false);
      return;
    }
    this.jumpTo(index);
  }

  public hasNextTrack(): boolean {
    return nextIndex(store()) !== null;
  }

  public hasPreviousTrack(): boolean {
    return hasPrevious(store());
  }

  /**
   * @param force - go back even past the first seconds: a swipe means "previous track",
   * while the button restarts the current one
   */
  public async skipPrevious(force = false): Promise<void> {
    const state = store();
    if (state.queue.length === 0) return;
    if (!force && state.positionMs > RESTART_THRESHOLD_MS) {
      this.seek(0);
      return;
    }
    this.jumpTo(previousIndex(state));
  }

  public setVolume(volume: number): void {
    store().setVolume(Math.min(1, Math.max(0, volume)));
  }

  public setRepeat(mode: RepeatMode): void {
    store().setRepeat(mode);
  }

  /** Shuffles or restores only the tracks after the current one; turning shuffle off also ends smart shuffle. */
  public setShuffle(enabled: boolean): void {
    this.shuffleControl.setShuffle(enabled);
  }

  /**
   * Shuffle plus a similar track the context doesn't have after every two or three of its own.
   * Turning it off takes the upcoming picks out of the queue.
   */
  public setSmartShuffle(enabled: boolean): void {
    this.shuffleControl.setSmartShuffle(enabled);
  }

  /** Cycles off → shuffle → smart shuffle; a station skips smart shuffle. */
  public cycleShuffleMode(): void {
    this.shuffleControl.cycle();
  }

  /** @param autoPlay - start playing from there if paused, as a tap on the lyrics does */
  public seek(positionMs: number, autoPlay = false): void {
    const state = store();
    const target = clampPosition(positionMs, state);
    if (target < state.positionMs - SEEK_BACK_THRESHOLD_MS) this.telemetry.recordSeekBackward();
    seekPlayback(target, autoPlay);
  }

  public addToQueue(track: Track): void {
    this.queueEditor.append(track);
  }

  public playNext(track: Track): void {
    if (store().queue.length === 0) void this.playTrack(track);
    else this.queueEditor.insertNext(track);
  }

  /** Follows a new sort of the playing list without restarting the current track. */
  public followContextOrder(tracks: Track[]): void {
    this.queueEditor.followContextOrder(tracks);
  }

  public clearQueue(): void {
    this.queueEditor.clear();
  }

  public reorderQueue(fromIndex: number, toIndex: number): void {
    this.queueEditor.reorder(fromIndex, toIndex);
  }

  public prefetchLyrics(trackId: string): Promise<void> {
    return this.lyrics.prefetch(trackId);
  }

  private bindRuntime(): void {
    if (!playerRuntime) return;
    playerRuntime.onEnded = () => this.telemetry.onTrackCompleted(store().repeat === "one");
    playerRuntime.onError = (info) => this.failures.handle(info);
  }

  private watchStore(): void {
    const scope = window as Window & { __playerEngineUnsub?: () => void };
    scope.__playerEngineUnsub?.();
    scope.__playerEngineUnsub = usePlayerStore.subscribe((state, prev) => this.onStoreChange(state, prev));
  }

  private onStoreChange(state: PlayerState, prev: PlayerState): void {
    const trackChanged = state.currentTrack?.id !== prev.currentTrack?.id;
    if (trackChanged) this.onTrackChange(state);
    this.telemetry.onTick(state.status === "playing");
    if (trackChanged || state.status !== prev.status) this.onStatusChange(state.status);
  }

  private onTrackChange({ currentTrack, playbackContext }: PlayerState): void {
    this.prefetch.forget();
    if (currentTrack) this.telemetry.startTrack(currentTrack, playbackContext);
    else this.telemetry.flush();
    void this.lyrics.load(currentTrack);
    this.preloadNext();
    void this.smartSlots.fill();
  }

  private onStatusChange(status: PlayerStatus): void {
    if (status === "playing") {
      this.telemetry.onPlaying();
      this.failures.reset();
      return;
    }
    if (status === "paused" || status === "idle") this.telemetry.onPausedOrStopped();
  }

  private restoreHydratedTrack(): void {
    const { currentTrack } = store();
    if (!currentTrack) return;
    void this.lyrics.load(currentTrack);
    this.preloadNext();
  }

  private applySource({ context, cover }: PlaySource): void {
    const resolved = context === undefined ? null : resolveContext(context, store().playbackContext);
    if (resolved) usePlayerStore.setState({ playbackContext: resolved.id, playbackContextTitle: resolved.title });
    if (cover !== undefined) store().setPlaybackContextCover(cover);
  }

  private startList(track: Track, index: number, queue: Track[]): void {
    this.wave.restart();
    this.startTrack(track, index, queue);
    this.wave.extendIfLast(index, track.id);
    void this.smartSlots.fill();
  }

  private startTrack(track: Track, index: number, queue?: Track[]): void {
    this.sessionId += 1;
    loadTrack(track, index, queue);
  }

  private jumpTo(index: number): void {
    const track = store().queue[index];
    if (!track) return;
    this.startTrack(track, index);
    this.wave.extendIfLast(index, track.id);
  }

  private fillStation(seed: Track, additions: Track[]): void {
    if (additions.length === 0) return;
    const shuffled = store().shuffle;
    this.memory.setOriginalUpcoming(shuffled ? additions : []);
    store().setQueue([seed, ...(shuffled ? shuffle(additions) : additions)]);
    this.preloadNext();
    log("green", "radio", `started station for "${seed.title}" with ${additions.length} tracks: [${describeSample(additions)}]`);
  }
}

export const playerEngine = new PlayerEngine();
