/**
 * Whether a stream response carries the whole file and is worth caching. A
 * 206 can cover just the first chunk, and an error page can come back as 200;
 * either one cached would sit in the store and fail on every play, and a
 * later download would pin it as complete.
 */
export function isCompleteAudioResponse(response: Response): boolean {
  const type = response.headers.get("content-type") ?? "";
  if (/^(text\/|application\/json)/i.test(type)) return false;
  if (response.status === 200) return true;
  if (response.status !== 206) return false;

  const range = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(response.headers.get("content-range") ?? "");
  if (!range) return true;
  const [, start, end, total] = range;
  return Number(start) === 0 && (total === "*" || Number(end) + 1 === Number(total));
}
