export { useConnectivityStore, recordConnectivityFailure, recordConnectivitySuccess, isConnectivityOffline, onConnectivityRestored } from "./store/connectivityStore";
export type { FailureEntry } from "./store/connectivityStore";
export { isConnectivityFailure, isPlaybackPath, statusOf, stripQuery } from "./lib/failureKind";
export { default as OfflineBanner } from "./ui/OfflineBanner";
