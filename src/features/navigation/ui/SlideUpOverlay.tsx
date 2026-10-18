import { useEffect, useState, type ReactNode } from "react";
import { motion, useIsPresent } from "framer-motion";

const HIDDEN = { transform: "translateY(100%)" };
const SHOWN = { transform: "translateY(0%)" };

interface SlideUpOverlayProps {
  children: ReactNode;
  className?: string;
  /** Called when the slide has finished: `true` once fully in, `false` once fully out. */
  onSettled: (shown: boolean) => void;
}

/**
 * Full-screen layer that slides up from the bottom edge. The slide starts only
 * after the content's first frame is painted: the animation clock runs from the
 * moment it is created, so a slow first paint would otherwise swallow most of
 * the slide and the layer would jump halfway up. Whether it is leaving comes
 * from presence, because an exiting element keeps the props of its last render.
 */
export default function SlideUpOverlay({ children, className, onSettled }: SlideUpOverlayProps) {
  const [painted, setPainted] = useState(false);
  const isPresent = useIsPresent();

  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPainted(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  return (
    <motion.div
      data-theme="dark"
      initial={HIDDEN}
      animate={painted ? SHOWN : HIDDEN}
      // while it slides away it still covers the bottom of the screen, where the finger is after a swipe
      exit={{ ...HIDDEN, pointerEvents: "none" }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={() => {
        if (painted) onSettled(isPresent);
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
