import { useState, type ReactNode } from "react";
import CoverImage from "@/features/covers/ui/CoverImage";
import { useIsContentTransparent } from "@/features/settings/store/customizationStore";
import { StickyHeader } from "@/shared/ui";

export const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

/** Past this scroll the sticky header shows the page title. */
const TITLE_AFTER_PX = 72;
/** Stands in for the number inside a translated sentence, so the number can be styled apart. */
const VALUE_MARK = "\u0000";

export function useCardClass(): string {
  const hasCustomBg = useIsContentTransparent();
  return hasCustomBg ? "apple-glass-static rounded-2xl" : "bg-bg-elevated rounded-2xl";
}

export function StatsPage({ title, fallbackBackRoute = "/", children }: { title: string; fallbackBackRoute?: string; children: ReactNode }) {
  const [isScrolled, setIsScrolled] = useState(false);
  return (
    <div className="relative h-full w-full overflow-hidden bg-transparent">
      <div
        className="relative h-full w-full overflow-y-auto overflow-x-hidden"
        onScroll={(event) => {
          const next = event.currentTarget.scrollTop > TITLE_AFTER_PX;
          setIsScrolled((current) => (current === next ? current : next));
        }}
      >
        <StickyHeader isScrolled={isScrolled} title={isScrolled ? title : undefined} fallbackBackRoute={fallbackBackRoute} />
        <div className="mx-auto w-full max-w-[760px] px-8 max-md:px-4 pt-[64px] pb-[40px]">{children}</div>
      </div>
    </div>
  );
}

export function ArtistAvatar({
  name,
  url,
  className = "",
  letterClass = "text-[20px]",
}: {
  name: string;
  url?: string;
  className?: string;
  letterClass?: string;
}) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-full bg-bg-panel flex items-center justify-center ${className}`}>
      {url ? (
        <CoverImage src={url} alt={name} fill sizes="256px" className="object-cover" draggable={false} />
      ) : (
        <span className={`text-text-tertiary font-[600] select-none ${letterClass}`} style={font} aria-hidden>
          {name.charAt(0).toLocaleUpperCase()}
        </span>
      )}
    </div>
  );
}

/**
 * A translated sentence with its number styled apart. The translation puts
 * `{value}` where the number goes and still gets `count` for its plural form.
 */
export function HighlightedText({
  translate,
  value,
  highlightClass,
}: {
  translate: (value: string) => string;
  value: string;
  highlightClass: string;
}) {
  const [before, after = ""] = translate(VALUE_MARK).split(VALUE_MARK);
  return (
    <>
      {before}
      <span className={highlightClass}>{value}</span>
      {after}
    </>
  );
}

export function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-border-alpha-14 ${className}`} />;
}
