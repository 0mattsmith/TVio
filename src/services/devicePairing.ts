import { signInWithCustomToken } from "firebase/auth";
import { auth, firebaseEnabled } from "./firebase";

// TV sign-in — the mirror image of services/pairing.ts.
//
// A freshly installed TV has no account, so it can't write to Firestore at all
// (the rules require auth, correctly). Everything therefore goes through the
// Worker: the TV asks for a code, displays it as a QR, and polls; a phone that's
// already signed in scans it and approves, proving itself with an ID token.

export const DEVICE_PREFIX = "TVIO2:";
const POLL_MS = 2500;
const CODE_LENGTH = 8;

function workerBase(): string | null {
  const proxy = import.meta.env.VITE_TMDB_PROXY as string | undefined;
  if (!proxy) return null;
  return proxy.replace(/\/+$/, "").replace(/\/tmdb$/, "");
}

export function devicePairingAvailable(): boolean {
  return firebaseEnabled && Boolean(workerBase());
}

interface WorkerError {
  error?: string;
  code?: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const base = workerBase();
  if (!base) throw new Error("TV sign-in isn't configured on this build. [NO_PROXY]");

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the TVio server. [NET_UNREACHABLE]");
  }

  const raw = await res.text();
  let data: T & WorkerError;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`The TVio Worker may be out of date. [HTTP_${res.status}_NOT_JSON]`);
  }
  if (!res.ok) {
    throw new Error(`${data.error || "Something went wrong."} [${data.code || `HTTP_${res.status}`}]`);
  }
  return data;
}

export interface DeviceCode {
  code: string;
  qr: string;
  expiresAt: number;
}

/** TV: begin a sign-in attempt and get a code to display. */
export async function startDeviceCode(): Promise<DeviceCode> {
  const { code, expiresAt } = await post<{ code: string; expiresAt: number }>("/pair/start", {});
  return { code, qr: `${DEVICE_PREFIX}${code}`, expiresAt };
}

export function isDeviceCode(raw: string): boolean {
  return raw.trim().toUpperCase().startsWith(DEVICE_PREFIX);
}

export function normalizeDeviceCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/^TVIO2:/, "")
    .replace(/[^A-Z2-9]/g, "")
    .slice(0, CODE_LENGTH);
}

/** Phone (signed in): approve a code scanned from a TV. */
export async function approveDeviceCode(raw: string): Promise<void> {
  if (!firebaseEnabled || !auth?.currentUser) {
    throw new Error("Sign in on this phone first. [NOT_SIGNED_IN]");
  }
  const code = normalizeDeviceCode(raw);
  if (code.length !== CODE_LENGTH) throw new Error("That code doesn't look right. [PAIR_MALFORMED]");

  const idToken = await auth.currentUser.getIdToken();
  await post("/pair/approve", { code, idToken });
}

/**
 * TV: poll until the phone approves, then sign in.
 * Resolves true once signed in, false if the caller aborted first.
 */
export async function awaitDeviceApproval(code: string, signal: AbortSignal): Promise<boolean> {
  while (!signal.aborted) {
    const res = await post<{ status?: string; token?: string }>("/pair/claim", { code });
    if (res.status === "approved" && res.token) {
      if (!auth) throw new Error("Accounts aren't configured on this build. [NO_FIREBASE]");
      await signInWithCustomToken(auth, res.token);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return false;
}
