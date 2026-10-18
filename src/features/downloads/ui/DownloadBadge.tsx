import { memo } from "react";
import { DownloadFill } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { useTrackDownloadState } from "../store/downloadStore";

const RING_RADIUS = 5;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Inline marker next to a track's artists: progress ring while downloading, icon once offline. */
function DownloadBadge({ trackId }: { trackId?: string }) {
  const { t } = useTranslation();
  const { status, progress } = useTrackDownloadState(trackId);

  if (status === "done") {
    return (
      <span
        className="mr-[6px] flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
        title={t("downloads.downloaded")}
      >
        <DownloadFill size={9} />
      </span>
    );
  }

  if (status === "queued" || status === "downloading") {
    return (
      <svg
        width={14}
        height={14}
        viewBox="0 0 14 14"
        className={`mr-[6px] shrink-0 -rotate-90 ${status === "queued" ? "animate-pulse" : ""}`}
        aria-label={t("downloads.downloading")}
      >
        <circle cx={7} cy={7} r={RING_RADIUS} fill="none" strokeWidth={2} className="stroke-border-alpha-33" />
        <circle
          cx={7}
          cy={7}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          className="stroke-emerald-500 transition-[stroke-dashoffset] duration-200"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - progress)}
        />
      </svg>
    );
  }

  return null;
}

export default memo(DownloadBadge);
