import type { MediaItem, MediaType } from "./types";

// "Play On" — NOT casting/mirroring. The phone finds another TVio app (a TV or
// desktop) on the same account or local network and sends it a command to open
// and play the chosen title (the link/ids), which the big-screen app then plays
// in its own native player.
//
// Discovery + transport are provided by the native mobile build, which injects
// `window.__TVIO_PLAYON__`:
//   - LAN discovery (mDNS / the companion WebSocket), and/or
//   - a Firebase relay for same-account devices over the internet,
//   - optionally Bluetooth for nearby devices.
// On the web build no bridge is present, so discovery returns [] and sending
// throws a helpful message.

export interface PlayTarget {
  id: string;
  name: string; // e.g. "Living Room Android TV", "Matt's PC"
  kind: "androidtv" | "windows" | "bluetooth";
  online: boolean;
}

export interface PlayCommand {
  type: MediaType;
  id: number;
  title: string;
  season?: number;
  episode?: number;
  streamUrl?: string; // optional resolved link to hand straight to the target
}

interface PlayOnBridge {
  discover: () => Promise<PlayTarget[]>;
  send: (targetId: string, cmd: PlayCommand) => Promise<void>;
}

function bridge(): PlayOnBridge | null {
  return (window as unknown as { __TVIO_PLAYON__?: PlayOnBridge }).__TVIO_PLAYON__ ?? null;
}

export function playOnAvailable(): boolean {
  return bridge() !== null;
}

export async function discoverTargets(): Promise<PlayTarget[]> {
  const b = bridge();
  if (!b) return [];
  try {
    return await b.discover();
  } catch {
    return [];
  }
}

export async function sendToTarget(
  target: PlayTarget,
  item: MediaItem,
  opts?: { season?: number; episode?: number; streamUrl?: string }
): Promise<void> {
  const b = bridge();
  if (!b) throw new Error("Play On is available in the TVio mobile app.");
  await b.send(target.id, {
    type: item.type,
    id: item.id,
    title: item.title,
    season: opts?.season,
    episode: opts?.episode,
    streamUrl: opts?.streamUrl,
  });
}
