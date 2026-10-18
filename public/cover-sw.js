const CACHE_NAME = "wave-covers-v2";
const MAX_ENTRIES = 600;
const TRIM_EVERY = 25;

const COVER_HOST_SUFFIXES = ["googleusercontent.com", "ggpht.com", "ytimg.com", "scdn.co"];

const inFlight = new Map();
let savesSinceTrim = 0;

function isCoverRequest(request) {
  if (request.method !== "GET") return false;
  const { hostname } = new URL(request.url);
  return COVER_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

async function trim(cache) {
  const keys = await cache.keys();
  const oldest = keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES));
  await Promise.all(oldest.map((key) => cache.delete(key)));
}

async function save(cache, url, response) {
  if (!response.ok || response.type === "opaque") return;
  await cache.put(url, response);
  savesSinceTrim += 1;
  if (savesSinceTrim < TRIM_EVERY) return;
  savesSinceTrim = 0;
  await trim(cache);
}

function logSaveError(url, error) {
  console.warn("cover-sw: saving a cover failed", url, error);
}

async function fetchAndSave(request, cache) {
  try {
    const response = await fetch(request);
    save(cache, request.url, response.clone()).catch((error) => logSaveError(request.url, error));
    return response;
  } finally {
    inFlight.delete(request.url);
  }
}

async function fetchOnce(request, cache) {
  const pending = inFlight.get(request.url) ?? fetchAndSave(request, cache);
  inFlight.set(request.url, pending);
  const response = await pending;
  return response.clone();
}

async function respond(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request.url, { ignoreVary: true });
  return cached ?? fetchOnce(request, cache);
}

async function activate() {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
  await self.clients.claim();
}

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));

self.addEventListener("activate", (event) => event.waitUntil(activate()));

self.addEventListener("fetch", (event) => {
  if (isCoverRequest(event.request)) event.respondWith(respond(event.request));
});
