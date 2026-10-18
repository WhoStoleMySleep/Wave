import type { PublicUser, UpdateProfileInput } from "../../contracts";
import { setAuthSession, type AuthTokens } from "../auth-session";
import { request } from "../client";

export interface RegistrationInput {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

async function startSession(path: string, body: object): Promise<AuthTokens> {
  const tokens = await request<AuthTokens>(path, { method: "POST", body, anonymous: true });
  setAuthSession(tokens);
  return tokens;
}

export const accountEndpoints = {
  login(email: string, password: string): Promise<AuthTokens> {
    return startSession("/v1/auth/login", { email, password });
  },

  /** Usernames are case-insensitive on the server, so they are stored lowercased. */
  register(input: RegistrationInput): Promise<AuthTokens> {
    const username = input.username.trim().toLowerCase();
    return startSession("/v1/auth/register", { ...input, username, displayName: input.displayName.trim() });
  },

  getMe(): Promise<PublicUser> {
    return request<PublicUser>("/v1/me");
  },

  updateProfile(changes: UpdateProfileInput): Promise<PublicUser> {
    return request<PublicUser>("/v1/users/me", { method: "PATCH", body: changes });
  },
};
