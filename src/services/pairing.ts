import { doc, setDoc, onSnapshot, deleteDoc } from "firebase/firestore";
import { signInWithCustomToken } from "firebase/auth";
import { auth, db, firebaseEnabled } from "./firebase";

// QR sign-in: the desktop (already signed in) shows a short-lived code; a phone
// scans or types it and is signed into the same account.
//
// The phone can't be authorised by another client — only a trusted server can do
// that — so redemption goes through the Cloudflare Worker, which verifies the
// code and mints a Firebase custom token. See proxy/tmdb-worker.js.

/** Unambiguous alphabet: no O/0, I/1, or similar look-alikes. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const TTL_MS = 3 * 60_000; // 3 minutes — short, because the code is the secret

export const PAIR_PREFIX = "TVIO1:"; // what the QR encodes: TVIO1:ABCD2345

function randomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Worker base URL, derived from the TMDB proxy setting (…/tmdb → …). */
function workerBase(): string | null {
  const proxy = import.meta.env.VITE_TMDB_PROXY as string | undefined;
  if (!proxy) return null;
  return proxy.replace(/\/+$/, "").replace(/\/tmdb$/, "");
}

export function pairingAvailable(): boolean {
  return firebaseEnabled && Boolean(workerBase());
}

export interface Pairing {
  code: string;
  qr: string;
  expiresAt: number;
}

/** Desktop: create a single-use code for a phone to claim. */
export async function createPairing(): Promise<Pairing> {
  if (!firebaseEnabled || !auth || !db) throw new Error("Accounts aren't configured on this build.");
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in first.");

  const code = randomCode();
  const expiresAt = Date.now() + TTL_MS;
  await setDoc(doc(db, "pairings", code), {
    ownerUid: user.uid,
    createdAt: Date.now(),
    expiresAt,
    redeemed: false,
  });

  return { code, qr: `${PAIR_PREFIX}${code}`, expiresAt };
}

/** Desktop: fires once the phone has redeemed the code. */
export function watchPairing(code: string, onRedeemed: () => void): () => void {
  if (!db) return () => {};
  return onSnapshot(doc(db, "pairings", code), (snap) => {
    if (snap.data()?.redeemed === true) onRedeemed();
  });
}

export async function cancelPairing(code: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, "pairings", code)).catch(() => {});
}

/** Accepts a raw scan ("TVIO1:ABCD2345") or a typed code. */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(PAIR_PREFIX, "").replace(/[^A-Z2-9]/g, "").slice(0, CODE_LENGTH);
}

/** Phone: exchange the code for a session via the Worker. */
export async function redeemPairing(rawCode: string): Promise<void> {
  if (!firebaseEnabled || !auth) throw new Error("Accounts aren't configured on this build.");
  const base = workerBase();
  if (!base) throw new Error("QR sign-in isn't configured on this build.");

  const code = normalizeCode(rawCode);
  if (code.length !== CODE_LENGTH) throw new Error("That code doesn't look right.");

  const res = await fetch(`${base}/pair/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) throw new Error(data.error || "Couldn't sign in with that code.");

  await signInWithCustomToken(auth, data.token);
}
