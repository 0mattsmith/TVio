import type { Channel, Programme, EpgData } from "./types";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export function floorTo(ms: number, minutes: number): number {
  const step = minutes * MINUTE;
  return Math.floor(ms / step) * step;
}

export function programmesFor(epg: EpgData, channel: Channel): Programme[] {
  return epg.programmes.get(channel.tvgId) || epg.programmes.get(channel.id) || [];
}

export function programmesInWindow(list: Programme[], start: number, end: number): Programme[] {
  return list.filter((p) => p.stop > start && p.start < end);
}

export interface NowNext {
  current?: Programme;
  next?: Programme;
  index: number;
}

export function nowNext(list: Programme[], at: number = Date.now()): NowNext {
  const i = list.findIndex((p) => p.start <= at && p.stop > at);
  if (i >= 0) return { current: list[i], next: list[i + 1], index: i };
  // between programmes: find the next upcoming
  const ni = list.findIndex((p) => p.start > at);
  return { current: undefined, next: ni >= 0 ? list[ni] : undefined, index: ni };
}

export function progress(p: Programme | undefined, at: number = Date.now()): number {
  if (!p) return 0;
  const total = p.stop - p.start;
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, ((at - p.start) / total) * 100));
}

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtDuration(ms: number): string {
  const mins = Math.round(ms / MINUTE);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Group channels by their group-title, preserving first-seen order.
export function groupChannels(channels: Channel[]): { group: string; channels: Channel[] }[] {
  const order: string[] = [];
  const map = new Map<string, Channel[]>();
  for (const c of channels) {
    if (!map.has(c.group)) {
      map.set(c.group, []);
      order.push(c.group);
    }
    map.get(c.group)!.push(c);
  }
  return order.map((group) => ({ group, channels: map.get(group)! }));
}
