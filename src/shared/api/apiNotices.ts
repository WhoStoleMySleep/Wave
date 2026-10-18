import { isConnectivityOffline } from "@/features/connectivity";
import { createTranslatorSync, getStoredLocale } from "@/languages";
import { showToast } from "@/shared/ui/Toast";
import { log } from "@/shared/utils/logger";

export type ConnectionFailure = "timeout" | "network";

function translate(key: string): string {
  try {
    return createTranslatorSync(getStoredLocale())(key);
  } catch (error) {
    log("yellow", "api", `translation failed for ${key}`, error);
    return key;
  }
}

const CONNECTION_TITLES: Record<ConnectionFailure, string> = {
  timeout: "common.error_timeout_title",
  network: "common.error_network_title",
};

/** The offline banner already explains the outage, so a toast per failed request would only add noise. */
export function noticeConnectionFailure(failure: ConnectionFailure): void {
  if (isConnectivityOffline()) return;
  showToast(translate(CONNECTION_TITLES[failure]), "error", {
    id: `network-${failure}-toast`,
    description: translate("common.error_network"),
  });
}

export function noticeServerError(status: number): void {
  showToast(translate("common.error_server_title"), "error", {
    id: `server-error-${status}`,
    description: translate("common.error_server"),
  });
}
