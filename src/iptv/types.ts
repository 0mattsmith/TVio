export interface Channel {
  id: string; // unique key within the app (tvg-id or a fallback)
  name: string;
  tvgId: string; // used to match EPG programmes
  logo: string | null;
  group: string;
  url: string;
}

export interface Programme {
  channelId: string; // matches Channel.tvgId
  start: number; // epoch ms
  stop: number; // epoch ms
  title: string;
  desc: string;
  category: string;
}

export interface EpgData {
  programmes: Map<string, Programme[]>; // key = channel id (tvg-id), sorted by start
  displayNames: Map<string, string>;
}

export const EMPTY_EPG: EpgData = { programmes: new Map(), displayNames: new Map() };
