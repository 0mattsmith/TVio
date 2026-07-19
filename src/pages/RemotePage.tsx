import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, CornerUpLeft, Home, Play,
  Volume2, VolumeX, Send, Search, Loader2, Tv, MonitorPlay, RefreshCw, Gamepad2,
} from "lucide-react";
import { discoverTargets, type PlayTarget } from "../services/playon";
import { sendKey, sendText, type RemoteKey } from "../services/remote";
import { useDeviceProfile } from "../hooks/useDeviceProfile";

export function RemotePage() {
  const navigate = useNavigate();
  const profile = useDeviceProfile();
  const [targets, setTargets] = useState<PlayTarget[] | null>(null);
  const [target, setTarget] = useState<PlayTarget | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string>("");

  const scan = () => {
    setTargets(null);
    discoverTargets().then((t) => {
      setTargets(t);
      setTarget((cur) => cur ?? t.find((x) => x.online) ?? null);
    });
  };

  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const press = async (key: RemoteKey) => {
    if (!target) return setStatus("Connect a screen first.");
    setStatus("");
    try {
      await sendKey(target.id, key);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Couldn't reach the screen.");
    }
  };

  const submitText = async () => {
    if (!target) return setStatus("Connect a screen first.");
    if (!text.trim()) return;
    try {
      await sendText(target.id, text);
      setStatus(`Sent "${text}"`);
      setText("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Couldn't send text.");
    }
  };

  // Non-phone hint (remote is a companion feature for phones).
  if (profile !== "mobile") {
    return (
      <div className="animate-fade-in mx-auto max-w-md px-4 pb-16 pt-24 text-center sm:px-8">
        <Gamepad2 className="mx-auto text-accent" size={32} />
        <h1 className="mt-3 text-2xl font-black tracking-tight">Companion Remote</h1>
        <p className="mt-2 text-sm text-muted">
          The remote runs on the TVio mobile app / Lite on your phone, and controls this TV or desktop over your network.
        </p>
        <button onClick={() => navigate(-1)} className="focusable mt-5 rounded-lg bg-surface-2 px-4 py-2 text-sm font-semibold">Back</button>
      </div>
    );
  }

  const DPad = ({ k, children, cls = "" }: { k: RemoteKey; children: React.ReactNode; cls?: string }) => (
    <button onClick={() => press(k)} className={`focusable flex items-center justify-center bg-surface-2 active:bg-white/10 ${cls}`}>
      {children}
    </button>
  );

  return (
    <div className="animate-fade-in mx-auto max-w-sm px-4 pb-16 pt-24 sm:px-8">
      <h1 className="mb-4 text-2xl font-black tracking-tight">Remote</h1>

      {/* Connection */}
      <div className="mb-5 rounded-xl border border-white/10 bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider text-muted">Controlling</div>
            <div className="truncate text-sm font-semibold">{target ? target.name : "No screen connected"}</div>
          </div>
          <button onClick={scan} className="focusable flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-xs font-semibold">
            <RefreshCw size={14} /> Scan
          </button>
        </div>
        {targets && targets.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {targets.map((t) => (
              <button
                key={t.id}
                onClick={() => setTarget(t)}
                className={`focusable flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  target?.id === t.id ? "bg-accent text-black" : "bg-surface-2 text-muted"
                }`}
              >
                {t.kind === "windows" ? <MonitorPlay size={13} /> : <Tv size={13} />} {t.name}
              </button>
            ))}
          </div>
        )}
        {targets && targets.length === 0 && (
          <p className="mt-3 text-xs text-muted">
            No screens found. Open TVio on your Android TV or PC — same account or Wi-Fi — then Scan. Full remote runs from the TVio mobile app.
          </p>
        )}
        {targets === null && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted"><Loader2 size={14} className="animate-spin" /> Scanning…</p>
        )}
      </div>

      {/* Keyboard / search */}
      <div className="mb-5 flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-surface-2 px-3">
          <Search size={16} className="text-muted" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitText()}
            placeholder="Type to search on screen…"
            className="w-full bg-transparent py-2.5 text-sm outline-none"
          />
        </div>
        <button onClick={submitText} className="focusable flex items-center gap-1.5 rounded-lg bg-accent px-4 font-bold text-black"><Send size={16} /></button>
      </div>

      {/* D-pad */}
      <div className="mx-auto grid aspect-square w-64 grid-cols-3 grid-rows-3 gap-1.5 overflow-hidden rounded-2xl">
        <div />
        <DPad k="up"><ChevronUp size={28} /></DPad>
        <div />
        <DPad k="left"><ChevronLeft size={28} /></DPad>
        <DPad k="ok" cls="rounded-full bg-accent text-black font-black">OK</DPad>
        <DPad k="right"><ChevronRight size={28} /></DPad>
        <div />
        <DPad k="down"><ChevronDown size={28} /></DPad>
        <div />
      </div>

      {/* Transport + volume */}
      <div className="mt-5 grid grid-cols-3 gap-2">
        <button onClick={() => press("back")} className="focusable flex items-center justify-center gap-1.5 rounded-lg bg-surface-2 py-3 text-sm font-semibold"><CornerUpLeft size={18} /> Back</button>
        <button onClick={() => press("home")} className="focusable flex items-center justify-center gap-1.5 rounded-lg bg-surface-2 py-3 text-sm font-semibold"><Home size={18} /> Home</button>
        <button onClick={() => press("playpause")} className="focusable flex items-center justify-center gap-1.5 rounded-lg bg-surface-2 py-3 text-sm font-semibold"><Play size={16} fill="currentColor" /> Play</button>
        <button onClick={() => press("voldown")} className="focusable flex items-center justify-center rounded-lg bg-surface-2 py-3"><Volume2 size={18} className="opacity-60" /></button>
        <button onClick={() => press("mute")} className="focusable flex items-center justify-center rounded-lg bg-surface-2 py-3"><VolumeX size={18} /></button>
        <button onClick={() => press("volup")} className="focusable flex items-center justify-center rounded-lg bg-surface-2 py-3"><Volume2 size={18} /></button>
      </div>

      {status && <p className="mt-4 text-center text-xs text-muted">{status}</p>}
    </div>
  );
}
