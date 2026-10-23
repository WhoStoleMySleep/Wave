const CATALOG_PREFIXES = ["dz:"];

/** A track from another catalog plays as a YouTube track the server matched to it, which the user may replace. */
export function isCatalogTrack(id: string | undefined): boolean {
  return !!id && CATALOG_PREFIXES.some((prefix) => id.startsWith(prefix) && id.length > prefix.length);
}
