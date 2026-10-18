import { useMemo } from "react";
import { LuDownload, LuX } from "react-icons/lu";
import { CheckLine } from "@mingcute/react";
import Button from "@/shared/ui/Button";
import { useTranslation } from "@/languages";
import type { Track } from "@/shared/types";
import { useDownloadStore } from "../store/downloadStore";

interface DownloadAllButtonProps {
  collectionId: string;
  tracks: Track[];
  glass?: boolean;
}

/**
 * Downloads a collection and keeps it downloaded: tracks added later follow on their own.
 * While tracks are pending a click cancels them; once everything is stored a click stops following
 * new tracks and keeps the downloaded ones.
 */
export default function DownloadAllButton({ collectionId, tracks, glass }: DownloadAllButtonProps) {
  const { t } = useTranslation();
  const records = useDownloadStore((s) => s.records);
  const statuses = useDownloadStore((s) => s.statuses);
  const followed = useDownloadStore((s) => s.autoCollections.includes(collectionId));
  const followCollection = useDownloadStore((s) => s.followCollection);
  const unfollowCollection = useDownloadStore((s) => s.unfollowCollection);

  const { done, pending } = useMemo(() => {
    let done = 0;
    let pending = 0;
    for (const track of tracks) {
      if (records[track.id]) done += 1;
      else if (statuses[track.id] === "queued" || statuses[track.id] === "downloading") pending += 1;
    }
    return { done, pending };
  }, [tracks, records, statuses]);

  const allDone = tracks.length > 0 && done === tracks.length;
  const isDownloading = pending > 0;
  const stops = isDownloading || (followed && allDone);

  const title = isDownloading
    ? `${t("downloads.progress", { done, total: tracks.length })} · ${t("downloads.cancel")}`
    : followed && allDone
      ? t("downloads.auto_on")
      : allDone
        ? t("downloads.all_downloaded")
        : t("downloads.download_all");

  const handleClick = () => {
    if (stops) unfollowCollection(collectionId, tracks);
    else followCollection(collectionId, tracks);
  };

  return (
    <Button
      variant={glass ? "glass-action" : "outline"}
      onClick={handleClick}
      disabled={tracks.length === 0}
      className="group !h-[36px] !w-[36px] shrink-0 !p-0 flex items-center justify-center text-text-primary"
      title={title}
      aria-label={title}
      aria-pressed={followed}
    >
      {isDownloading ? (
        <>
          <span className="text-[10px] font-[600] tabular-nums group-hover:hidden">
            {Math.round((done / tracks.length) * 100)}%
          </span>
          <LuX size={16} className="hidden group-hover:block" />
        </>
      ) : allDone ? (
        <CheckLine size={16} className={followed ? "text-emerald-400" : "text-text-secondary"} />
      ) : (
        <LuDownload size={16} />
      )}
    </Button>
  );
}
