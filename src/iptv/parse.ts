import type { Channel, Programme, EpgData } from "./types";

// --- M3U / M3U8 playlist parsing ---------------------------------------------
// Handles standard IPTV playlists:
//   #EXTM3U
//   #EXTINF:-1 tvg-id="BBC1.uk" tvg-name="BBC One" tvg-logo="http://…" group-title="UK",BBC One
//   http://server/stream/bbc1.m3u8
export function parseM3U(text: string): Channel[] {
  const lines = text.split(/\r?\n/);
  const channels: Channel[] = [];
  let pending: { name: string; tvgId: string; logo: string | null; group: string } | null = null;
  let seq = 0;

  const attr = (meta: string, key: string) => {
    const m = meta.match(new RegExp(`${key}="([^"]*)"`, "i"));
    return m ? m[1] : "";
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.toUpperCase().startsWith("#EXTINF")) {
      const after = line.slice(line.indexOf(":") + 1);
      const comma = after.lastIndexOf(",");
      const meta = comma >= 0 ? after.slice(0, comma) : after;
      const name = (comma >= 0 ? after.slice(comma + 1) : "").trim();
      pending = {
        name: name || attr(meta, "tvg-name") || "Channel",
        tvgId: attr(meta, "tvg-id"),
        logo: attr(meta, "tvg-logo") || null,
        group: attr(meta, "group-title") || "Other",
      };
    } else if (line.startsWith("#")) {
      // ignore other tags (#EXTVLCOPT, #EXTGRP, etc.)
      continue;
    } else if (pending) {
      channels.push({
        id: pending.tvgId || `${slug(pending.name)}-${seq}`,
        name: pending.name,
        tvgId: pending.tvgId,
        logo: pending.logo,
        group: pending.group,
        url: line,
      });
      seq++;
      pending = null;
    }
  }
  return channels;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// --- XMLTV EPG parsing --------------------------------------------------------
// Retain only a useful window around "now" (default: last 6h .. next 72h). EPG
// files often carry days/weeks of data; dropping the rest keeps memory and
// rendering cost bounded.
const KEEP_PAST = 6 * 60 * 60_000;
const KEEP_FUTURE = 72 * 60 * 60_000;

export function parseXMLTV(xml: string, now: number = Date.now()): EpgData {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const programmes = new Map<string, Programme[]>();
  const displayNames = new Map<string, string>();
  const minStop = now - KEEP_PAST;
  const maxStart = now + KEEP_FUTURE;

  doc.querySelectorAll("channel").forEach((ch) => {
    const id = ch.getAttribute("id") || "";
    const dn = ch.querySelector("display-name")?.textContent?.trim() || "";
    if (id) displayNames.set(id, dn);
  });

  doc.querySelectorAll("programme").forEach((p) => {
    const channelId = p.getAttribute("channel") || "";
    const start = xmltvTime(p.getAttribute("start"));
    const stop = xmltvTime(p.getAttribute("stop"));
    if (!channelId || !start || !stop) return;
    if (stop < minStop || start > maxStart) return; // outside the kept window
    const prog: Programme = {
      channelId,
      start,
      stop,
      title: p.querySelector("title")?.textContent?.trim() || "Untitled",
      desc: p.querySelector("desc")?.textContent?.trim() || "",
      category: p.querySelector("category")?.textContent?.trim() || "",
    };
    const arr = programmes.get(channelId);
    if (arr) arr.push(prog);
    else programmes.set(channelId, [prog]);
  });

  programmes.forEach((arr) => arr.sort((a, b) => a.start - b.start));
  return { programmes, displayNames };
}

// XMLTV time: "20260718203000 +0000" → epoch ms
function xmltvTime(s: string | null): number {
  if (!s) return 0;
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);
  if (!m) return Date.parse(s) || 0;
  const [, Y, Mo, D, H, Mi, Se, tz] = m;
  const zone = tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : "Z";
  return Date.parse(`${Y}-${Mo}-${D}T${H}:${Mi}:${Se || "00"}${zone}`) || 0;
}

// --- Fetching (with optional gzip) -------------------------------------------
export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const gz = /\.gz(\?|$)/i.test(url);
  const DS = (window as unknown as { DecompressionStream?: unknown }).DecompressionStream;
  if (gz && res.body && typeof DS === "function") {
    const stream = res.body.pipeThrough(new (DS as { new (f: string): GenericTransformStream })("gzip"));
    return new Response(stream).text();
  }
  return res.text();
}
