// FAST (Free Ad-Supported Streaming TV) presets.
//
// These are public M3U + XMLTV feeds for the big FAST services (Pluto TV,
// Samsung TV Plus, Plex), maintained by Matt Huisman (i.mjh.nz) — the same
// source FastChannels itself credits. Adding one drops its playlist and EPG
// straight into the IPTV pipeline, so channels appear in the Live TV guide with
// programme data. Region codes: gb = UK. EPGs use the gzipped .xml.gz (small).
//
// Note: some hosts block browser (CORS) requests, so a preset that won't load in
// the web/PWA build still works in the Android / desktop builds. For an always-
// fresh, self-hosted lineup, point TVio at a FastChannels server instead (below).

export interface FastPreset {
  key: string;
  service: string;
  region: string; // display label, e.g. "UK"
  m3u: string;
  epg: string;
}

const MJH = "https://i.mjh.nz";

function mjh(service: string, code: string): { m3u: string; epg: string } {
  return { m3u: `${MJH}/${service}/${code}.m3u8`, epg: `${MJH}/${service}/${code}.xml.gz` };
}

// Ordered UK-first (the user's primary market), then US, CA, AU where offered.
export const FAST_PRESETS: FastPreset[] = [
  { key: "pluto-gb", service: "Pluto TV", region: "UK", ...mjh("PlutoTV", "gb") },
  { key: "pluto-us", service: "Pluto TV", region: "US", ...mjh("PlutoTV", "us") },
  { key: "pluto-ca", service: "Pluto TV", region: "CA", ...mjh("PlutoTV", "ca") },
  { key: "samsung-gb", service: "Samsung TV Plus", region: "UK", ...mjh("SamsungTVPlus", "gb") },
  { key: "samsung-us", service: "Samsung TV Plus", region: "US", ...mjh("SamsungTVPlus", "us") },
  { key: "samsung-ca", service: "Samsung TV Plus", region: "CA", ...mjh("SamsungTVPlus", "ca") },
  { key: "plex-gb", service: "Plex", region: "UK", ...mjh("Plex", "gb") },
  { key: "plex-us", service: "Plex", region: "US", ...mjh("Plex", "us") },
  { key: "plex-ca", service: "Plex", region: "CA", ...mjh("Plex", "ca") },
  { key: "plex-au", service: "Plex", region: "AU", ...mjh("Plex", "au") },
];

export function fastPresetName(p: FastPreset): string {
  return `${p.service} (${p.region})`;
}

/**
 * A self-hosted FastChannels server (Docker) exposes its default feed at these
 * paths. Point TVio at the server's base URL (e.g. http://192.168.1.50:5523) and
 * it loads that feed's M3U + EPG — always-fresh streams, no CORS issues on a LAN.
 */
export function fastChannelsFeed(baseUrl: string, feed = "default"): { m3u: string; epg: string } {
  const b = baseUrl.trim().replace(/\/+$/, "");
  return { m3u: `${b}/feeds/${feed}/m3u`, epg: `${b}/feeds/${feed}/epg.xml` };
}
