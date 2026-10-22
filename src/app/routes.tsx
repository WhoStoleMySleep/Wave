import { Routes, Route, Navigate } from "react-router-dom";
import HomePage from "@/features/home/ui/HomePage";
import LibraryPage from "@/features/library/ui/LibraryPage";
import PlaylistPage from "@/features/library/ui/PlaylistPage";
import ArtistPage from "@/features/artist/ui/ArtistPage";
import CollectionPage from "@/features/collection/ui/CollectionPage";
import LoginPage from "@/features/auth/ui/LoginPage";
import PlayerPage from "@/features/player/ui/FullscreenPlayer";
import { CapsulePage, HistoryPage, TopArtistsPage, TopTracksPage } from "@/features/stats";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/library/playlist" element={<PlaylistPage />} />
      <Route path="/artist" element={<ArtistPage />} />
      <Route path="/collection" element={<CollectionPage />} />
      <Route path="/capsule" element={<CapsulePage />} />
      <Route path="/capsule/artists" element={<TopArtistsPage />} />
      <Route path="/capsule/tracks" element={<TopTracksPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/settings" element={<Navigate to="/" replace />} />
      <Route path="/player" element={<PlayerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
