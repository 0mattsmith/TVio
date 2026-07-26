// Remembers which poster the user opened, so pressing Back returns focus to it
// rather than resetting to the top of the page. Path-scoped so a poster on the
// destination (e.g. a collection row on a title page) can't claim it early.

let pending: { path: string; key: string } | null = null;

/** Called when a poster navigates away — record where to return focus. */
export function rememberPosterFocus(path: string, key: string) {
  pending = { path, key };
}

/** True when some poster on this path is waiting to reclaim focus. */
export function pendingFocusForPath(path: string): boolean {
  return pending?.path === path;
}

/** A poster claims the pending focus if it's the one that was remembered. */
export function claimPosterFocus(path: string, key: string): boolean {
  if (pending && pending.path === path && pending.key === key) {
    pending = null;
    return true;
  }
  return false;
}
