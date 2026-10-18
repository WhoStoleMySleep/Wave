const DELAYS = ["-0.3s", "-0.75s", "-0.5s"];

/** Bars on the track that is playing now; they freeze while it is paused. */
export default function NowPlayingBars({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex h-[14px] items-end gap-[2px] ${playing ? "now-playing-bars--playing" : ""} ${className ?? ""}`}
    >
      {DELAYS.map((delay) => (
        <span
          key={delay}
          className="now-playing-bar h-full w-[3px] rounded-[1px] bg-accent-primary"
          style={{ animationDelay: delay }}
        />
      ))}
    </span>
  );
}
