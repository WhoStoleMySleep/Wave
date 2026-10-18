/** Builds a path with every interpolated value URL-encoded, so an id can never break out of its segment. */
export function apiPath(strings: TemplateStringsArray, ...params: string[]): string {
  return strings.reduce((path, part, index) => path + encodeURIComponent(params[index - 1]) + part);
}

export type QueryValue = string | number | undefined | null;

/** Appends the query; parameters left undefined, null or empty are omitted so the server uses its defaults. */
export function withQuery(path: string, params: Record<string, QueryValue>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
}
