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
