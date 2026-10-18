import { describe, it, expect, vi, beforeEach } from "vitest";

const files = vi.hoisted(() => ({ stored: null as string | null, readFails: false, writes: [] as (string | null)[] }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: { value: string | null }) => {
    if (cmd === "auth_session_read") {
      if (files.readFails) throw new Error("io");
      return files.stored;
    }
    if (cmd === "auth_session_write") {
      files.writes.push(args!.value);
      files.stored = args!.value;
    }
  }),
}));

const session = (refreshToken: string) =>
  JSON.stringify({ accessToken: "a", refreshToken, accessTokenExpiresAt: "2099-01-01T00:00:00Z", user: { id: "u" } });

async function install() {
  vi.resetModules();
  const persistence = await import("./authPersistence");
  const auth = await import("@/shared/api/auth-session");
  await persistence.installAuthPersistence();
  return auth;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("installAuthPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
    files.stored = null;
    files.readFails = false;
    files.writes = [];
  });

  it("restores the rotated session the webview lost", async () => {
    localStorage.setItem("wave_auth_session", session("revoked"));
    files.stored = session("fresh");

    const auth = await install();

    expect(auth.getAuthSession()?.refreshToken).toBe("fresh");
    expect(JSON.parse(localStorage.getItem("wave_auth_session")!).refreshToken).toBe("fresh");
  });

  it("copies a session from an older build into the file", async () => {
    localStorage.setItem("wave_auth_session", session("old-build"));

    await install();

    expect(files.writes).toEqual([session("old-build")]);
  });

  it("mirrors later changes in order, including logout", async () => {
    const auth = await install();

    auth.setAuthSession(JSON.parse(session("r1")));
    auth.setAuthSession(JSON.parse(session("r2")));
    auth.setAuthSession(null);
    await flush();

    // listeners from earlier installs in this file repeat each write, so compare the sequence of distinct values
    const tokens = files.writes.map((v) => (v ? JSON.parse(v).refreshToken : null));
    expect(tokens.filter((t, i) => t !== tokens[i - 1])).toEqual(["r1", "r2", null]);
  });

  it("leaves both copies alone when the file cannot be read", async () => {
    localStorage.setItem("wave_auth_session", session("local"));
    files.stored = session("file");
    files.readFails = true;

    const auth = await install();

    expect(auth.getAuthSession()?.refreshToken).toBe("local");
    expect(files.writes).toEqual([]);
  });
});
