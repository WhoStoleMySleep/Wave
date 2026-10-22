import { accountEndpoints } from "./endpoints/account";
import { catalogEndpoints } from "./endpoints/catalog";
import { importEndpoints } from "./endpoints/imports";
import { libraryEndpoints } from "./endpoints/library";
import { playbackEndpoints } from "./endpoints/playback";
import { playlistEndpoints } from "./endpoints/playlists";
import { statsEndpoints } from "./endpoints/stats";

export { ApiError, resolveApiErrorMessage } from "./apiError";
export { mediaUrl, toMaxQualityAvatarUrl } from "./media";
export type { RadioOptions } from "./endpoints/catalog";
export type { StatsPeriod } from "./endpoints/stats";

export type * from "../contracts";

export const api = {
  ...accountEndpoints,
  ...catalogEndpoints,
  ...libraryEndpoints,
  ...playlistEndpoints,
  ...importEndpoints,
  ...playbackEndpoints,
  ...statsEndpoints,
};
