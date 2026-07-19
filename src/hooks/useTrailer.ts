import { useEffect, useState } from "react";
import type { Video } from "../services/types";
import { pickPlayableVideo } from "../services/trailers";

export type TrailerState =
  | { status: "checking"; video: null }
  | { status: "ready"; video: Video }
  | { status: "none"; video: null };

/**
 * Resolves the best video that actually plays, or "none" so the caller can hide
 * the section. Safe to call before the detail query has resolved.
 */
export function useTrailer(videos: Video[] | undefined): TrailerState {
  const [state, setState] = useState<TrailerState>({ status: "checking", video: null });

  // Keyed on the candidate list rather than the array identity, so a refetch
  // that returns the same videos doesn't re-probe them.
  const fingerprint = (videos || []).map((v) => `${v.site}:${v.key}`).join(",");

  useEffect(() => {
    if (!videos || videos.length === 0) {
      setState({ status: "none", video: null });
      return;
    }
    const controller = new AbortController();
    setState({ status: "checking", video: null });
    pickPlayableVideo(videos, controller.signal)
      .then((video) => {
        if (controller.signal.aborted) return;
        setState(video ? { status: "ready", video } : { status: "none", video: null });
      })
      .catch(() => setState({ status: "none", video: null }));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  return state;
}
