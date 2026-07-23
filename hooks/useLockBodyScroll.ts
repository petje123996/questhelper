"use client";

import { useEffect } from "react";

// Reference-counted so multiple modals can be locked at once (e.g. the
// hamburger nav opened while a page-level modal is already showing)
// without one closing early and un-locking scroll for the other.
let lockCount = 0;

export function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    lockCount += 1;
    if (lockCount === 1) document.body.style.overflow = "hidden";
    return () => {
      lockCount -= 1;
      if (lockCount === 0) document.body.style.overflow = "";
    };
  }, [locked]);
}
