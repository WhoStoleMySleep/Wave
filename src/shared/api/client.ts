import {
  isConnectivityFailure,
  recordConnectivityFailure,
  recordConnectivitySuccess,
  statusOf,
  stripQuery,
} from "@/features/connectivity";
import { ApiError, apiErrorFrom, isServerError } from "./apiError";
import { noticeServerError } from "./apiNotices";
import { getAuthSession, getSessionExpiryMs, getValidAccessToken, refreshAuthSession } from "./auth-session";
import { getApiBaseUrl } from "./baseUrl";
import { DEFAULT_TIMEOUT_MS, fetchWithin } from "./deadline";

const HTTP_UNAUTHORIZED = 401;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
  anonymous?: boolean;
  timeoutMs?: number;
}

interface Call {
  path: string;
  method: HttpMethod;
  body: string | undefined;
  options: RequestOptions;
  startedAt: number;
}

function sessionExpired(): ApiError {
  return new ApiError(0, "Could not refresh the session", "NETWORK_ERROR");
}

async function accessToken(): Promise<string | null> {
  const token = await getValidAccessToken();
  if (token) return token;
  const session = getAuthSession();
  if (!session?.accessToken) return null;
  const expiresAt = getSessionExpiryMs(session);
  if (expiresAt && expiresAt > Date.now()) return session.accessToken;
  throw sessionExpired();
}

async function tokenAfterRejection(rejected: string | null): Promise<string | null> {
  const session = getAuthSession();
  if (session?.accessToken && session.accessToken !== rejected) return session.accessToken;
  if (!session?.refreshToken) return null;
  const refreshed = await refreshAuthSession();
  if (refreshed?.accessToken) return refreshed.accessToken;
  if (getAuthSession()?.refreshToken) throw sessionExpired();
  return null;
}

function headersFor(body: string | undefined, token: string | null): Record<string, string> {
  return {
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function recordFailure(call: Call, error: unknown): void {
  if (!isConnectivityFailure(error)) return;
  const code = error instanceof ApiError ? error.code : undefined;
  recordConnectivityFailure({
    method: call.method,
    path: stripQuery(call.path),
    status: statusOf(error),
    latencyMs: Math.round(performance.now() - call.startedAt),
    ...(code ? { code } : {}),
  });
}

async function send(call: Call, token: string | null): Promise<Response> {
  const init = { method: call.method, body: call.body, signal: call.options.signal, headers: headersFor(call.body, token) };
  try {
    return await fetchWithin(getApiBaseUrl() + call.path, init, call.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  } catch (error) {
    recordFailure(call, error);
    throw error;
  }
}

async function sendAuthorized(call: Call): Promise<Response> {
  if (call.options.anonymous) return send(call, null);
  const token = await accessToken();
  const response = await send(call, token);
  if (response.status !== HTTP_UNAUTHORIZED) return response;
  const retryToken = await tokenAfterRejection(token);
  return retryToken ? send(call, retryToken) : response;
}

async function failure(call: Call, response: Response): Promise<ApiError> {
  if (isServerError(response.status)) noticeServerError(response.status);
  const error = await apiErrorFrom(response);
  recordFailure(call, error);
  return error;
}

async function fetchApi(path: string, options: RequestOptions): Promise<Response> {
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const call: Call = { path, method: options.method ?? "GET", body, options, startedAt: performance.now() };
  const response = await sendAuthorized(call);
  if (!response.ok) throw await failure(call, response);
  recordConnectivitySuccess();
  return response;
}

const inFlightReads = new Map<string, Promise<unknown>>();

/** Identical reads issued while one is in flight share it; a read with its own signal may be cancelled, so it runs alone. */
export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const read = async () => (await fetchApi(path, options)).json() as Promise<T>;
  if ((options.method ?? "GET") !== "GET" || options.signal) return read();
  const key = `${path}::${options.anonymous ? "anonymous" : "user"}`;
  const pending = inFlightReads.get(key);
  if (pending) return pending as Promise<T>;
  const promise = read().finally(() => inFlightReads.delete(key));
  inFlightReads.set(key, promise);
  return promise;
}

export async function requestNoContent(path: string, options: RequestOptions = {}): Promise<void> {
  await fetchApi(path, options);
}

/**
 * Opens a long-lived event stream; it has no deadline because lyrics keep arriving while providers answer.
 * @throws ApiError when the server refuses the stream
 */
export async function openEventStream(path: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const headers = headersFor(undefined, await getValidAccessToken());
  const response = await fetch(getApiBaseUrl() + path, { headers, signal });
  if (!response.ok || !response.body) throw new ApiError(response.status, response.statusText);
  return response.body;
}
