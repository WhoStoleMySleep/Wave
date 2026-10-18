export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;

export function isServerError(status: number): boolean {
  return status >= HTTP_SERVER_ERROR;
}

function translationKeyFor(error: ApiError): string | null {
  if (error.status === 0) return "common.error_network";
  if (error.status === HTTP_UNAUTHORIZED || error.status === HTTP_FORBIDDEN) return "common.error_session_expired";
  if (error.status === HTTP_NOT_FOUND) return "common.error_not_found";
  if (error.status === HTTP_TOO_MANY_REQUESTS) return "common.error_too_many";
  if (isServerError(error.status)) return "common.error_server";
  return null;
}

/** A localized message for the user; raw server text never reaches the UI. */
export function resolveApiErrorMessage(err: unknown, t: (key: string) => string, fallbackKey: string): string {
  const key = err instanceof ApiError ? translationKeyFor(err) : null;
  return t(key ?? fallbackKey);
}

function stringField(body: unknown, field: string): string | undefined {
  const value = (body as Record<string, unknown> | null)?.[field];
  return typeof value === "string" ? value : undefined;
}

/** wave-server answers errors with `{ code, message }`; any other body falls back to the status text. */
export async function apiErrorFrom(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  return new ApiError(response.status, stringField(body, "message") ?? response.statusText, stringField(body, "code"));
}
