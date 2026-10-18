export interface PublicUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isPublic: boolean;
  showActivity: boolean;
  showHistory: boolean;
  showLikedTracks: boolean;
  participateLeaderboards: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  user: PublicUser;
}

export interface UpdateProfileInput {
  username?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  isPublic?: boolean;
  showActivity?: boolean;
  showHistory?: boolean;
  showLikedTracks?: boolean;
  participateLeaderboards?: boolean;
}
