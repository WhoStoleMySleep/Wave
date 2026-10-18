import { useCallback, useEffect, useRef } from "react";
import { animate, useMotionValue, type MotionValue } from "framer-motion";

const RETURN_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;

export interface SwipeDismissOptions {
  /** Pull distance in px past which releasing closes the sheet. */
  offset: number;
  /** Downward flick speed in px/s that closes the sheet regardless of distance. */
  velocity: number;
  onDismiss: () => void;
}

/**
 * Pull-down-to-close for a full-screen sheet. The finger is tracked with plain
 * window pointer listeners and only writes the returned motion value, so the
 * sheet's enter/exit animations keep working while the gesture itself stays out
 * of framer's drag: after a framer drag Android WebView swallowed the next tap.
 */
export function useSwipeDismiss({ offset, velocity, onDismiss }: SwipeDismissOptions): {
  y: MotionValue<number | string>;
  start: (event: PointerEvent) => void;
} {
  const y = useMotionValue<number | string>(0);
  const optionsRef = useRef({ offset, velocity, onDismiss });
  optionsRef.current = { offset, velocity, onDismiss };
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const start = useCallback(
    (event: PointerEvent) => {
      cleanupRef.current?.();
      const pointerId = event.pointerId;
      const startY = event.clientY;
      let pull = 0;
      let lastY = startY;
      let lastT = event.timeStamp;
      let speed = 0;

      const finish = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        cleanupRef.current = null;
      };

      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        pull = Math.max(0, e.clientY - startY);
        y.set(pull);
        const dt = e.timeStamp - lastT;
        if (dt > 0) speed = ((e.clientY - lastY) / dt) * 1000;
        lastY = e.clientY;
        lastT = e.timeStamp;
      };

      const settle = (commit: boolean) => {
        finish();
        const { offset: minOffset, velocity: minVelocity, onDismiss: dismiss } = optionsRef.current;
        if (commit && (pull > minOffset || speed > minVelocity)) {
          dismiss();
          return;
        }
        animate(y, 0, RETURN_TRANSITION);
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
    [y],
  );

  return { y, start };
}
