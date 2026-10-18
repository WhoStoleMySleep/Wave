import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";

type Listener = (event: { request?: Request; respondWith?: (r: Promise<Response>) => void; waitUntil?: (p: Promise<unknown>) => void }) => void;

const SOURCE = readFileSync(resolve(__dirname, "../../../public/cover-sw.js"), "utf8");
const COVER = "https://lh3.googleusercontent.com/cover=w544-h544";
const MAX_ENTRIES = 600;
const TRIM_EVERY = 25;

function fakeCache() {
  const entries = new Map<string, Response>();
  return {
    entries,
    match: vi.fn(async (url: string) => entries.get(url)?.clone()),
    put: vi.fn(async (url: string, response: Response) => void entries.set(url, response)),
    keys: vi.fn(async () => [...entries.keys()].map((url) => new Request(url))),
    delete: vi.fn(async (request: Request) => entries.delete(request.url)),
  };
}

function loadWorker(fetchImpl: (request: Request) => Promise<Response>) {
  const listeners = new Map<string, Listener>();
  const cache = fakeCache();
  const self = { addEventListener: (type: string, listener: Listener) => listeners.set(type, listener), skipWaiting: vi.fn(), clients: { claim: vi.fn() } };
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => []), delete: vi.fn() };
  const fetch = vi.fn(fetchImpl);
  new Function("self", "caches", "fetch", SOURCE)(self, caches, fetch);

  const request = (url: string): Promise<Response> | undefined => {
    let response: Promise<Response> | undefined;
    listeners.get("fetch")?.({ request: new Request(url), respondWith: (r) => (response = r) });
    return response;
  };
  return { request, cache, fetch };
}

function corsImage(): Response {
  return new Response("image-bytes", { status: 200, headers: { "content-type": "image/jpeg" } });
}

describe("cover service worker", () => {
  it("leaves requests to other hosts to the network", () => {
    const { request } = loadWorker(async () => corsImage());
    expect(request("https://wave.wms/api/tracks")).toBeUndefined();
  });

  it("serves a cover from the cache once it was fetched", async () => {
    const { request, fetch } = loadWorker(async () => corsImage());
    expect(await (await request(COVER))!.text()).toBe("image-bytes");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    expect(await (await request(COVER))!.text()).toBe("image-bytes");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shares one network request between simultaneous requests for a cover", async () => {
    const { request, fetch } = loadWorker(async () => corsImage());
    const bodies = await Promise.all([request(COVER)!, request(COVER)!].map(async (r) => (await r).text()));
    expect(bodies).toEqual(["image-bytes", "image-bytes"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not cache opaque responses", async () => {
    const opaque = { ok: true, status: 200, type: "opaque", clone: () => opaque } as unknown as Response;
    const { request, cache } = loadWorker(async () => opaque);
    await request(COVER);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("goes back to the network after a failed request instead of reusing it", async () => {
    const { request, fetch } = loadWorker(async () => corsImage());
    fetch.mockRejectedValueOnce(new TypeError("offline"));

    await expect(request(COVER)).rejects.toThrow("offline");
    expect((await request(COVER))!.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("trims the cache down to its limit, dropping the oldest covers", async () => {
    const { request, cache } = loadWorker(async () => corsImage());
    for (let i = 0; i < MAX_ENTRIES; i++) cache.entries.set(`https://i.ytimg.com/old/${i}`, corsImage());

    for (let i = 0; i < TRIM_EVERY; i++) await request(`https://i.scdn.co/image/${i}`);

    await vi.waitFor(() => expect(cache.entries.size).toBe(MAX_ENTRIES));
    expect(cache.entries.has("https://i.ytimg.com/old/0")).toBe(false);
    expect(cache.entries.has(`https://i.scdn.co/image/${TRIM_EVERY - 1}`)).toBe(true);
  });

  it("does not cache failed responses", async () => {
    const { request, cache } = loadWorker(async () => new Response("", { status: 404 }));
    expect((await request(COVER))!.status).toBe(404);
    expect(cache.put).not.toHaveBeenCalled();
  });
});
