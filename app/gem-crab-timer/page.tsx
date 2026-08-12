"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, dashed, headBtn, bigBtn, ghostBtn } from "@/lib/theme";

const FULL_SECONDS = 10 * 60; // the 10-minute cycle
// The crab's HP drops to 99% almost instantly (the first hit), then drains
// to 0% over the full 10-minute cycle from there — 100% itself is never
// really observed for any meaningful stretch, so Start/Reset default to 99%
// instead of a theoretical 100%.
const START_PERCENT = 99;
const LIVE_TAG = "gem-crab-timer";
// Seconds-left checkpoints that each fire their own alert, most urgent last.
// A silently-updating live countdown notification isn't reliable — Android
// seems to just not repaint "silent" updates promptly — so this uses only
// one-off alerts instead, which fire correctly even when backgrounded.
const WARN_THRESHOLDS = [300, 120, 60] as const;

function thresholdLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

// `renotify` is part of the Notification Options spec but missing from this
// project's TS DOM lib version.
type NotifyOptions = NotificationOptions & { renotify?: boolean };

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
async function notify(
  title: string,
  body: string,
  registration: ServiceWorkerRegistration | null
): Promise<string> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "Notifications aren't supported in this browser.";
  }
  if (Notification.permission !== "granted") {
    return `Permission is "${Notification.permission}", not granted.`;
  }
  // renotify: true so each checkpoint re-alerts (sound/vibrate) even though
  // they share a tag and replace one another.
  const options: NotifyOptions = { body, tag: LIVE_TAG, renotify: true };
  if (registration) {
    try {
      await registration.showNotification(title, options);
      return "Sent via the service worker. If nothing appeared on screen, check Android's notification settings for Chrome (and this site's notification permission in Chrome's site settings).";
    } catch (err) {
      /* fall through to the direct constructor */
    }
  }
  try {
    new Notification(title, options);
    return "Sent via the direct Notification() constructor.";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Failed to show a notification: ${message}`;
  }
}

export default function GemCrabTimerPage() {
  const [percentInput, setPercentInput] = useState(String(START_PERCENT));
  const [secondsLeft, setSecondsLeft] = useState(FULL_SECONDS);
  const [running, setRunning] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [swStatus, setSwStatus] = useState<"pending" | "ready" | "unavailable">("pending");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const endTimeRef = useRef<number | null>(null);
  const warnedThresholdsRef = useRef<Set<number>>(new Set());
  const wakeLockRef = useRef<any>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const releaseWakeLock = () => {
    wakeLockRef.current?.release?.().catch(() => {});
    wakeLockRef.current = null;
  };

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
    } else {
      setPermission(Notification.permission);
    }
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => setSwStatus("unavailable"));
      // .ready only resolves once a worker is actually installed, activated,
      // and (thanks to clients.claim() in sw.js) controlling this page —
      // showNotification() can silently fail before that point, which is
      // why we don't use the registration returned by register() directly.
      navigator.serviceWorker.ready
        .then((reg) => {
          registrationRef.current = reg;
          setSwStatus("ready");
        })
        .catch(() => setSwStatus("unavailable"));
    } else {
      setSwStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    if (!running) return;

    const tick = () => {
      const end = endTimeRef.current;
      if (end === null) return;
      const remaining = Math.max(0, Math.round((end - Date.now()) / 1000));

      // Fire every checkpoint newly crossed since the last check. If several
      // were crossed at once (e.g. the tab was backgrounded for a while),
      // only alert for the most urgent one — the others are stale by now.
      const newlyCrossed = WARN_THRESHOLDS.filter(
        (t) => remaining <= t && remaining > 0 && !warnedThresholdsRef.current.has(t)
      );
      if (newlyCrossed.length > 0) {
        newlyCrossed.forEach((t) => warnedThresholdsRef.current.add(t));
        const mostUrgent = Math.min(...newlyCrossed);
        notify(
          "Gem crab timer",
          `${thresholdLabel(mostUrgent)} left — get ready to click through.`,
          registrationRef.current
        );
        playBeep();
      }

      if (remaining <= 0) {
        notify("Gem crab timer done!", "Time to click through — paused, ready for the next crab.", registrationRef.current);
        playBeep();
        warnedThresholdsRef.current.clear();
        endTimeRef.current = null;
        setPercentInput(String(START_PERCENT));
        setSecondsLeft(FULL_SECONDS);
        setRunning(false);
        releaseWakeLock();
        return;
      }

      setSecondsLeft(remaining);
    };

    const id = setInterval(tick, 250);
    // Background tabs (e.g. while scrolling another app) can have their
    // timers throttled or fully paused by the OS/browser, so a warning can
    // arrive late. Re-check immediately when the tab regains visibility
    // instead of waiting for the next throttled tick.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
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

  const sendTestNotification = async () => {
    setTesting(true);
    setTestResult(null);
    if (permission === "default") await requestPermission();
    const result = await notify(
      "Test notification",
      "If this shows up as a real system notification, it works.",
      registrationRef.current
    );
    setTestResult(result);
    setTesting(false);
  };

  const start = async () => {
    warnedThresholdsRef.current.clear();
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
    releaseWakeLock();
  };

  const reset = () => {
    setRunning(false);
    warnedThresholdsRef.current.clear();
    endTimeRef.current = null;
    setPercentInput(String(START_PERCENT));
    setSecondsLeft(FULL_SECONDS);
    releaseWakeLock();
  };

  // Jumps the countdown straight to match the crab's HP% (handy when
  // joining late and reading it off-screen) without changing what Reset
  // and the auto-loop fall back to — a new crab always starts at 99%.
  const applyPercent = () => {
    const parsed = parseFloat(percentInput.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setPercentInput(String(START_PERCENT));
      return;
    }
    const clampedPercent = Math.min(START_PERCENT, Math.max(1, parsed));
    const newSeconds = Math.round((FULL_SECONDS * clampedPercent) / START_PERCENT);
    setPercentInput(String(clampedPercent));
    warnedThresholdsRef.current.clear();
    setSecondsLeft(newSeconds);
    if (running) {
      endTimeRef.current = Date.now() + newSeconds * 1000;
    }
  };

  const critical = secondsLeft <= Math.min(...WARN_THRESHOLDS);
  const percentLeft = Math.max(0, Math.min(START_PERCENT, Math.round((secondsLeft / FULL_SECONDS) * START_PERCENT)));

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
            display: "flex",
            alignItems: "baseline",
            justifyContent: "center",
            gap: 10,
            flexWrap: "wrap",
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
          <div
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: "clamp(22px, 9vw, 36px)",
              fontWeight: 700,
              color: critical ? C.red : C.goldDim,
              fontVariantNumeric: "tabular-nums",
              transition: "color .2s",
            }}
          >
            {percentLeft}%
          </div>
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
              max={START_PERCENT}
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

        {permission !== "granted" && permission !== "unsupported" && (
          <button onClick={requestPermission} style={{ ...ghostBtn, cursor: "pointer", fontSize: 12 }}>
            🔔 Enable notifications
          </button>
        )}
        {permission === "granted" && (
          <>
            <div style={{ fontSize: 11, color: C.textDim, textAlign: "center" }}>
              {swStatus === "ready"
                ? "🔔 Notifications ready"
                : swStatus === "pending"
                  ? "⏳ Setting up notifications…"
                  : "⚠️ Notifications may not fire on this browser — the beep and tab title still will"}
            </div>
            <button
              onClick={sendTestNotification}
              disabled={testing}
              style={{ ...ghostBtn, cursor: testing ? "default" : "pointer", fontSize: 12 }}
            >
              {testing ? "Sending…" : "🔔 Send test notification now"}
            </button>
            {testResult && (
              <div style={{ fontSize: 11, color: C.textDim, textAlign: "center", lineHeight: 1.5 }}>
                {testResult}
              </div>
            )}
          </>
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

        <div style={{ ...dashed, width: "100%" }} />

        <div style={{ fontSize: 11, color: C.textDim, textAlign: "center" }}>
          Compare the % above against the crab's HP bar to check for drift.
        </div>
        <div style={{ fontSize: 11, color: C.textDim, textAlign: "center" }}>
          Sends a notification at 5, 2, and 1 minute(s) left, and when it hits 0, then pauses and resets
          to 10:00.
        </div>
        <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>
          The crab's HP drops to 99% almost instantly (the first hit), then drains to 0% over the full
          10 minutes from there — that's why Start/Reset default to 99%, not 100%. Each 1% is roughly 6
          seconds. So if you join when it's already lower, say 80% HP, enter 80 to jump the timer to
          match. Reset and hitting 0:00 both bring it back to a fresh 10:00 at 99%, paused — press Start
          again once you're at the next crab. This is still being calibrated against real drop timing,
          so treat it as an estimate for now.
        </div>
        <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>
          Heads up: these are one-off alerts rather than a live-updating display, because that turned out
          to be the reliable part — a notification that keeps refreshing its own text seems to freeze on
          some phones once the app is in the background, even with battery restrictions turned off for
          it. The on-screen countdown itself can still lag behind reality after a long time backgrounded;
          reopening the tab corrects it immediately.
        </div>
      </div>
    </div>
  );
}
