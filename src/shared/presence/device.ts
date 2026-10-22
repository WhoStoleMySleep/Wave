const DEVICE_ID_KEY = "wave_device_id";

const PLATFORM_NAMES: Record<string, string> = {
  android: "Android",
  ios: "iPhone",
  macos: "Mac",
  windows: "Windows",
  linux: "Linux",
  desktop: "Desktop",
};

/** Android reports itself as Linux too, so it is asked about first. */
export function getPlatform(): string {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("android")) return "android";
  if (ua.includes("iphone") || ua.includes("ipad")) return "ios";
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "desktop";
}

export function getDeviceName(platform = getPlatform()): string {
  return PLATFORM_NAMES[platform] ?? PLATFORM_NAMES.desktop;
}

/** Stays the same across launches, so a reconnecting device takes its own place on the server. */
export function getDeviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_ID_KEY);
    if (saved) return saved;
    const created = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}
