import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CellphoneLine, CloseLine, ComputerLine } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { useConnectivityStore } from "@/features/connectivity";
import { usePlayerStore } from "@/features/player";
import { devicesLink } from "../lib/devicesLink";
import { currentTrackOf } from "../lib/nowPlaying";
import { useDevicesStore } from "../store/devicesStore";

const PHONES = new Set(["android", "ios"]);

/**
 * Offers to go on here with what another device of the user plays. It shows only
 * while this device is silent, so it never interrupts what plays here.
 */
export default function HandoffBanner() {
  const { t } = useTranslation();
  const devices = useDevicesStore((s) => s.devices);
  const offline = useConnectivityStore((s) => s.tripped);
  const playingHere = usePlayerStore((s) => s.status === "playing" || s.status === "loading");
  const [dismissed, setDismissed] = useState<string | null>(null);

  const source = devices.find((device) => device.nowPlaying?.playing);
  const track = source?.nowPlaying ? currentTrackOf(source.nowPlaying) : undefined;
  const key = source && track ? `${source.deviceId}:${track.id}` : null;
  const visible = Boolean(source && track) && !playingHere && !offline && key !== dismissed;
  const DeviceIcon = source && PHONES.has(source.platform) ? CellphoneLine : ComputerLine;

  return (
    <AnimatePresence>
      {visible && source && track && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          role="status"
          className="pointer-events-none absolute inset-x-0 bottom-3 z-[35] flex justify-center px-3"
        >
          <div
            className="pointer-events-auto flex h-[40px] max-w-full items-center gap-[8px] rounded-full border border-bg-elevated bg-bg-panel/90 pl-[12px] pr-[4px] text-[13px] text-text-secondary shadow-sm"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            <DeviceIcon size={16} className="shrink-0 text-accent-primary" />
            <span className="min-w-0 truncate">
              <span className="font-[600] text-text-primary">{track.title}</span>
              {" · "}
              {t("devices.playing_on", { device: source.name })}
            </span>
            <button
              type="button"
              onClick={() => devicesLink.takeOver(source)}
              className="h-[30px] shrink-0 whitespace-nowrap rounded-full border-0 bg-bg-elevated px-[12px] text-[12.5px] font-[600] text-text-primary transition-colors hover:bg-bg-primary cursor-pointer"
            >
              {t("devices.take_over")}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(key)}
              aria-label={t("common.close")}
              title={t("common.close")}
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-text-tertiary transition-colors hover:bg-bg-elevated hover:text-text-primary cursor-pointer"
            >
              <CloseLine size={15} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
