"use client";

import { useEffect, useRef } from "react";

// Makes the phone/browser back button close an open modal one step at a
// time, instead of navigating away from the page underneath it. Works by
// pushing a throwaway history entry while the modal is open; the back
// button then just pops that entry (triggering onClose) rather than
// leaving the route. Closing the modal normally (X button, selecting an
// item, etc.) leaves that entry in place, so the next back-press is a
// harmless no-op before the real navigation — a deliberate trade-off to
// avoid racing our own history.back() against real navigations (e.g. the
// "show on map" flow, which closes a modal and navigates in one action).
export function useCloseOnBack(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    // Reuse a dummy entry left behind by a previous modal that was closed
    // normally (not via back) instead of stacking a new one every time, so
    // repeated open/close cycles don't pile up history entries.
    if (!(window.history.state && window.history.state.qhModal)) {
      window.history.pushState({ qhModal: true }, "");
    }
    const handlePopState = () => onCloseRef.current();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isOpen]);
}
