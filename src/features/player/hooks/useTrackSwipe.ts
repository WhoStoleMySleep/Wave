import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { playerEngine } from "../engine/playerEngine";

export type SwipeDirection = "next" | "previous";

const AXIS_LOCK_PX = 10;
const COMMIT_RATIO = 0.25;
const COMMIT_VELOCITY_PX_PER_MS = 0.45;
const OUT_MS = 150;
const IN_MS = 220;
/** Pull at the end of the queue only stretches, so it reads as "nothing there". */
const EDGE_RESISTANCE = 0.25;
const IGNORED_TARGETS = "button, a, input, [role=slider]";

export interface TrackSwipeOptions {
  /** Elements that follow the finger and slide out when the swipe commits; the first sets the swipe width. */
  getTargets: () => HTMLElement[];
  /** Receives the move event once the gesture turns out to be vertical, e.g. to start closing a sheet. */
  onVerticalStart?: (event: PointerEvent) => void;
  enabled?: boolean;
}

function canSwipe(direction: SwipeDirection): boolean {
  return direction === "next" ? playerEngine.hasNextTrack() : playerEngine.hasPreviousTrack();
}

function swipe(direction: SwipeDirection): void {
  if (direction === "next") void playerEngine.skipNext();
  else void playerEngine.skipPrevious(true);
}

function setStyle(targets: HTMLElement[], offset: number, opacity: number, transitionMs: number) {
  for (const el of targets) applyStyle(el, offset, opacity, transitionMs);
}

function applyStyle(el: HTMLElement, offset: number, opacity: number, transitionMs: number) {
  el.style.transition = transitionMs > 0 ? `transform ${transitionMs}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${transitionMs}ms ease-out` : "none";
  el.style.transform = offset === 0 ? "" : `translate3d(${offset}px, 0, 0)`;
  el.style.opacity = opacity === 1 ? "" : String(opacity);
}

/**
 * Horizontal swipe on the current track: left plays the next one, right the
 * previous one. Pointer handlers go on the area that should react; buttons and
 * sliders inside it keep their own touches.
 */
export function useTrackSwipe({ getTargets, onVerticalStart, enabled = true }: TrackSwipeOptions) {
  const optionsRef = useRef({ getTargets, onVerticalStart });
  optionsRef.current = { getTargets, onVerticalStart };
  const swipedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || !event.isPrimary) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if ((event.target as HTMLElement).closest(IGNORED_TARGETS)) return;

      cleanupRef.current?.();
      swipedRef.current = false;
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      let axis: "x" | "y" | null = null;
      let offset = 0;
      let lastX = startX;
      let lastT = event.timeStamp;
      let velocity = 0;

      const finish = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        cleanupRef.current = null;
      };

      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (axis === null) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) return;
          axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          if (axis === "y") {
            finish();
            optionsRef.current.onVerticalStart?.(e);
            return;
          }
          swipedRef.current = true;
        }

        const targets = optionsRef.current.getTargets();
        if (targets.length === 0) return;
        const direction: SwipeDirection = dx < 0 ? "next" : "previous";
        offset = canSwipe(direction) ? dx : dx * EDGE_RESISTANCE;
        const width = targets[0].offsetWidth || 1;
        setStyle(targets, offset, 1 - Math.min(0.6, (Math.abs(offset) / width) * 0.6), 0);

        const dt = e.timeStamp - lastT;
        if (dt > 0) velocity = (e.clientX - lastX) / dt;
        lastX = e.clientX;
        lastT = e.timeStamp;
      };

      const settle = (commit: boolean) => {
        finish();
        const targets = optionsRef.current.getTargets();
        if (targets.length === 0 || axis !== "x") return;
        const direction: SwipeDirection = offset < 0 ? "next" : "previous";
        const width = targets[0].offsetWidth || 1;
        const flung = Math.abs(velocity) > COMMIT_VELOCITY_PX_PER_MS && Math.sign(velocity) === Math.sign(offset);
        const shouldCommit =
          commit && offset !== 0 && canSwipe(direction) && (Math.abs(offset) > width * COMMIT_RATIO || flung);
        if (!shouldCommit) {
          setStyle(targets, 0, 1, IN_MS);
          return;
        }
        const sign = Math.sign(offset);
        setStyle(targets, sign * width, 0, OUT_MS);
        window.setTimeout(() => {
          swipe(direction);
          // the new track slides in from the side the finger came from
          setStyle(targets, -sign * width * 0.4, 0, 0);
          requestAnimationFrame(() => requestAnimationFrame(() => setStyle(targets, 0, 1, IN_MS)));
        }, OUT_MS);
      };

      const onUp = (e: PointerEvent) => {
        if (e.pointerId === pointerId) settle(true);
      };
      const onCancel = (e: PointerEvent) => {
        if (e.pointerId === pointerId) settle(false);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      cleanupRef.current = finish;
    },
    [enabled],
  );

  /** True once per swipe, so the click that ends it does not also open or toggle something. */
  const consumeSwipeClick = useCallback(() => {
    const swiped = swipedRef.current;
    swipedRef.current = false;
    return swiped;
  }, []);

  return { onPointerDown, consumeSwipeClick };
}
