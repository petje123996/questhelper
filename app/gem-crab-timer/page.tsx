"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, headBtn, bigBtn, ghostBtn } from "@/lib/theme";

const DURATION = 10 * 60; // gem crab respawns every 10 minutes
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
  const [secondsLeft, setSecondsLeft] = useState(DURATION);
  const [running, setRunning] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const endTimeRef = useRef<number | null>(null);
  const warnedRef = useRef(false);
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
    } else {
      setPermission(Notification.permission);
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
        notify("Gem crab bijna terug", "Nog 1 minuut — hou je klaar om door te klikken.");
        playBeep();
      }

      if (remaining <= 0) {
        notify("Gem crab timer klaar!", "Tijd om door te klikken.");
        playBeep();
        warnedRef.current = false;
        endTimeRef.current = Date.now() + DURATION * 1000;
        setSecondsLeft(DURATION);
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
    setSecondsLeft(DURATION);
    wakeLockRef.current?.release?.().catch(() => {});
    wakeLockRef.current = null;
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
          Herstart elke 10 minuten · meldt zich 1 minuut van tevoren
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
          {running ? (
            <button onClick={pause} style={{ ...bigBtn, cursor: "pointer" }}>
              ⏸ Pauzeer
            </button>
          ) : (
            <button onClick={start} style={{ ...bigBtn, cursor: "pointer" }}>
              ▶ Start
            </button>
          )}
          <button onClick={reset} style={{ ...ghostBtn, cursor: "pointer" }}>
            ↺ Reset naar 10:00
          </button>
        </div>

        {permission !== "granted" && permission !== "unsupported" && (
          <button onClick={requestPermission} style={{ ...ghostBtn, cursor: "pointer", fontSize: 12 }}>
            🔔 Meldingen inschakelen
          </button>
        )}
        {permission === "unsupported" && (
          <div style={{ fontSize: 11, color: C.textDim, textAlign: "center" }}>
            Meldingen worden niet ondersteund in deze browser — laat dit tabblad open voor de piep en de
            timer in de titelbalk.
          </div>
        )}
        {permission === "denied" && (
          <div style={{ fontSize: 11, color: C.textDim, textAlign: "center" }}>
            Meldingen staan uit voor deze site. Zet ze aan via je browserinstellingen om een pop-up te
            krijgen vlak voordat de timer afloopt.
          </div>
        )}
      </div>
    </div>
  );
}
