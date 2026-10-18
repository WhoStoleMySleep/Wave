import { useEffect, useRef, useState } from "react";
import { KawarpEngine, type KawarpOptions } from "../engine/kawarpEngine";
import { getCoverElement, useCoverElement } from "@/features/covers";

const ENGINE_OPTIONS: KawarpOptions = {
  warpIntensity: 1.1,
  blurPasses: 8,
  transitionDuration: 1000,
  animationSpeed: 1,
  saturation: 1.3,
  scale: 1.18,
  dithering: 0.008,
};

interface KawarpWrapperProps {
  src?: string;
  onLoad?: () => void;
  onError?: (err: Error) => void;
}

/**
 * Each mount gets its own canvas: dispose loses the WebGL context, and a canvas keeps returning
 * that lost context, so a remount on the same one could not draw. The canvas ignores device pixel
 * ratio because the image is blurred beyond any pixel density and extra pixels only cost fill rate.
 */
export function KawarpWrapper({ src, onLoad, onError }: KawarpWrapperProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<KawarpEngine | null>(null);
  const [loaded, setLoaded] = useState(false);
  const coverElement = useCoverElement(src);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 w-full h-full block";
    container.appendChild(canvas);

    const engine = KawarpEngine.create(canvas, ENGINE_OPTIONS);
    if (engine instanceof Error) {
      canvas.remove();
      onError?.(engine);
      return;
    }
    engineRef.current = engine;

    const fitCanvas = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      engine.resize();
    };
    const resizeObserver = new ResizeObserver(fitCanvas);
    resizeObserver.observe(container);
    fitCanvas();

    const syncWithVisibility = () => (document.hidden ? engine.stop() : engine.start());
    syncWithVisibility();
    document.addEventListener("visibilitychange", syncWithVisibility);

    return () => {
      document.removeEventListener("visibilitychange", syncWithVisibility);
      resizeObserver.disconnect();
      engine.dispose();
      engineRef.current = null;
      canvas.remove();
    };
  }, [onError]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !src) return;

    let isCancelled = false;
    const element = coverElement || getCoverElement(src);

    void engine.loadImage(src, element).then((error) => {
      if (isCancelled) return;
      if (error) {
        onError?.(error);
        return;
      }
      setLoaded(true);
      onLoad?.();
    });

    return () => {
      isCancelled = true;
    };
  }, [src, coverElement, onLoad, onError]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 pointer-events-none overflow-hidden transition-opacity duration-500 ${
        loaded ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}

export default KawarpWrapper;
