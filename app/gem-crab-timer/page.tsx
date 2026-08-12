"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, headBtn, bigBtn, ghostBtn } from "@/lib/theme";
import { loadStored, saveStored } from "@/lib/storage";

const DEFAULT_MINUTES = 10; // gem crab's HP bar drains from 100% to 0% over 10 minutes
const MIN_MINUTES = 0.5;
const MAX_MINUTES = 30;
const STORAGE_KEY = "qh-gem-crab-timer-minutes";

function fmt(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function clampMinutes(n: number): number {
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, n));
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

function notify(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: "gem-crab-timer" });
  } catch {
    /* notification unavailable */
  }
}

export default function GemCrabTimerPage() {
  const [baseMinutes, setBaseMinutes] = useState(DEFAULT_MINUTES);
  const [durationInput, setDurationInput] = useState(String(DEFAULT_MINUTES));
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_MINUTES * 60);
  const [running, setRunning] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const endTimeRef = useRef<number | null>(null);
  const warnedRef = useRef(false);
  const wakeLockRef = useRef<any>(null);
  const baseSecondsRef = useRef(DEFAULT_MINUTES * 60);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
    } else {
      setPermission(Notification.permission);
    }
    const saved = loadStored(STORAGE_KEY);
    if (typeof saved === "number" && Number.isFinite(saved) && saved > 0) {
      const clamped = clampMinutes(saved);
      setBaseMinutes(clamped);
      setDurationInput(String(clamped));
      setSecondsLeft(Math.round(clamped * 60));
    }
  }, []);

  useEffect(() => {
    baseSecondsRef.current = Math.round(baseMinutes * 60);
  }, [baseMinutes]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const end = endTimeRef.current;
      if (end === null) return;
      const remaining = Math.max(0, Math.round((end - Date.now()) / 1000));
      const warnAt = Math.min(60, Math.max(1, Math.floor(baseSecondsRef.current / 2)));

      if (remaining <= warnAt && !warnedRef.current && remaining > 0) {
        warnedRef.current = true;
        notify("Gem crab almost back", "One minute left — get ready to click through.");
        playBeep();
      }

      if (remaining <= 0) {
        notify("Gem crab timer done!", "Time to click through.");
        playBeep();
        warnedRef.current = false;
        endTimeRef.current = Date.now() + baseSecondsRef.current * 1000;
        setSecondsLeft(baseSecondsRef.current);
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
    setSecondsLeft(baseSecondsRef.current);
    wakeLockRef.current?.release?.().catch(() => {});
    wakeLockRef.current = null;
  };

  // Applies the typed duration right away: corrects the current countdown
  // (handy when you're joining late and reading the crab's HP% off-screen)
  // and becomes the new default that Reset and auto-loop use going forward.
  const applyDuration = () => {
    const parsed = parseFloat(durationInput.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDurationInput(String(baseMinutes));
      return;
    }
    const clamped = clampMinutes(parsed);
    const clampedSeconds = Math.round(clamped * 60);
    setBaseMinutes(clamped);
    setDurationInput(String(clamped));
    saveStored(STORAGE_KEY, clamped);
    warnedRef.current = false;
    setSecondsLeft(clampedSeconds);
    if (running) {
      endTimeRef.current = Date.now() + clampedSeconds * 1000;
    }
  };

  const baseSeconds = Math.round(baseMinutes * 60);
  const warnAtDisplay = Math.min(60, Math.max(1, Math.floor(baseSeconds / 2)));
  const critical = secondsLeft <= warnAtDisplay;

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
            ↺ Reset to {fmt(baseSeconds)}
          </button>
        </div>

        <div style={{ ...card, width: "100%", padding: "10px 12px", boxSizing: "border-box" }}>
          <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6 }}>
            Timer length (minutes) — adjust this if you're joining late
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="number"
              inputMode="decimal"
              step={0.1}
              min={MIN_MINUTES}
              max={MAX_MINUTES}
              value={durationInput}
              onChange={(e) => setDurationInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyDuration()}
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
            <button
              onClick={applyDuration}
              style={{ ...ghostBtn, width: "auto", padding: "8px 14px", fontSize: 13, cursor: "pointer" }}
            >
              Set
            </button>
          </div>
        </div>

        <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>
          The gem crab's HP bar drains from 100% to 0% over the full 10 minutes — each 1% is 6 seconds
          (0.1 minutes). So if you join when it's already at, say, 92% HP, set the timer to 9.2 minutes
          (92 × 0.1) instead of the full 10. You can also just type a plain number, like 6, for a shorter
          custom timer.
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
