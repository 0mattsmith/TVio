import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Crown, LogOut, Check, X } from "lucide-react";
import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import { useAppStore, PROFILE_AVATARS } from "../store/useAppStore";
import type { Profile } from "../store/useAppStore";

function AvatarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PROFILE_AVATARS.map((a) => (
        <button
          key={a}
          onClick={() => onChange(a)}
          className={`focusable flex h-11 w-11 items-center justify-center rounded-lg text-2xl transition-colors ${
            value === a ? "bg-accent-soft ring-2 ring-accent" : "bg-surface-2 hover:bg-white/10"
          }`}
        >
          {a}
        </button>
      ))}
    </div>
  );
}

export function Profiles() {
  const navigate = useNavigate();
  const profiles = useAppStore((s) => s.profiles);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const addProfile = useAppStore((s) => s.addProfile);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const removeProfile = useAppStore((s) => s.removeProfile);
  const switchProfile = useAppStore((s) => s.switchProfile);
  const signOut = useAppStore((s) => s.signOut);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const isMaster = activeProfile?.isMaster ?? profiles.length === 0;

  const [creating, setCreating] = useState(profiles.length === 0);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [manage, setManage] = useState(false);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(PROFILE_AVATARS[0]);

  const firstRun = profiles.length === 0;

  const startCreate = () => {
    setEditing(null);
    setName("");
    setAvatar(PROFILE_AVATARS[Math.floor(Math.random() * PROFILE_AVATARS.length)]);
    setCreating(true);
  };
  const startEdit = (p: Profile) => {
    setCreating(false);
    setEditing(p);
    setName(p.name);
    setAvatar(p.avatar);
  };
  const submit = () => {
    if (!name.trim()) return;
    if (editing) {
      updateProfile(editing.id, { name, avatar });
      setEditing(null);
    } else {
      const id = addProfile(name, avatar);
      setCreating(false);
      if (firstRun) {
        switchProfile(id);
        navigate("/", { replace: true });
      }
    }
  };
  const choose = (p: Profile) => {
    switchProfile(p.id);
    navigate("/", { replace: true });
  };

  const editorOpen = creating || editing !== null;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-bg px-6 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(1200px 600px at 50% -10%, rgba(20,184,166,0.10), transparent 60%)" }}
      />
      <div className="relative w-full max-w-2xl text-center">
        <Logo className="mb-8" />

        {editorOpen ? (
          <div className="mx-auto max-w-md rounded-2xl border border-white/5 bg-surface/80 p-8 text-left shadow-card">
            <h1 className="text-2xl font-black tracking-tight">
              {editing ? "Edit profile" : firstRun ? "Create your profile" : "Add a profile"}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {firstRun
                ? "This is your Master profile — it manages sources and settings for the account."
                : "Each profile gets its own watchlist and continue-watching."}
            </p>

            <label className="mt-6 block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">Name</span>
              <input
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="e.g. Matt"
                className="focusable w-full rounded-lg border border-white/10 bg-surface-2 px-4 py-3 text-sm outline-none focus:border-accent"
              />
            </label>

            <div className="mt-4">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">Avatar</span>
              <AvatarPicker value={avatar} onChange={setAvatar} />
            </div>

            <div className="mt-6 flex gap-2">
              <Button onClick={submit} disabled={!name.trim()} className="flex-1">
                <Check size={16} /> {editing ? "Save" : "Create"}
              </Button>
              {!firstRun && (
                <Button variant="ghost" onClick={() => { setCreating(false); setEditing(null); }}>
                  <X size={16} /> Cancel
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Who's watching?</h1>
            <p className="mt-2 text-sm text-muted">Pick a profile — each has its own watchlist.</p>

            <div className="mt-10 flex flex-wrap items-start justify-center gap-6">
              {profiles.map((p) => (
                <div key={p.id} className="w-28">
                  <button
                    onClick={() => (manage ? startEdit(p) : choose(p))}
                    className={`focusable relative flex h-28 w-28 items-center justify-center rounded-xl bg-surface-2 text-5xl transition-transform hover:scale-105 ${
                      p.id === activeProfileId ? "ring-2 ring-accent" : ""
                    }`}
                  >
                    {p.avatar}
                    {p.isMaster && (
                      <span className="absolute right-1.5 top-1.5 text-accent" title="Master profile">
                        <Crown size={16} />
                      </span>
                    )}
                    {manage && (
                      <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60">
                        <Pencil size={22} />
                      </span>
                    )}
                  </button>
                  <div className="mt-2 truncate text-sm font-semibold">{p.name}</div>
                  {manage && !p.isMaster && (
                    <button
                      onClick={() => removeProfile(p.id)}
                      className="focusable mt-1 inline-flex items-center gap-1 text-xs text-muted hover:text-red-400"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>
              ))}

              {isMaster && profiles.length < 5 && (
                <div className="w-28">
                  <button
                    onClick={startCreate}
                    className="focusable flex h-28 w-28 items-center justify-center rounded-xl border-2 border-dashed border-white/20 text-muted transition-colors hover:border-accent hover:text-accent"
                  >
                    <Plus size={32} />
                  </button>
                  <div className="mt-2 text-sm font-semibold text-muted">Add profile</div>
                </div>
              )}
            </div>

            <div className="mt-10 flex items-center justify-center gap-3">
              {isMaster && (
                <Button variant="secondary" onClick={() => setManage((m) => !m)}>
                  <Pencil size={15} /> {manage ? "Done" : "Manage profiles"}
                </Button>
              )}
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
