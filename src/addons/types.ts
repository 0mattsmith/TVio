// Minimal Stremio-compatible addon protocol types.
// AIOStreams (and other Stremio addons) implement this exactly.

export interface AddonManifest {
  id: string;
  name: string;
  version?: string;
  description?: string;
  // resources may be plain strings ("stream", "meta") or objects with type/id constraints
  resources: (string | { name: string; types?: string[]; idPrefixes?: string[] })[];
  types: string[];
  idPrefixes?: string[];
  catalogs?: unknown[];
}

// behaviorHints.notWebReady / infoHash indicate a stream the browser can't play directly.
export interface Stream {
  name?: string; // provider/quality label (often multi-line)
  title?: string; // legacy description field
  description?: string; // current description field (filename, size, source…)
  url?: string; // direct, playable URL (debrid / http addons)
  externalUrl?: string; // open elsewhere
  ytId?: string; // youtube id
  infoHash?: string; // torrent — not playable in a browser
  fileIdx?: number;
  behaviorHints?: {
    bingeGroup?: string;
    filename?: string;
    videoSize?: number;
    notWebReady?: boolean;
  };
}

// A stream annotated with which addon produced it (for grouping/UX).
export interface ResolvedStream extends Stream {
  addonId: string;
  addonName: string;
}
