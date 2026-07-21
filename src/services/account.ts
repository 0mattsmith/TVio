import {
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { auth, firebaseEnabled } from "./firebase";

// Account recovery and password changes.
//
// Worth stating why reauthentication is unavoidable: Firebase refuses
// updatePassword on a session that wasn't established recently, so a stolen
// unlocked device can't be used to seize the account. Asking for the current
// password satisfies that and doubles as the obvious check.

export const MIN_PASSWORD = 6; // Firebase's own floor

/** Turns a Firebase error into something a person can act on, keeping the code. */
export function authMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-email": "That doesn't look like a valid email address.",
    "auth/user-not-found": "No TVio account uses that email address.",
    "auth/wrong-password": "That current password isn't right.",
    "auth/invalid-credential": "That current password isn't right.",
    "auth/weak-password": `Pick a longer password — at least ${MIN_PASSWORD} characters.`,
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
    "auth/requires-recent-login": "For security, sign in again before changing your password.",
    "auth/network-request-failed": "Couldn't reach the server. Check your connection.",
    "auth/missing-password": "Enter your password.",
  };
  const friendly = map[code] || (e instanceof Error ? e.message : "Something went wrong.");
  return code ? `${friendly} [${code}]` : friendly;
}

/**
 * Sends a reset link. Deliberately does NOT reveal whether the address has an
 * account — the caller shows the same confirmation either way, so this can't be
 * used to test which emails are registered.
 */
export async function sendReset(email: string): Promise<void> {
  if (!firebaseEnabled || !auth) {
    throw new Error("Accounts aren't configured on this build. [NO_FIREBASE]");
  }
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (e) {
    // A missing account isn't an error the user should see, for the reason above.
    if ((e as { code?: string })?.code === "auth/user-not-found") return;
    throw new Error(authMessage(e));
  }
}

/** Changes the password of the signed-in account, confirming the current one first. */
export async function changePassword(current: string, next: string): Promise<void> {
  if (!firebaseEnabled || !auth?.currentUser) {
    throw new Error("You're not signed in to a TVio account. [NOT_SIGNED_IN]");
  }
  const user = auth.currentUser;
  if (!user.email) {
    throw new Error("This account has no email address, so it has no password to change. [NO_EMAIL]");
  }
  if (next.length < MIN_PASSWORD) {
    throw new Error(`Pick a longer password — at least ${MIN_PASSWORD} characters. [TOO_SHORT]`);
  }
  if (next === current) {
    throw new Error("That's the password you already have. [UNCHANGED]");
  }

  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
    await updatePassword(user, next);
  } catch (e) {
    throw new Error(authMessage(e));
  }
}

/**
 * True when this account can have its password changed in-app. Sessions created
 * by QR pairing are custom-token based; they still belong to an email account,
 * so this only excludes accounts with no email at all.
 */
export function canChangePassword(): boolean {
  return Boolean(firebaseEnabled && auth?.currentUser?.email);
}
