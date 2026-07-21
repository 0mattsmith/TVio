import { useEffect, useRef } from "react";

/**
 * Makes the hardware Back button close an overlay instead of leaving the app.
 *
 * On Android, Back with nothing on the history stack quits the app outright —
 * so opening a sheet and pressing Back closed TVio rather than the sheet. There
 * is no key event to intercept for it either; the WebView turns Back into
 * history navigation.
 *
 * So we give it something to navigate: a history entry pushed when the overlay
 * opens, popped by Back, which we treat as a close. Closing by any other route
 * removes the entry again so the history stack doesn't grow.
 */
export function useOverlayBack(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    let poppedByBack = false;
    history.pushState({ tvioOverlay: true }, "");

    const onPop = () => {
      poppedByBack = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed some other way (a button, a selection) — drop the entry we
      // added, or Back would later pop an overlay that's no longer open.
      if (!poppedByBack && (history.state as { tvioOverlay?: boolean } | null)?.tvioOverlay) {
        history.back();
      }
    };
  }, [open]);
}
