import { useState, type FormEvent } from "react";
import { KeyRound, Check, AlertCircle } from "lucide-react";
import { Button } from "./Button";
import { changePassword, canChangePassword, MIN_PASSWORD } from "../services/account";

const inputCls =
  "focusable w-full rounded-lg border border-white/10 bg-surface-2 px-4 py-3 text-white placeholder:text-muted/60 outline-none focus:border-accent";
const labelCls = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted";

/**
 * Change the account password from inside the app.
 *
 * The current password is required because Firebase refuses to change a
 * password on a session that wasn't established recently — which is the right
 * behaviour: it stops an unlocked, unattended device being used to take over
 * the account.
 */
export function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Accounts with no email — nothing to change a password against.
  if (!canChangePassword()) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setDone(false);

    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      await changePassword(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 rounded-xl border border-white/5 bg-surface p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <KeyRound size={18} /> Password
      </h2>
      <p className="mt-1 text-sm text-muted">
        Changing this signs you out of nothing else — devices you've paired stay signed in.
      </p>

      <form onSubmit={submit} className="mt-4 max-w-sm space-y-4">
        <label className="block">
          <span className={labelCls}>Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="••••••••"
            className={inputCls}
          />
        </label>

        <label className="block">
          <span className={labelCls}>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder={`At least ${MIN_PASSWORD} characters`}
            className={inputCls}
          />
        </label>

        <label className="block">
          <span className={labelCls}>Confirm new password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            className={inputCls}
          />
        </label>

        {error && (
          <p className="flex items-start gap-2 text-sm text-red-400">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
        {done && (
          <p className="flex items-center gap-2 text-sm font-semibold text-accent">
            <Check size={16} /> Password updated.
          </p>
        )}

        <Button type="submit" disabled={busy || !current || next.length < MIN_PASSWORD}>
          {busy ? "Updating…" : "Change password"}
        </Button>
      </form>
    </section>
  );
}
