import { createHashRouter } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { SignIn } from "./pages/SignIn";
import { Home } from "./pages/Home";
import { Movies } from "./pages/Movies";
import { Series } from "./pages/Series";
import { Detail } from "./pages/Detail";
import { Person } from "./pages/Person";
import { Player } from "./pages/Player";
import { SearchPage } from "./pages/SearchPage";
import { Settings } from "./pages/Settings";
import { LiveTV } from "./pages/LiveTV";
import { LivePlayer } from "./pages/LivePlayer";

// Hash router keeps deep links working on GitHub Pages (no server rewrites).
export const router = createHashRouter([
  { path: "/signin", element: <SignIn /> },
  { path: "/watch/:type/:id", element: <Player /> },
  { path: "/live/watch/:channelId", element: <LivePlayer /> },
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/movies", element: <Movies /> },
      { path: "/series", element: <Series /> },
      { path: "/live", element: <LiveTV /> },
      { path: "/search", element: <SearchPage /> },
      { path: "/settings", element: <Settings /> },
      { path: "/title/:type/:id", element: <Detail /> },
      { path: "/person/:id", element: <Person /> },
    ],
  },
]);
