import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crown, LogOut, Check } from "lucide-react";
import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import { AvatarPicker } from "../components/AvatarPicker";
import { useAppStore, PROFILE_AVATARS } from "../store/useAppStore";
import type { Profile } from "../store/useAppStore";

/**
 * "Who's watching?" — a pure picker, like Netflix.
 * Profiles are created/edited/removed in Settings (Master profile only). The
 * only creation that happens here is the very first (Master) profile.
 */
export function Profiles() {
  const navigate = useNavigate();
  const profiles = useAppStore((s) => s.profiles);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const addProfile = useAppStore((s) => s.addProfile);
  const switchProfile = useAppStore((s) => s.switchProfile);
  const signOut = useAppStore((s) => s.signOut);

  // Derived every render — never latched into state, so profiles arriving late
  // (persisted storage / Firestore sync) correctly show the picker.
  const firstRun = profiles.length === 0;

  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(PROFILE_AVATARS[0]);

  const createMaster = () => {
    if (!name.trim()) return;
    const id = addProfile(name, avatar);
    switchProfile(id);
    navigate("/", { replace: true });
  };

  const choose = (p: Profile) => {
    switchProfile(p.id);
    navigate("/", { replace: true });
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-bg px-6 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(1200px 600px at 50% -10%, rgba(20,184,166,0.10), transparent 60%)" }}
      />
      <div className="relative w-full max-w-2xl text-center">
        <Logo className="mb-8" />

        {firstRun ? (
          <div className="mx-auto max-w-md rounded-2xl border border-white/5 bg-surface/80 p-8 text-left shadow-card">
            <h1 className="text-2xl font-black tracking-tight">Create your profile</h1>
            <p className="mt-1 text-sm text-muted">
              This is your Master profile — it manages sources, Live TV and settings for the account.
            </p>

            <label className="mt-6 block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">Name</span>
              <input
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createMaster()}
                placeholder="e.g. Matt"
                className="focusable w-full rounded-lg border border-white/10 bg-surface-2 px-4 py-3 text-sm outline-none focus:border-accent"
              />
            </label>

            <div className="mt-4">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">Avatar</span>
              <AvatarPicker value={avatar} onChange={setAvatar} />
            </div>

            <Button onClick={createMaster} disabled={!name.trim()} className="mt-6 w-full">
              <Check size={16} /> Create profile
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Who's watching?</h1>
            <p className="mt-2 text-sm text-muted">Each profile keeps its own watchlist and continue-watching.</p>

            <div className="mt-10 flex flex-wrap items-start justify-center gap-6">
              {profiles.map((p) => (
                <button key={p.id} onClick={() => choose(p)} className="w-28 focusable rounded-xl">
                  <span
                    className={`relative flex h-28 w-28 items-center justify-center rounded-xl bg-surface-2 text-5xl transition-transform hover:scale-105 ${
                      p.id === activeProfileId ? "ring-2 ring-accent" : ""
                    }`}
                  >
                    {p.avatar}
                    {p.isMaster && (
                      <span className="absolute right-1.5 top-1.5 text-accent" title="Master profile">
                        <Crown size={16} />
                      </span>
                    )}
                  </span>
                  <span className="mt-2 block truncate text-sm font-semibold">{p.name}</span>
                </button>
              ))}
            </div>

            <p className="mt-8 text-xs text-muted">Add or edit profiles in Settings (Master profile only).</p>

            <div className="mt-4 flex items-center justify-center">
              <Button variant="ghost" onClick={() => { signOut(); navigate("/signin", { replace: true }); }}>
                <LogOut size={15} /> Sign out
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
