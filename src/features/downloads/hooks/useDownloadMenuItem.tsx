import { useMemo } from "react";
import { LuDownload, LuCircleX, LuTrash2 } from "react-icons/lu";
import type { DropdownMenuItem } from "@/shared/ui/DropdownMenu";
import { useTranslation } from "@/languages";
import type { Track } from "@/shared/types";
import { useDownloadStore, useTrackDownloadState } from "../store/downloadStore";

/** Context menu entry that downloads, cancels or removes a single track. */
export function useDownloadMenuItem(track: Track | null): DropdownMenuItem | null {
  const { t } = useTranslation();
  const { status } = useTrackDownloadState(track?.id);

  return useMemo(() => {
    if (!track?.id) return null;
    const store = useDownloadStore.getState();

    if (status === "done") {
      return {
        id: "remove-download",
        label: t("downloads.remove"),
        icon: <LuTrash2 size={15} />,
        onClick: () => void store.remove([track.id]),
      };
    }
    if (status === "queued" || status === "downloading") {
      return {
        id: "cancel-download",
        label: t("downloads.cancel"),
        icon: <LuCircleX size={15} />,
        onClick: () => void store.remove([track.id]),
      };
    }
    return {
      id: "download",
      label: status === "error" ? t("downloads.retry") : t("downloads.download"),
      icon: <LuDownload size={15} />,
      onClick: () => store.download([track]),
    };
  }, [track, status, t]);
}
