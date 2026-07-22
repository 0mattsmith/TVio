import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "./router";
import { isNativeShell } from "./platform/capabilities";
import { installBackButton } from "./platform/backButton";
import { initNativePlayback } from "./services/exoPlayer";
import { FirebaseSync } from "./services/firebaseSync";
import { UpdateGate } from "./components/UpdateGate";
import "./index.css";

// Brand as "TVio Lite" on the limited web/PWA build; "TVio" on native builds.
document.title = isNativeShell() ? "TVio" : "TVio Lite";

// Unlock native playback before first render if ExoPlayer is present.
initNativePlayback();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 10, retry: 1, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <FirebaseSync />
      {/* Desktop: installs any pending update on a splash before the app loads. */}
      <UpdateGate>
        <RouterProvider router={router} />
      </UpdateGate>
    </QueryClientProvider>
  </React.StrictMode>
);

// Make Android's hardware Back step through the app rather than exit it.
void installBackButton();

// Register the PWA service worker (production only).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
