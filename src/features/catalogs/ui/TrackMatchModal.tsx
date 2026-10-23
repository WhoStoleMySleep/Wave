import { useCallback } from "react";
import { CheckLine, PlaylistFill } from "@mingcute/react";
import Dialog from "@/shared/ui/Dialog";
import CoverImage from "@/features/covers/ui/CoverImage";
import { useToast } from "@/shared/ui";
import { mediaUrl, type CatalogTrack } from "@/shared/api";
import { useTranslation } from "@/languages";
import { useTrackMatch } from "../hooks/useTrackMatch";
import { useTrackMatchStore } from "../store/trackMatchStore";

const SHOWN_CANDIDATES = 10;
const SKELETON_ROWS = 4;

function formatDuration(ms: number): string {
  if (ms <= 0) return "";
  const totalSeconds = Math.round(ms / 1000);
  const seconds = totalSeconds % 60;
  return `${Math.floor(totalSeconds / 60)}:${seconds < 10 ? "0" : ""}${seconds}`;
}

interface CandidateRowProps {
  candidate: CatalogTrack;
  current: boolean;
  disabled: boolean;
  currentLabel: string;
  onChoose: (candidate: CatalogTrack) => void;
}

function CandidateRow({ candidate, current, disabled, currentLabel, onChoose }: CandidateRowProps) {
  const details = [candidate.artists.map((a) => a.name).join(", "), formatDuration(candidate.durationMs)]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      disabled={disabled || current}
      onClick={() => onChoose(candidate)}
      className={`flex w-full items-center gap-[10px] p-[8px] rounded-md border text-left transition-colors ${
        current
          ? "border-border-primary bg-border-alpha-14 cursor-default"
          : "border-border-primary/60 bg-bg-primary/80 hover:bg-border-alpha-14 cursor-pointer disabled:cursor-wait"
      }`}
    >
      <span className="relative h-[38px] w-[38px] shrink-0 overflow-hidden rounded-md bg-border-alpha-14 flex items-center justify-center">
        {candidate.cover ? (
          <CoverImage
            src={mediaUrl(candidate.cover.url)}
            alt={candidate.title}
            fill
            sizes="38px"
            className="object-cover"
          />
        ) : (
          <PlaylistFill size={18} className="text-text-tertiary" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-[500] text-text-primary">{candidate.title}</span>
        <span className="truncate text-[11px] text-text-tertiary">{details}</span>
      </span>
      {current && (
        <span className="inline-flex shrink-0 items-center gap-[4px] rounded-md bg-border-alpha-14 px-[8px] py-[3px] text-[11px] text-text-secondary">
          <CheckLine size={12} />
          {currentLabel}
        </span>
      )}
    </button>
  );
}

/** Lets the user replace the YouTube track a catalog track plays as. */
export default function TrackMatchModal() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const target = useTrackMatchStore((state) => state.target);
  const close = useTrackMatchStore((state) => state.close);
  const { match, loading, error, saving, choose } = useTrackMatch(target?.id ?? null);

  const handleChoose = useCallback(
    async (candidate: CatalogTrack) => {
      if (await choose(candidate.id)) {
        toast(t("catalogs.match_saved"), "checkmark", { description: t("catalogs.match_saved_desc") });
        close();
      } else {
        toast(t("catalogs.match_save_failed"), "error");
      }
    },
    [choose, close, t, toast],
  );

  const candidates = match?.candidates.slice(0, SHOWN_CANDIDATES) ?? [];

  return (
    <Dialog open={!!target} onOpenChange={(next) => (!next ? close() : undefined)} maxWidth={480}>
      <div className="flex min-h-0 flex-col gap-[16px] px-[20px] pb-[20px]">
        <div className="flex flex-col gap-[4px]">
          <h2
            className="m-0 text-[18px] font-[500] text-text-primary"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            {t("catalogs.match_title")}
          </h2>
          <p className="m-0 truncate text-[13px] text-text-secondary">
            {target?.artists ? `${target.title} — ${target.artists}` : target?.title}
          </p>
          <p className="m-0 text-[12px] text-text-tertiary">{t("catalogs.match_desc")}</p>
        </div>

        <div className="-mx-[8px] flex max-h-[420px] min-h-[140px] flex-col gap-[6px] overflow-y-auto overscroll-contain px-[8px]">
          {loading &&
            Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <div key={i} className="flex items-center gap-[10px] p-[8px] rounded-md border border-border-primary/40">
                <div className="h-[38px] w-[38px] shrink-0 animate-pulse rounded-md bg-border-alpha-14" />
                <div className="flex flex-1 flex-col gap-[6px]">
                  <div className="h-[12px] w-[46%] animate-pulse rounded bg-border-alpha-33" />
                  <div className="h-[10px] w-[28%] animate-pulse rounded bg-border-alpha-14" />
                </div>
              </div>
            ))}
          {!loading && error && (
            <p className="m-0 py-[40px] text-center text-[13px] text-text-tertiary">{t("catalogs.match_load_failed")}</p>
          )}
          {!loading && !error && candidates.length === 0 && (
            <p className="m-0 py-[40px] text-center text-[13px] text-text-tertiary">{t("common.no_results")}</p>
          )}
          {candidates.map((candidate) => (
            <CandidateRow
              key={candidate.id}
              candidate={candidate}
              current={candidate.id === match?.youtubeId}
              disabled={saving}
              currentLabel={t("catalogs.match_current")}
              onChoose={handleChoose}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}
