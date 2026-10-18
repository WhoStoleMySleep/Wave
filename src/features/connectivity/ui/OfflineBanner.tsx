import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { WifiOffLine, Refresh2Line } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { useDownloadStore } from "@/features/downloads";
import { useConnectivityStore } from "../store/connectivityStore";

const DOWNLOADS_PATH = "/library/playlist?id=downloads";

/**
 * Quiet notice that the server is out of reach. It never blocks the app:
 * downloads, the library and cached pages stay usable, and the notice goes
 * away by itself once a request or a recovery check gets through.
 */
export default function OfflineBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const offline = useConnectivityStore((s) => s.tripped);
  const probing = useConnectivityStore((s) => s.probing);
  const probe = useConnectivityStore((s) => s.probe);
  const hasDownloads = useDownloadStore((s) => Object.keys(s.records).length > 0);
  const onDownloads = location.pathname + location.search === DOWNLOADS_PATH;

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          role="status"
          className="pointer-events-none absolute inset-x-0 bottom-3 z-[35] flex justify-center px-3"
        >
          <div
            className="pointer-events-auto flex h-[34px] items-center gap-[6px] rounded-full border border-bg-elevated bg-bg-panel/90 pl-[12px] pr-[4px] text-[13px] text-text-secondary shadow-sm backdrop-blur-md"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            <WifiOffLine size={15} className="shrink-0 text-text-tertiary" />
            <span className="whitespace-nowrap">{t("connectivity.offline")}</span>
            {hasDownloads && !onDownloads && (
              <button
                type="button"
                onClick={() => navigate(DOWNLOADS_PATH)}
                className="h-[26px] whitespace-nowrap rounded-full border-0 bg-bg-elevated px-[10px] text-[12.5px] font-[500] text-text-primary transition-colors hover:bg-bg-primary cursor-pointer"
              >
                {t("downloads.title")}
              </button>
            )}
            <button
              type="button"
              onClick={() => void probe()}
              disabled={probing}
              aria-label={t("connectivity.retry")}
              title={t("connectivity.retry")}
              className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-0 bg-transparent text-text-tertiary transition-colors hover:bg-bg-elevated hover:text-text-primary cursor-pointer disabled:cursor-default"
            >
              <Refresh2Line size={15} className={probing ? "animate-spin" : undefined} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
