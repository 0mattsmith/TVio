import { useQuery } from "@tanstack/react-query";
import { parseM3U, parseXMLTV, fetchText } from "../iptv/parse";
import { EMPTY_EPG } from "../iptv/types";
import type { Channel, EpgData } from "../iptv/types";
import { useAppStore } from "../store/useAppStore";

// Load + merge all M3U playlists into a channel list. A failing playlist is
// skipped so one bad URL never blanks the guide.
export function useChannels() {
  const playlists = useAppStore((s) => s.iptvPlaylists);
  return useQuery({
    queryKey: ["iptv-channels", playlists.map((p) => p.url).join("|")],
    enabled: playlists.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const out: Channel[] = [];
      for (const p of playlists) {
        try {
          out.push(...parseM3U(await fetchText(p.url)));
        } catch {
          /* skip unreachable playlist */
        }
      }
      return out;
    },
  });
}

// Load + merge all XMLTV EPG sources.
export function useEpg() {
  const urls = useAppStore((s) => s.iptvEpgUrls);
  return useQuery({
    queryKey: ["iptv-epg", urls.map((u) => u.url).join("|")],
    enabled: urls.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const merged: EpgData = { programmes: new Map(), displayNames: new Map() };
      for (const u of urls) {
        try {
          const d = parseXMLTV(await fetchText(u.url));
          d.programmes.forEach((v, k) => merged.programmes.set(k, (merged.programmes.get(k) || []).concat(v)));
          d.displayNames.forEach((v, k) => merged.displayNames.set(k, v));
        } catch {
          /* skip unreachable EPG */
        }
      }
      merged.programmes.forEach((arr) => arr.sort((a, b) => a.start - b.start));
      return merged;
    },
  });
}

export function useGuide() {
  const channels = useChannels();
  const epg = useEpg();
  return {
    channels: channels.data || [],
    epg: epg.data || EMPTY_EPG,
    isLoading: channels.isLoading,
    isError: channels.isError,
    error: channels.error,
  };
}
