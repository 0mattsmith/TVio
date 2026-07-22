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

import { isNativeShell } from "./capabilities";

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
interface Measure {
  travel: number;
  /** Positive = a gap across the direction of travel; 0 = the bands overlap. */
  gap: number;
  aligned: boolean;
}

function measure(from: Box, to: Box, dir: Dir): Measure | null {
  const TOLERANCE = 4; // ignore hairline overlaps from borders and shadows

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

  const gap = Math.max(0, cross);
  return { travel: Math.max(0, travel), gap, aligned: gap === 0 };
}

/** Retained for tests: lower is better, null when not in that direction. */
export function score(from: Box, to: Box, dir: Dir): number | null {
  const m = measure(from, to, dir);
  return m ? m.travel + m.gap * 4 : null;
}

/**
 * Alignment is a gate, not a weighting.
 *
 * Anything sharing a column band (moving vertically) or a row band (moving
 * horizontally) wins outright, and the nearest of those is chosen. Only when
 * nothing overlaps do offset candidates get considered.
 *
 * Weighting misalignment instead — which is what this did first — meant a far
 * away but perfectly aligned element could beat a near but offset one. On the
 * settings page that sent Up from the Play buttons past every control on the
 * screen and into the navbar, because the toggles are narrow switches pinned
 * right while the buttons below them are half-width blocks.
 */
export function pickBest<T extends { box: Box }>(from: Box, candidates: T[], dir: Dir): T | null {
  let aligned: T | null = null;
  let alignedTravel = Infinity;
  let offset: T | null = null;
  let offsetScore = Infinity;
  let offsetTravel = Infinity;

  for (const candidate of candidates) {
    const m = measure(from, candidate.box, dir);
    if (!m) continue;

    if (m.aligned) {
      if (m.travel < alignedTravel) {
        alignedTravel = m.travel;
        aligned = candidate;
      }
    } else if (m.travel + m.gap * 4 < offsetScore) {
      offsetScore = m.travel + m.gap * 4;
      offset = candidate;
      offsetTravel = m.travel;
    }
  }

  // Prefer an aligned candidate — UNLESS an offset one sits in a clearly nearer
  // row (much less travel). Without this a lone offset poster one row away is
  // skipped in favour of an aligned poster two rows away, so a short row (e.g.
  // a single "My Film Series" tile) gets jumped clean over.
  if (aligned && offset && offsetTravel < alignedTravel * 0.5) return offset;
  return aligned ?? offset;
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

/** Move focus up to the navbar (the current tab if there is one). */
function focusNavbar(): boolean {
  const nav =
    document.querySelector<HTMLElement>("header nav [aria-current='page']") ??
    document.querySelector<HTMLElement>("header nav a[href], header nav button:not([data-spatial-skip])");
  if (!nav) return false;
  nav.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
  return true;
}

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
    // own their own Escape handling, so leave them to it. On a native shell the
    // hardware Back button is handled by installBackButton (Capacitor), so don't
    // double-handle it here — that path has the fuller tab/navbar model.
    if ((e.key === "Escape" || e.key === "Backspace") && !document.querySelector("[data-spatial-scope]")) {
      if (isNativeShell()) return;
      if (active && isTextEntry(active)) return;
      if (focusNavbar()) e.preventDefault();
      return;
    }

    const dir = KEYS[e.key];
    if (!dir || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

    // Leave the caret alone when someone is actually typing.
    if (active && isTextEntry(active) && (dir === "left" || dir === "right")) return;

    // Scope by whether an overlay is OPEN, not by where focus happens to be.
    // Checking active.closest() meant an overlay only trapped focus once focus
    // was already inside it — and nothing focuses into a sheet when it opens,
    // so the first press navigated the page behind it instead.
    const overlay = document.querySelector<HTMLElement>("[data-spatial-scope]");
    let candidates = boxesIn(overlay ?? document).filter((c) => c.el !== active);
    // Keep arrow navigation inside the page content: the navbar is reached with
    // Back, not by arrowing up or left off the edge of the content into it. Once
    // focus is actually in the navbar its own links stay navigable (so this only
    // filters when we're starting from content).
    if (!overlay && !active?.closest("header")) {
      candidates = candidates.filter((c) => !c.el.closest("header"));
    }
    if (candidates.length === 0) return;

    // Overlay open but focus still behind it: pull focus in rather than moving.
    // Also covers nothing being focused yet, so the first press off a cold
    // start grabs something instead of doing nothing.
    if (!active || active === document.body || (overlay && !overlay.contains(active))) {
      e.preventDefault();
      // Don't let a top-left Back button be the first thing focused when a page
      // is entered cold — prefer the first real content control.
      const first = candidates.find((c) => !c.el.closest("[data-back]")) ?? candidates[0];
      first.el.focus();
      return;
    }

    const r = active.getBoundingClientRect();
    const from: Box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    const next = pickBest(from, candidates, dir);

    // Swallow the key even at the edges. Letting it through would scroll the
    // page out from under the highlight, which is the thing that makes a remote
    // feel broken — the view should only ever move because the selection did.
    e.preventDefault();
    if (!next) {
      // At the top/left edge of the content, UP or LEFT rises to the navbar —
      // the natural "go to the menu" gesture on a TV (Back reaches it too; this
      // just makes the D-pad do the obvious thing at the edge).
      if ((dir === "up" || dir === "left") && !active.closest("header") && focusNavbar()) return;
      // No navbar to rise to (or already in it): at least snap fully to the top.
      if (dir === "up") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
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
  // The field we're mid-activating: its own blur() must not re-guard it.
  let unguarding: EventTarget | null = null;

  const guard = (el: Element) => {
    if (!isTextEntry(el)) return;
    // Never re-guard the field currently being typed in — a DOM change elsewhere
    // (results loading, a button appearing) mustn't slam the keyboard shut
    // mid-word. Once unguarded + focused it's the active element, so scans skip it.
    if (el === document.activeElement && !(el as HTMLInputElement).readOnly) return;
    (el as HTMLInputElement).readOnly = true;
  };
  const unguard = (el: HTMLInputElement | HTMLTextAreaElement) => {
    el.readOnly = false;
    // blur()/focus() is what prompts Android to raise the keyboard now the field
    // will accept input — but that blur trips onFocusOut, which would re-guard it
    // straight back to readOnly. Flag it so that one focusout is ignored.
    unguarding = el;
    el.blur();
    el.focus();
    unguarding = null;
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
    if (e.target === unguarding) return; // its blur is part of activating it
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
