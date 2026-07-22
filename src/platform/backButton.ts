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

// Top-level tabs. On these, the navbar isn't reachable with the D-pad (arrow
// nav is kept inside the content), so Back is how you get to it: first Back
// surfaces the navbar, Back from the navbar drops back into the content.
const TAB_PAGES = ["/", "/movies", "/series", "/live", "/search", "/settings", "/remote"];

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

// Kept so the Quit? dialog can actually close the app when the user confirms.
let capApp: CapacitorApp | null = null;

/** Close the native app (no-op off native). Used by the Quit? confirmation. */
export async function quitApp(): Promise<void> {
  await capApp?.exitApp();
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
  capApp = App;

  const handle = await App.addListener("backButton", () => {
    // A screen-level interceptor (the player) gets first refusal.
    if (intercepted()) return;

    // An overlay always has a history entry behind it, so going back closes it
    // before anything else — checked first so Back never exits with a sheet up.
    if (document.querySelector("[data-spatial-scope]")) {
      window.history.back();
      return;
    }

    const path = currentPath();
    // Double-press to leave: the first Back from the content surfaces the navbar
    // (so one accidental press never drops you off the page), and a second Back
    // — now with focus on the navbar — falls through and actually goes back /
    // exits. LEFT also reaches the navbar (see spatialNav), so this is purely a
    // safety buffer on the way out.
    if (TAB_PAGES.includes(path)) {
      const inHeader = Boolean((document.activeElement as HTMLElement | null)?.closest("header"));
      if (!inHeader) {
        const nav =
          document.querySelector<HTMLElement>("header nav [aria-current='page']") ??
          document.querySelector<HTMLElement>("header nav a[href], header nav button:not([data-spatial-skip])");
        if (nav) {
          nav.focus();
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      }
      // Focus is on the navbar already (reached via that first Back or via LEFT):
      // a further Back at the top of a tab asks before quitting, rather than
      // dropping out of the app on a single stray press.
      window.dispatchEvent(new CustomEvent("tvio:confirm-quit"));
      return;
    }

    if (ROOTS.includes(path)) {
      App.exitApp();
    } else {
      window.history.back();
    }
  });

  return () => {
    void handle.remove();
  };
}
