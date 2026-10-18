import { useState, useEffect } from "react";
import { useTranslation } from "@/languages";
import { usePlayerStore } from "@/features/player";
import { ToggleSwitch } from "@/shared/ui";
import { SettingRow, SettingSection, SegmentedControl } from "../controls";

const CROSSFADE_OPTIONS = [0, 3, 6, 9, 12] as const;

export function PlaybackTab({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const autoplaySimilar = usePlayerStore((state) => state.autoplaySimilar);
  const setAutoplaySimilar = usePlayerStore(
    (state) => state.setAutoplaySimilar,
  );
  const trackDoubleClickBehavior = usePlayerStore(
    (state) => state.trackDoubleClickBehavior,
  );
  const setTrackDoubleClickBehavior = usePlayerStore(
    (state) => state.setTrackDoubleClickBehavior,
  );
  const defaultPlaybackContext = usePlayerStore(
    (state) => state.defaultPlaybackContext,
  );
  const setDefaultPlaybackContext = usePlayerStore(
    (state) => state.setDefaultPlaybackContext,
  );
  const pauseOnDeviceChange = usePlayerStore(
    (state) => state.pauseOnDeviceChange,
  );
  const setPauseOnDeviceChange = usePlayerStore(
    (state) => state.setPauseOnDeviceChange,
  );

  const normalizeVolume = usePlayerStore((state) => state.normalizeVolume);
  const setNormalizeVolume = usePlayerStore(
    (state) => state.setNormalizeVolume,
  );
  const crossfadeSeconds = usePlayerStore((state) => state.crossfadeSeconds);
  const setCrossfadeSeconds = usePlayerStore(
    (state) => state.setCrossfadeSeconds,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <SettingSection>

      <SettingRow
        title={t("settings.autoplay_similar.title")}
        description={t("settings.autoplay_similar.description")}
        titleKey="settings.autoplay_similar.title"
        descKey="settings.autoplay_similar.description"
        searchQuery={searchQuery}
        control={
          <ToggleSwitch
            checked={autoplaySimilar}
            onChange={setAutoplaySimilar}
          />
        }
      />

      <SettingRow
        title={t("settings.normalize_volume.title")}
        description={t("settings.normalize_volume.description")}
        titleKey="settings.normalize_volume.title"
        descKey="settings.normalize_volume.description"
        searchQuery={searchQuery}
        control={
          <ToggleSwitch
            checked={normalizeVolume}
            onChange={setNormalizeVolume}
          />
        }
      />

      <SettingRow
        title={t("settings.crossfade.title")}
        description={t("settings.crossfade.description")}
        titleKey="settings.crossfade.title"
        descKey="settings.crossfade.description"
        searchQuery={searchQuery}
        control={
          mounted ? (
            <SegmentedControl
              ariaLabel={t("settings.crossfade.title")}
              value={String(crossfadeSeconds)}
              onChange={(value) => setCrossfadeSeconds(Number(value))}
              options={CROSSFADE_OPTIONS.map((seconds) => ({
                value: String(seconds),
                label:
                  seconds === 0
                    ? t("settings.crossfade.off")
                    : t("settings.crossfade.seconds", { count: seconds }),
              }))}
            />
          ) : (
            <span />
          )
        }
      />

      <SettingRow
        title={t("settings.track_double_click.title")}
        description={t("settings.track_double_click.description")}
        titleKey="settings.track_double_click.title"
        descKey="settings.track_double_click.description"
        searchQuery={searchQuery}
        control={
          mounted ? (
            <SegmentedControl
              ariaLabel={t("settings.track_double_click.title")}
              value={trackDoubleClickBehavior}
              onChange={setTrackDoubleClickBehavior}
              options={[
                {
                  value: "play",
                  label: t("settings.track_double_click.play"),
                },
                {
                  value: "queue",
                  label: t("settings.track_double_click.queue"),
                },
              ]}
            />
          ) : (
            <span />
          )
        }
      />

      <SettingRow
        title={t("settings.default_playback_context.title")}
        description={t("settings.default_playback_context.description")}
        titleKey="settings.default_playback_context.title"
        descKey="settings.default_playback_context.description"
        searchQuery={searchQuery}
        control={
          mounted ? (
            <SegmentedControl
              ariaLabel={t("settings.default_playback_context.title")}
              value={defaultPlaybackContext}
              onChange={setDefaultPlaybackContext}
              options={[
                {
                  value: "resume",
                  label: t("settings.default_playback_context.resume"),
                },
                {
                  value: "empty",
                  label: t("settings.default_playback_context.empty"),
                },
              ]}
            />
          ) : (
            <span />
          )
        }
      />

      <SettingRow
        title={t("settings.audio.pause_on_device_change.title")}
        description={t("settings.audio.pause_on_device_change.description")}
        titleKey="settings.audio.pause_on_device_change.title"
        descKey="settings.audio.pause_on_device_change.description"
        searchQuery={searchQuery}
        control={
          <ToggleSwitch
            checked={pauseOnDeviceChange}
            onChange={setPauseOnDeviceChange}
          />
        }
      />
    </SettingSection>
  );
}
