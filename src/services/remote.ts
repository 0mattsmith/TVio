// Companion remote transport. The mobile app (and, on a limited basis, the Lite
// web build over a Firebase relay) drives a big-screen TVio app: directional
// navigation, common keys, and text entry so you can type searches with your
// phone instead of an on-screen keyboard.
//
// The native mobile build injects `window.__TVIO_REMOTE__` backed by the LAN
// companion socket / Bluetooth / Firebase relay. Absent that bridge (plain web),
// remoteAvailable() is false and sends throw a helpful message.

export type RemoteKey =
  | "up" | "down" | "left" | "right" | "ok"
  | "back" | "home" | "playpause"
  | "volup" | "voldown" | "mute";

interface RemoteBridge {
  sendKey: (targetId: string, key: RemoteKey) => Promise<void> | void;
  sendText: (targetId: string, text: string) => Promise<void> | void;
}

function bridge(): RemoteBridge | null {
  return (window as unknown as { __TVIO_REMOTE__?: RemoteBridge }).__TVIO_REMOTE__ ?? null;
}

export function remoteAvailable(): boolean {
  return bridge() !== null;
}

export async function sendKey(targetId: string, key: RemoteKey): Promise<void> {
  const b = bridge();
  if (!b) throw new Error("The remote works from the TVio mobile app on the same network as your TV / PC.");
  await b.sendKey(targetId, key);
}

export async function sendText(targetId: string, text: string): Promise<void> {
  const b = bridge();
  if (!b) throw new Error("The keyboard works from the TVio mobile app on the same network as your TV / PC.");
  await b.sendText(targetId, text);
}
