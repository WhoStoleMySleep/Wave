import { useMemo } from "react";
import { LuDownload } from "react-icons/lu";
import { CheckLine } from "@mingcute/react";
import Button from "@/shared/ui/Button";
import { useTranslation } from "@/languages";
import type { Track } from "@/shared/types";
import { useDownloadStore } from "../store/downloadStore";

interface DownloadAllButtonProps {
  tracks: Track[];
  glass?: boolean;
}

/** Square action that downloads every missing track of a collection and shows overall progress. */
export default function DownloadAllButton({ tracks, glass }: DownloadAllButtonProps) {
  const { t } = useTranslation();
  const records = useDownloadStore((s) => s.records);
  const statuses = useDownloadStore((s) => s.statuses);
  const download = useDownloadStore((s) => s.download);

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
  const title = allDone
    ? t("downloads.all_downloaded")
    : pending > 0
      ? t("downloads.progress", { done, total: tracks.length })
      : t("downloads.download_all");

  return (
    <Button
      variant={glass ? "glass-action" : "outline"}
      onClick={() => download(tracks)}
      disabled={tracks.length === 0 || allDone || pending > 0}
      className="!h-[36px] !w-[36px] shrink-0 !p-0 flex items-center justify-center text-text-primary"
      title={title}
      aria-label={title}
    >
      {allDone ? (
        <CheckLine size={16} className="text-emerald-400" />
      ) : pending > 0 ? (
        <span className="text-[10px] font-[600] tabular-nums">
          {Math.round((done / tracks.length) * 100)}%
        </span>
      ) : (
        <LuDownload size={16} />
      )}
    </Button>
  );
}
