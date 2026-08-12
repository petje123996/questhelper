"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, headBtn, bigBtn, ghostBtn } from "@/lib/theme";

const FULL_SECONDS = 10 * 60; // the crab's HP bar drains from 100% to 0% over 10 minutes
const WARN_AT = 60; // send a "get ready" notification with 1 minute left

function fmt(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function playBeep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close();
  } catch {
    /* audio unavailable */
  }
}

// Android Chrome (and most other mobile browsers) refuse `new Notification()`
// from a page context — it throws "Illegal constructor" and silently does
// nothing under our try/catch. They require going through a registered
// service worker's showNotification() instead, which also works fine on
// desktop, so we always prefer it and only fall back to the plain
// constructor if no registration is available.
async function notify(title: string, body: string, registration: ServiceWorkerRegistration | null) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const options: NotificationOptions = { body, tag: "gem-crab-timer" };
  if (registration) {
    try {
      await registration.showNotification(title, options);
      return;
    } catch {
      /* fall through to the direct constructor */
    }
  }
  try {
    new Notification(title, options);
  } catch {
    /* notification unavailable on this browser */
  }
}

export default function GemCrabTimerPage() {
  const [percentInput, setPercentInput] = useState("100");
  const [secondsLeft, setSecondsLeft] = useState(FULL_SECONDS);
  const [running, setRunning] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const endTimeRef = useRef<number | null>(null);
  const warnedRef = useRef(false);
  const wakeLockRef = useRef<any>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
    } else {
      setPermission(Notification.permission);
    }
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          registrationRef.current = reg;
        })
        .catch(() => {
          /* notifications will fall back to the plain constructor */
        });
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const end = endTimeRef.current;
      if (end === null) return;
      const remaining = Math.max(0, Math.round((end - Date.now()) / 1000));

      if (remaining <= WARN_AT && !warnedRef.current && remaining > 0) {
        warnedRef.current = true;
        notify("Gem crab almost back", "One minute left — get ready to click through.", registrationRef.current);
        playBeep();
      }

      if (remaining <= 0) {
        notify("Gem crab timer done!", "Time to click through.", registrationRef.current);
        playBeep();
        warnedRef.current = false;
        endTimeRef.current = Date.now() + FULL_SECONDS * 1000;
        setPercentInput("100");
        setSecondsLeft(FULL_SECONDS);
        return;
      }

      setSecondsLeft(remaining);
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running) {
      document.title = "OSRS Quest Helper";
      return;
    }
    document.title = `⏱ ${fmt(secondsLeft)} · Gem Crab`;
  }, [running, secondsLeft]);

  useEffect(() => {
    return () => {
      wakeLockRef.current?.release?.().catch(() => {});
    };
  }, []);

  const requestPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const start = async () => {
    warnedRef.current = false;
    endTimeRef.current = Date.now() + secondsLeft * 1000;
    setRunning(true);
    if (permission === "default") await requestPermission();
    try {
      wakeLockRef.current = await (navigator as any).wakeLock?.request?.("screen");
    } catch {
      /* wake lock unavailable */
    }
  };

  const pause = () => {
    setRunning(false);
    wakeLockRef.current?.release?.().catch(() => {});
    wakeLockRef.current = null;
  };

  const reset = () => {
    setRunning(false);
    warnedRef.current = false;
    endTimeRef.current = null;
    setPercentInput("100");
    setSecondsLeft(FULL_SECONDS);
    wakeLockRef.current?.release?.().catch(() => {});
    wakeLockRef.current = null;
  };

  // Jumps the countdown straight to match the crab's HP% (handy when
  // joining late and reading it off-screen) without changing what Reset
  // and the auto-loop fall back to — a new crab always spawns at 100%.
  const applyPercent = () => {
    const parsed = parseFloat(percentInput.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setPercentInput("100");
      return;
    }
    const clampedPercent = Math.min(100, Math.max(1, parsed));
    const newSeconds = Math.round((FULL_SECONDS * clampedPercent) / 100);
    setPercentInput(String(clampedPercent));
    warnedRef.current = false;
    setSecondsLeft(newSeconds);
    if (running) {
      endTimeRef.current = Date.now() + newSeconds * 1000;
    }
  };

  const critical = secondsLeft <= WARN_AT;

  return (
    <div style={frame}>
      <div style={{ background: C.bg, borderBottom: `2px solid ${C.border}`, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ ...headBtn, textDecoration: "none", display: "inline-block" }}>
            ←
          </Link>
          <div style={{ ...goldTitle, fontSize: 17, fontWeight: 700, flex: 1 }}>🦀 Gem Crab Timer</div>
          <Nav />
        </div>
      </div>

      <div
        style={{
          maxWidth: 360,
          margin: "0 auto",
          padding: "16px 14px 32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "clamp(48px, 22vw, 84px)",
            fontWeight: 700,
            lineHeight: 1,
            color: critical ? C.red : C.gold,
            fontVariantNumeric: "tabular-nums",
            transition: "color .2s",
          }}
        >
          {fmt(secondsLeft)}
        </div>

        <div style={{ fontSize: 12, color: C.textDim, textAlign: "center" }}>
          Loops automatically when it hits 0 · notifies you before time's up
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
          {running ? (
            <button onClick={pause} style={{ ...bigBtn, cursor: "pointer" }}>
              ⏸ Pause
            </button>
          ) : (
            <button onClick={start} style={{ ...bigBtn, cursor: "pointer" }}>
              ▶ Start
            </button>
          )}
          <button onClick={reset} style={{ ...ghostBtn, cursor: "pointer" }}>
            ↺ Reset to 10:00
          </button>
        </div>

        <div style={{ ...card, width: "100%", padding: "10px 12px", boxSizing: "border-box" }}>
          <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6 }}>
            Crab HP% left — jump the timer to match when you join late
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="number"
              inputMode="decimal"
              step={1}
              min={1}
              max={100}
              value={percentInput}
              onChange={(e) => setPercentInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyPercent()}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "8px 10px",
                fontSize: 14,
                background: C.panelSoft,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 8,
                color: C.text,
                boxSizing: "border-box",
              }}
            />
            <span style={{ alignSelf: "center", color: C.textDim, fontSize: 14 }}>%</span>
            <button
              onClick={applyPercent}
              style={{ ...ghostBtn, width: "auto", padding: "8px 14px", fontSize: 13, cursor: "pointer" }}
            >
              Set
            </button>
          </div>
        </div>

        <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>
          The gem crab's HP bar drains from 100% to 0% over the full 10 minutes — each 1% is 6 seconds
          (0.1 minutes). So if you join when it's already at, say, 92% HP, enter 92 to jump the timer to
          9:12. Reset and the auto-loop after 0:00 always go back to a fresh 10:00, since a new crab
          always spawns at full HP.
        </div>

        {permission !== "granted" && permission !== "unsupported" && (
          <button onClick={requestPermission} style={{ ...ghostBtn, cursor: "pointer", fontSize: 12 }}>
            🔔 Enable notifications
          </button>
        )}
        {permission === "unsupported" && (
          <div style={{ fontSize: 11, color: C.textDim, textAlign: "center" }}>
            Notifications aren't supported in this browser — keep this tab open for the beep and the
            tab-title countdown.
          </div>
        )}
        {permission === "denied" && (
          <div style={{ fontSize: 11, color: C.textDim, textAlign: "center" }}>
            Notifications are turned off for this site. Enable them in your browser settings to get a
            pop-up right before the timer runs out.
          </div>
        )}
      </div>
    </div>
  );
}
