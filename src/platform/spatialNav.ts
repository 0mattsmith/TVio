// D-pad / arrow-key navigation.
//
// Browsers have no spatial navigation, so on a TV the arrow keys just scroll
// the page — you can reach the first item in a row and then the whole view
// slides instead of the selection moving. This intercepts the arrow keys and
// moves focus to the nearest element in that direction, scrolling only as much
// as is needed to bring it into view.
//
// Everything geometric lives in pickBest, which is pure and unit-tested; the
// DOM parts around it stay deliberately thin.

export type Dir = "up" | "down" | "left" | "right";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Overlap between two 1-D spans, or a negative gap when they don't meet. */
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
}

/**
 * How good a move this candidate is, or null if it isn't in that direction.
 *
 * Two components: distance along the direction of travel, and misalignment
 * across it. Misalignment is weighted heavily so that moving down from a poster
 * lands on the poster below rather than one three columns over that happens to
 * be a few pixels closer.
 */
export function score(from: Box, to: Box, dir: Dir): number | null {
  const TOLERANCE = 4; // ignore hairline overlaps from borders and shadows
  const CROSS_WEIGHT = 4;

  let travel: number;
  let cross: number;

  if (dir === "right") {
    travel = to.left - from.right;
    cross = -overlap(from.top, from.bottom, to.top, to.bottom);
  } else if (dir === "left") {
    travel = from.left - to.right;
    cross = -overlap(from.top, from.bottom, to.top, to.bottom);
  } else if (dir === "down") {
    travel = to.top - from.bottom;
    cross = -overlap(from.left, from.right, to.left, to.right);
  } else {
    travel = from.top - to.bottom;
    cross = -overlap(from.left, from.right, to.left, to.right);
  }

  if (travel < -TOLERANCE) return null; // behind us, or the same element

  // Overlapping on the cross axis is ideal, and any amount of it is equally
  // good — clamp so a wider element isn't unfairly favoured over a narrow one.
  const misalignment = Math.max(0, cross);
  return Math.max(0, travel) + misalignment * CROSS_WEIGHT;
}

export function pickBest<T extends { box: Box }>(from: Box, candidates: T[], dir: Dir): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const s = score(from, candidate.box, dir);
    if (s === null || s >= bestScore) continue;
    bestScore = s;
    best = candidate;
  }
  return best;
}

// --- DOM plumbing -----------------------------------------------------------

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"]), .focusable';

/**
 * Elements that shouldn't be focus stops on a remote — the row chevrons (you
 * scroll by moving between posters, so they'd be dead ends) and the logo (it
 * only goes Home, which the navbar already offers).
 */
const SKIP = "[data-spatial-skip]";

const KEYS: Record<string, Dir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

function isTextEntry(el: Element): boolean {
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  const type = (el as HTMLInputElement).type;
  return !["button", "submit", "checkbox", "radio", "range"].includes(type);
}

function boxesIn(root: ParentNode): { el: HTMLElement; box: Box }[] {
  const out: { el: HTMLElement; box: Box }[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))) {
    if (el.getAttribute("aria-hidden") === "true") continue;
    if (el.closest(SKIP)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue; // hidden or collapsed
    out.push({ el, box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
  }
  return out;
}

/**
 * Starts intercepting arrow keys. Returns a cleanup function.
 *
 * An open overlay marks itself with data-spatial-scope so focus stays trapped
 * inside it — without that, pressing down inside Quick Watch would wander off
 * into the page behind.
 */
export function installSpatialNav(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const active = document.activeElement as HTMLElement | null;

    // Back jumps to the navbar and lands on the page you're already viewing,
    // so getting out of a long grid is one press rather than many. Overlays
    // own their own Escape handling, so leave them to it.
    if ((e.key === "Escape" || e.key === "Backspace") && !document.querySelector("[data-spatial-scope]")) {
      if (active && isTextEntry(active)) return;
      const home =
        document.querySelector<HTMLElement>("nav [aria-current='page']") ??
        document.querySelector<HTMLElement>("nav a, nav button");
      if (home) {
        e.preventDefault();
        home.focus();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    const dir = KEYS[e.key];
    if (!dir || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

    // Leave the caret alone when someone is actually typing.
    if (active && isTextEntry(active) && (dir === "left" || dir === "right")) return;

    const scope = active?.closest("[data-spatial-scope]") ?? document;
    const candidates = boxesIn(scope).filter((c) => c.el !== active);
    if (candidates.length === 0) return;

    // Nothing focused yet — the first press should grab something rather than
    // scroll, which is what makes a remote feel responsive from cold.
    if (!active || active === document.body) {
      e.preventDefault();
      candidates[0].el.focus();
      return;
    }

    const r = active.getBoundingClientRect();
    const from: Box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    const next = pickBest(from, candidates, dir);

    // Swallow the key even at the edges. Letting it through would scroll the
    // page out from under the highlight, which is the thing that makes a remote
    // feel broken — the view should only ever move because the selection did.
    e.preventDefault();
    if (!next) return;
    next.el.focus({ preventScroll: true });
    next.el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}

/**
 * Stops the on-screen keyboard appearing the instant a text field is focused.
 *
 * Android raises the IME on focus, so simply arrowing past a field on a TV
 * throws a full-screen keyboard over the layout. Fields are held readOnly —
 * focusable and visibly highlighted, but inert — until the user presses OK on
 * one, which is the moment they've actually asked to type. Escape or moving
 * away puts the guard back.
 *
 * TV only; a desktop keyboard has no such problem.
 */
export function installTvTextEntryGuard(): () => void {
  const guard = (el: Element) => {
    if (!isTextEntry(el)) return;
    (el as HTMLInputElement).readOnly = true;
  };
  const unguard = (el: HTMLInputElement | HTMLTextAreaElement) => {
    el.readOnly = false;
    // Re-focusing is what actually prompts Android to raise the keyboard, now
    // that the field will accept input.
    el.blur();
    el.focus();
  };

  const scan = () => document.querySelectorAll("input, textarea").forEach(guard);
  scan();

  // Fields appear as pages and dialogs mount, so keep watching for new ones.
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });

  const onKeyDown = (e: KeyboardEvent) => {
    const active = document.activeElement;
    if (!active || !isTextEntry(active)) return;
    const field = active as HTMLInputElement;

    if (e.key === "Enter" && field.readOnly) {
      e.preventDefault();
      e.stopPropagation();
      unguard(field);
    } else if (e.key === "Escape" && !field.readOnly) {
      field.readOnly = true;
    }
  };

  const onFocusOut = (e: FocusEvent) => {
    if (e.target instanceof Element) guard(e.target);
  };

  // Capture so this runs before a form's own Enter handler submits it.
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("focusout", onFocusOut, true);

  return () => {
    observer.disconnect();
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("focusout", onFocusOut, true);
    document.querySelectorAll("input, textarea").forEach((el) => {
      if (isTextEntry(el)) (el as HTMLInputElement).readOnly = false;
    });
  };
}
