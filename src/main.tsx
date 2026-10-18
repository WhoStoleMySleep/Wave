import "./app/legacyKeysMigration";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { RootErrorBoundary } from "@/shared/ui";
import { initGlobalErrorHandlers } from "@/shared/utils/globalErrorHandlers";
import { initBackgroundStorageAnalytics } from "@/shared/utils/cacheManager";
import { installTauriBridge } from "@/platform/tauri";
import { isMobilePlatform } from "@/shared/hooks";

async function bootstrap() {
  // native bridge first: request signing and window controls read it on startup
  await installTauriBridge().catch((err) => console.error("[tauri] bridge install failed:", err));
  // the gap around the frame only makes sense for a floating desktop window
  if (isMobilePlatform()) document.body.classList.remove("p-1");

  // Initialize global uncaught error handlers and background storage tracker
  initGlobalErrorHandlers();
  initBackgroundStorageAnalytics();

  const rootElement = document.getElementById("root");

  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      </React.StrictMode>,
    );
  }
}

void bootstrap();
