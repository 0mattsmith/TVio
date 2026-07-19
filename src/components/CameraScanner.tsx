import { useEffect, useRef, useState } from "react";
import { X, Camera } from "lucide-react";

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

/**
 * In-app QR scanner driven by the WebView's own camera.
 *
 * The native ML Kit scanner depends on a Google Play Services module that isn't
 * present on every device and can't always be installed — which is a single
 * point of failure for the only convenient way to sign in on a phone. This path
 * needs nothing but getUserMedia, so it works in the Android WebView and in the
 * browser build too, and serves as the fallback when the native one refuses.
 */
export function CameraScanner({
  onResult,
  onClose,
  note,
}: {
  onResult: (value: string) => void;
  onClose: () => void;
  note?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    const run = async () => {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      if (!Detector) {
        setError("This device can't scan QR codes in-app. Type the 8-character code instead.");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        setError(
          denied
            ? "Camera access was denied. Allow it for TVio in Android settings, then try again."
            : "Couldn't open the camera. Type the code instead."
        );
        return;
      }

      const video = videoRef.current;
      if (!video || stopped) return;
      video.srcObject = stream;
      await video.play().catch(() => {});

      const detector = new Detector({ formats: ["qr_code"] });
      const tick = async () => {
        if (stopped) return;
        try {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) {
            onResultRef.current(codes[0].rawValue);
            return;
          }
        } catch {
          // A frame that isn't decodable yet — just try the next one.
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    void run();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

      {/* Framing guide */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-56 w-56 rounded-2xl border-2 border-accent/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.55)]" />
      </div>

      <div className="relative z-10 flex items-start justify-between p-5">
        <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm font-semibold backdrop-blur">
          <Camera size={15} className="text-accent" /> Point at the code on your TV or PC
        </div>
        <button
          onClick={onClose}
          aria-label="Close scanner"
          className="focusable rounded-full bg-black/60 p-2 backdrop-blur"
        >
          <X size={18} />
        </button>
      </div>

      {(error || note) && (
        <div className="relative z-10 mt-auto p-5">
          {error && <p className="rounded-lg bg-black/70 p-3 text-sm text-red-300 backdrop-blur">{error}</p>}
          {note && !error && <p className="rounded-lg bg-black/70 p-3 text-xs text-muted backdrop-blur">{note}</p>}
        </div>
      )}
    </div>
  );
}
