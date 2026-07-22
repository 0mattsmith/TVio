// Android hardware Back.
//
// Capacitor's default is to step back through WebView history and, when there's
// nowhere left to go, exit the app. On a full-screen route like the player that
// came out as "Back quits TVio" instead of "Back returns to the title". This
// takes over the button and makes it behave predictably:
//
//   overlay open      → pop it (its pushState entry closes it; see useOverlayBack)
//   on a root screen  → exit the app, which is what Back should do there
//   anywhere else     → go back one step in the app's own history
//
// No-op off native, where the browser's own Back is already correct.

const ROOTS = ["/", "/signin", "/profiles"];

function currentPath(): string {
  return (window.location.hash || "#/").replace(/^#/, "").split("?")[0];
}

// Screens like the player need to intercept Back for their own multi-step
// behaviour (hide overlay → confirm → exit) before the app-level handler steps
// through history. A handler returns true when it has consumed the press.
type BackInterceptor = () => boolean;
const interceptors: BackInterceptor[] = [];

export function registerBackInterceptor(fn: BackInterceptor): () => void {
  interceptors.push(fn);
  return () => {
    const i = interceptors.indexOf(fn);
    if (i >= 0) interceptors.splice(i, 1);
  };
}

/** Runs the most-recently-registered interceptors first. */
function intercepted(): boolean {
  for (let i = interceptors.length - 1; i >= 0; i--) {
    if (interceptors[i]()) return true;
  }
  return false;
}

interface CapacitorApp {
  addListener(event: "backButton", cb: () => void): Promise<{ remove: () => void | Promise<void> }>;
  exitApp(): Promise<void>;
}

export async function installBackButton(): Promise<() => void> {
  let App: CapacitorApp;
  try {
    // Typed loosely and imported dynamically: the package is only present in
    // native builds, so a static import would break the web typecheck/build.
    // The module specifier is built at runtime so tsc doesn't try to resolve it.
    const pkg = "@capacitor/app";
    ({ App } = (await import(/* @vite-ignore */ pkg)) as unknown as { App: CapacitorApp });
  } catch {
    return () => {}; // plugin absent (web build) — nothing to do
  }

  const handle = await App.addListener("backButton", () => {
    // A screen-level interceptor (the player) gets first refusal.
    if (intercepted()) return;

    // An overlay always has a history entry behind it, so going back closes it
    // before anything else — checked first so Back never exits with a sheet up.
    if (document.querySelector("[data-spatial-scope]")) {
      window.history.back();
      return;
    }
    if (ROOTS.includes(currentPath())) {
      App.exitApp();
    } else {
      window.history.back();
    }
  });

  return () => {
    void handle.remove();
  };
}
