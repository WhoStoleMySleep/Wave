import { playerEngine, usePlayerStore, type PlayerState } from "@/features/player";
import { presenceClient, type PresenceMessage } from "@/shared/presence";
import { useDevicesStore } from "../store/devicesStore";
import { handoffOf, parseDevices, snapshotOf, type RemoteDevice } from "./nowPlaying";

/** A position further than this from where playing would have taken it means a seek. */
const SEEK_TOLERANCE_MS = 3000;

interface Reported {
  positionMs: number;
  playing: boolean;
  at: number;
}

/** Something another device needs to know to go on from here changed. */
function changedForOthers(state: PlayerState, prev: PlayerState): boolean {
  return (
    state.currentTrack?.id !== prev.currentTrack?.id ||
    state.currentIndex !== prev.currentIndex ||
    state.queue !== prev.queue ||
    state.status !== prev.status ||
    state.shuffle !== prev.shuffle ||
    state.repeat !== prev.repeat ||
    state.playbackContext !== prev.playbackContext
  );
}

/**
 * Tells the user's other devices what plays here, and lets this device take
 * over what plays on one of them. The link rides on the presence socket.
 */
export class DevicesLink {
  private reported: Reported | null = null;

  /** @returns stops the link */
  start(): () => void {
    const stops = [
      presenceClient.onMessage((message) => this.receive(message)),
      presenceClient.onConnected(() => this.report(usePlayerStore.getState())),
      presenceClient.onDisconnected(() => useDevicesStore.setState({ devices: [] })),
      usePlayerStore.subscribe((state, prev) => {
        if (changedForOthers(state, prev) || this.seeked(state)) this.report(state);
      }),
    ];
    this.report(usePlayerStore.getState());
    return () => stops.forEach((stop) => stop());
  }

  /** Goes on here with what `device` plays, from where it is by now, and pauses it there. */
  takeOver(device: RemoteDevice): void {
    const handoff = handoffOf(device, performance.now() - useDevicesStore.getState().receivedAt);
    if (!handoff) return;
    playerEngine.takeOver(handoff);
    presenceClient.send({ type: "pause", deviceId: device.deviceId });
  }

  private receive(message: PresenceMessage): void {
    if (message.type === "devices") {
      useDevicesStore.setState({ devices: parseDevices(message.devices), receivedAt: performance.now() });
    } else if (message.type === "pause") {
      const { status } = usePlayerStore.getState();
      if (status === "playing" || status === "loading") playerEngine.pause();
    }
  }

  private seeked(state: PlayerState): boolean {
    if (!this.reported) return false;
    const { positionMs, playing, at } = this.reported;
    const expected = positionMs + (playing ? performance.now() - at : 0);
    return Math.abs(state.positionMs - expected) > SEEK_TOLERANCE_MS;
  }

  private report(state: PlayerState): void {
    const nowPlaying = snapshotOf(state);
    this.reported = nowPlaying ? { positionMs: nowPlaying.positionMs, playing: nowPlaying.playing, at: performance.now() } : null;
    presenceClient.send({ type: "nowPlaying", state: nowPlaying });
  }
}

export const devicesLink = new DevicesLink();
