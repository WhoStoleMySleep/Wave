import { adoptAudioElement, createAudioElement, hasSource, publishAudioElement, releaseSource } from "./audioElement";
import { FADE_FLOOR, retireAudio } from "./audioFades";
import { listenMediaEvents, type MediaHandlers } from "./mediaEvents";
import { isSessionExpired } from "./streamSession";

const noop = () => {};

export class AudioDeck {
  private element: HTMLAudioElement;
  private resetting = false;
  private blobUrl: string | null = null;
  private sessionExpiresAt: number | null = null;
  private stopRetiring: () => void = noop;

  constructor(private readonly handlers: MediaHandlers) {
    this.element = adoptAudioElement();
    this.listen();
  }

  public get audio(): HTMLAudioElement {
    return this.element;
  }

  public get isPlayingBlob(): boolean {
    return this.blobUrl !== null;
  }

  /** @returns the object url the element should play; the deck revokes it on reset */
  public holdBlob(blob: Blob): string {
    this.revokeBlob();
    this.blobUrl = URL.createObjectURL(blob);
    return this.blobUrl;
  }

  public setSessionExpiry(expiresAt: number | null): void {
    this.sessionExpiresAt = expiresAt;
  }

  public hasPlayableSource(): boolean {
    return hasSource(this.element) && !this.element.error && !isSessionExpired(this.sessionExpiresAt);
  }

  /** Leaves the playing element to fade out on its own and takes a fresh, near-silent one. */
  public handOff(): void {
    this.stopRetiring();
    this.stopRetiring = retireAudio(this.element, this.blobUrl);
    this.blobUrl = null;
    this.element = createAudioElement();
    this.element.volume = FADE_FLOOR;
    publishAudioElement(this.element);
    this.listen();
  }

  public dropRetired(): void {
    this.stopRetiring();
    this.stopRetiring = noop;
  }

  /** Clears the source without letting its teardown events reach the handlers. */
  public reset(): void {
    this.resetting = true;
    this.sessionExpiresAt = null;
    releaseSource(this.element);
    this.revokeBlob();
    this.resetting = false;
  }

  private listen(): void {
    listenMediaEvents(this.element, this.handlers, (source) => !this.resetting && source === this.element);
  }

  private revokeBlob(): void {
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = null;
  }
}
