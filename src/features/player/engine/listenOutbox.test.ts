import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { api, ApiError, type PlaybackEvent } from "@/shared/api";

const session = vi.hoisted(() => ({ userId: "ann" }));

vi.mock("@/shared/api/auth-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/api/auth-session")>()),
  getAuthSession: () => ({ user: { id: session.userId } }),
}));

const { ListenOutbox } = await import("./listenOutbox");

function listen(id: string): PlaybackEvent {
  return { playbackSessionId: id, listeningSessionId: "ls", trackId: `t-${id}`, playedDurationMs: 60_000, completionRate: 0.5 };
}

function sentIds(send: MockInstance<typeof api.recordPlaybackEvent>): string[] {
  return send.mock.calls.map(([event]) => event.playbackSessionId);
}

const offline = () => new ApiError(0, "Unable to reach the server", "NETWORK_ERROR");

describe("ListenOutbox", () => {
  let send: MockInstance<typeof api.recordPlaybackEvent>;

  beforeEach(() => {
    localStorage.clear();
    session.userId = "ann";
    send = vi.spyOn(api, "recordPlaybackEvent").mockResolvedValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("sends a listen right away and keeps nothing after", async () => {
    const outbox = new ListenOutbox();
    outbox.add(listen("p1"));
    await outbox.drain();
    expect(sentIds(send)).toEqual(["p1"]);
    expect(localStorage.length).toBe(0);
  });

  it("keeps listens made without network and sends them in order once it is back", async () => {
    send.mockRejectedValue(offline());
    const outbox = new ListenOutbox();
    outbox.add(listen("p1"));
    await outbox.drain();
    outbox.add(listen("p2"));
    await outbox.drain();
    expect(sentIds(send)).toEqual(["p1", "p1"]);

    send.mockClear().mockResolvedValue(undefined);
    await outbox.drain();
    expect(sentIds(send)).toEqual(["p1", "p2"]);
  });

  it("finds the waiting listens after the app starts again", async () => {
    send.mockRejectedValue(offline());
    const before = new ListenOutbox();
    before.add(listen("p1"));
    await before.drain();

    send.mockClear().mockResolvedValue(undefined);
    await new ListenOutbox().drain();
    expect(sentIds(send)).toEqual(["p1"]);
  });

  it("lets go of a listen the server refuses", async () => {
    send.mockRejectedValueOnce(new ApiError(400, "Invalid trackId"));
    const outbox = new ListenOutbox();
    outbox.add(listen("p1"));
    await outbox.drain();
    await outbox.drain();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps a listen while the session is not accepted", async () => {
    send.mockRejectedValueOnce(new ApiError(401, "Unauthorized"));
    const outbox = new ListenOutbox();
    outbox.add(listen("p1"));
    await outbox.drain();
    await outbox.drain();
    expect(sentIds(send)).toEqual(["p1", "p1"]);
  });

  it("sends a listen only to the account it was made in", async () => {
    send.mockRejectedValue(offline());
    const outbox = new ListenOutbox();
    outbox.add(listen("p1"));
    await outbox.drain();

    send.mockClear().mockResolvedValue(undefined);
    session.userId = "bob";
    await outbox.drain();
    expect(send).not.toHaveBeenCalled();
    session.userId = "ann";
    await outbox.drain();
    expect(sentIds(send)).toEqual(["p1"]);
  });
});
