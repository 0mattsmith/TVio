import { useEffect, useState, type RefObject } from "react";
import { Cast, Airplay } from "lucide-react";

/**
 * Sends the video — and only the video — to an AirPlay or Chromecast target.
 *
 * Deliberately no Cast SDK. Both of these are element-level browser APIs that
 * hand the media stream to the receiver, so the TV plays the video directly
 * while the phone keeps showing the app and acts as the remote. Screen
 * mirroring would send the whole interface, which is what we don't want.
 *
 *   AirPlay      webkitShowPlaybackTargetPicker() — Safari, so iPhone/iPad/Mac
 *   Chromecast   HTMLMediaElement.remote.prompt() — Chrome, so Android
 *
 * Neither button appears unless a receiver has actually been found on the
 * network, which is also the honest signal that the feature is working.
 */

interface WebKitVideo extends HTMLVideoElement {
  webkitShowPlaybackTargetPicker?: () => void;
}

type Availability = "unknown" | "available" | "not-available";

export function CastButton({ videoRef }: { videoRef: RefObject<HTMLVideoElement> }) {
  const [airplay, setAirplay] = useState<Availability>("unknown");
  const [remote, setRemote] = useState<Availability>("unknown");

  useEffect(() => {
    const video = videoRef.current as WebKitVideo | null;
    if (!video) return;

    // --- AirPlay (Safari) ---
    const onTargetChange = (e: Event) => {
      const availability = (e as Event & { availability?: string }).availability;
      setAirplay(availability === "available" ? "available" : "not-available");
    };
    const supportsAirplay =
      typeof video.webkitShowPlaybackTargetPicker === "function" &&
      "WebKitPlaybackTargetAvailabilityEvent" in window;
    if (supportsAirplay) {
      video.addEventListener("webkitplaybacktargetavailabilitychanged", onTargetChange);
    }

    // --- Remote Playback / Chromecast (Chrome) ---
    let watchId: number | undefined;
    const rp = video.remote;
    if (rp?.watchAvailability) {
      rp.watchAvailability((available) => setRemote(available ? "available" : "not-available"))
        .then((id) => {
          watchId = id;
        })
        // Some builds — Android WebView in particular — expose the object but
        // refuse to watch. Treat that as "no receivers" rather than crashing.
        .catch(() => setRemote("not-available"));
    }

    return () => {
      if (supportsAirplay) {
        video.removeEventListener("webkitplaybacktargetavailabilitychanged", onTargetChange);
      }
      if (watchId !== undefined) rp?.cancelWatchAvailability?.(watchId).catch(() => {});
    };
  }, [videoRef]);

  const showAirplay = airplay === "available";
  const showRemote = remote === "available";
  if (!showAirplay && !showRemote) return null;

  return (
    <>
      {showAirplay && (
        <button
          onClick={() => (videoRef.current as WebKitVideo | null)?.webkitShowPlaybackTargetPicker?.()}
          className="focusable"
          aria-label="AirPlay"
          title="Play on Apple TV"
        >
          <Airplay size={22} />
        </button>
      )}
      {showRemote && (
        <button
          onClick={() => videoRef.current?.remote?.prompt().catch(() => {})}
          className="focusable"
          aria-label="Cast"
          title="Play on a Chromecast"
        >
          <Cast size={22} />
        </button>
      )}
    </>
  );
}
