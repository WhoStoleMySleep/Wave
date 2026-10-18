import { describe, it, expect, beforeEach, vi } from "vitest";
import { useUpdaterStore } from "./updaterStore";

describe("updaterStore", () => {
  beforeEach(() => {
    useUpdaterStore.getState().reset();
    vi.restoreAllMocks();
  });

  it("handles check for updates when update is available", async () => {
    window.waveNative = {
      checkForUpdates: vi.fn().mockResolvedValue({
        available: true,
        version: "0.1.28",
        releaseNotes: "New features and bug fixes",
      }),
    } as any;

    await useUpdaterStore.getState().checkForUpdates();

    const state = useUpdaterStore.getState();
    expect(state.status).toBe("available");
    expect(state.isDialogOpen).toBe(true);
    expect(state.updateInfo?.version).toBe("0.1.28");
    expect(state.updateInfo?.releaseNotes).toBe("New features and bug fixes");
  });

  it("handles skipping an update", async () => {
    window.waveNative = {
      checkForUpdates: vi.fn().mockResolvedValue({
        available: true,
        version: "0.1.28",
      }),
    } as any;

    await useUpdaterStore.getState().checkForUpdates();
    expect(useUpdaterStore.getState().isDialogOpen).toBe(true);

    useUpdaterStore.getState().skipUpdate();
    expect(useUpdaterStore.getState().isDialogOpen).toBe(false);
    expect(useUpdaterStore.getState().dismissedVersion).toBe("0.1.28");

    // checking again shouldn't pop open the dialog if already dismissed
    await useUpdaterStore.getState().checkForUpdates();
    expect(useUpdaterStore.getState().isDialogOpen).toBe(false);
  });

  it("initiates download and tracks status transitions", async () => {
    const downloadMock = vi.fn().mockResolvedValue({ success: true });
    window.waveNative = {
      downloadUpdate: downloadMock,
    } as any;

    useUpdaterStore.setState({
      status: "available",
      isDialogOpen: true,
      updateInfo: { version: "0.1.28" },
    });

    await useUpdaterStore.getState().startDownload();

    expect(downloadMock).toHaveBeenCalledTimes(1);
    const state = useUpdaterStore.getState();
    expect(state.status).toBe("downloading");
    expect(state.isDialogOpen).toBe(false);
  });

  it("triggers quit and install action", async () => {
    const installMock = vi.fn().mockResolvedValue(true);
    window.waveNative = {
      quitAndInstall: installMock,
    } as any;

    useUpdaterStore.setState({
      status: "downloaded",
      updateInfo: { version: "0.1.28" },
    });

    await useUpdaterStore.getState().installUpdate();
    expect(installMock).toHaveBeenCalledTimes(1);
  });

  it("reports a failed install", async () => {
    window.waveNative = { quitAndInstall: vi.fn().mockRejectedValue(new Error("locked")) } as any;
    await useUpdaterStore.getState().installUpdate();
    expect(useUpdaterStore.getState()).toMatchObject({ status: "error", error: "locked" });
  });

  it("keeps the notes but takes the downloaded version", () => {
    let downloaded: (info: { version: string }) => void = () => {};
    window.waveNative = {
      onUpdateDownloaded: (callback: typeof downloaded) => {
        downloaded = callback;
        return () => {};
      },
    } as any;
    useUpdaterStore.setState({ updateInfo: { version: "0.1.27", releaseNotes: "notes" } });
    const stop = useUpdaterStore.getState().initUpdaterListeners();
    downloaded({ version: "0.1.28" });
    expect(useUpdaterStore.getState()).toMatchObject({ status: "downloaded", updateInfo: { version: "0.1.28", releaseNotes: "notes" } });
    stop();
  });

  it("does not reopen the dialog for a skipped version announced again", () => {
    let available: (info: { version: string }) => void = () => {};
    window.waveNative = {
      onUpdateAvailable: (callback: typeof available) => {
        available = callback;
        return () => {};
      },
    } as any;
    useUpdaterStore.setState({ dismissedVersion: "0.1.28" });
    useUpdaterStore.getState().initUpdaterListeners();
    available({ version: "0.1.28" });
    expect(useUpdaterStore.getState()).toMatchObject({ status: "available", isDialogOpen: false });
  });
});
