"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, chip, headBtn } from "@/lib/theme";
import { capitalize, fmtNum } from "@/lib/format";
import { loadStored } from "@/lib/storage";
import { computeDashboard } from "@/lib/dashboard";
import type { DashboardData } from "@/lib/dashboard";
import type { Player } from "@/lib/quest";

const sectionTitle: React.CSSProperties = {
  ...goldTitle,
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 8,
};

function EmptyPrompt({ children, href, cta }: { children: React.ReactNode; href: string; cta: string }) {
  return (
    <div style={{ ...card, padding: "12px 14px", fontSize: 13, color: C.textDim }}>
      {children}
      <Link
        href={href}
        style={{
          display: "block",
          marginTop: 8,
          color: C.gold,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        {cta} →
      </Link>
    </div>
  );
}

export default function DashboardPage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const savedPlayer = loadStored("qh-rsn");
    const p: Player | null = savedPlayer && savedPlayer.name && savedPlayer.skills ? savedPlayer : null;
    setPlayer(p);
    setData(computeDashboard(p));
  }, []);

  return (
    <div style={frame}>
      <div style={{ background: C.bg, borderBottom: `2px solid ${C.border}`, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ ...headBtn, textDecoration: "none", display: "inline-block" }}>
            ←
          </Link>
          <div style={{ ...goldTitle, fontSize: 17, fontWeight: 700, flex: 1 }}>📋 Today</div>
          <Nav />
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 14px 40px" }}>
        <div style={{ fontSize: 13, color: C.textDim, marginBottom: 16 }}>
          Everything worth doing next, in one place — pulled from whatever the other pages have already
          loaded on this device.
        </div>

        {!player && (
          <div style={{ ...card, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: C.textDim }}>
            👤 Load your RSN in{" "}
            <Link href="/profile" style={{ color: C.gold, fontWeight: 700 }}>
              Profile
            </Link>{" "}
            to unlock the diary and training spot sections below.
          </div>
        )}

        {/* Next quest */}
        <div style={sectionTitle}>🎯 Next quest</div>
        <div style={{ marginBottom: 18 }}>
          {data?.nextQuest ? (
            <Link
              href={`/?quest=${encodeURIComponent(data.nextQuest)}`}
              style={{ ...card, display: "block", padding: "12px 14px", textDecoration: "none" }}
            >
              <div style={{ color: C.parch, fontWeight: 700, fontSize: 15 }}>{data.nextQuest}</div>
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>
                From the Optimal Quest Guide — tap to start
              </div>
            </Link>
          ) : (
            <EmptyPrompt href="/" cta="Go to Quests">
              No quest data cached yet — visit Quests once and this will fill in automatically.
            </EmptyPrompt>
          )}
        </div>

        {/* Almost-there diary tasks */}
        <div style={sectionTitle}>📔 Almost-there diary tasks</div>
        <div style={{ marginBottom: 18 }}>
          {!player ? (
            <div style={{ ...card, padding: "12px 14px", fontSize: 13, color: C.textDim }}>
              Load your RSN to see which diary tasks you're closest to unlocking.
            </div>
          ) : !data?.hasDiaryData ? (
            <EmptyPrompt href="/diaries" cta="Go to Achievement Diaries">
              No diary regions loaded yet — open a region once and this will check it for tasks you're
              close to unlocking.
            </EmptyPrompt>
          ) : data.almostThereDiary.length === 0 ? (
            <div style={{ ...card, padding: "12px 14px", fontSize: 13, color: C.textDim }}>
              Nothing within reach in the regions you've loaded so far — nice and caught up, or check
              more regions in{" "}
              <Link href="/diaries" style={{ color: C.gold }}>
                Diaries
              </Link>
              .
            </div>
          ) : (
            <div style={{ ...card, overflow: "hidden" }}>
              {data.almostThereDiary.slice(0, 5).map((t, i) => (
                <Link
                  key={`${t.region}::${t.tier}::${t.task}`}
                  href="/diaries"
                  style={{
                    display: "block",
                    padding: "10px 14px",
                    borderBottom:
                      i < Math.min(5, data.almostThereDiary.length) - 1 ? `1px solid ${C.borderSoft}` : "none",
                    textDecoration: "none",
                  }}
                >
                  <div style={{ fontSize: 13, color: C.text }}>{t.task}</div>
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                    {t.region} · {t.tier} —{" "}
                    <span style={{ color: C.gold }}>
                      {capitalize(t.skill)} {t.playerLevel} → {t.neededLevel}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Next Combat Achievement */}
        <div style={sectionTitle}>🗡️ Next Combat Achievement</div>
        <div style={{ marginBottom: 18 }}>
          {data?.nextCaTask ? (
            <Link
              href="/combat-achievements"
              style={{ ...card, display: "block", padding: "12px 14px", textDecoration: "none" }}
            >
              <div style={{ color: C.parch, fontSize: 14 }}>{data.nextCaTask.text}</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                {data.nextCaTask.monster ? `${data.nextCaTask.monster} · ` : ""}
                {data.nextCaTask.tier}
              </div>
            </Link>
          ) : (
            <EmptyPrompt href="/combat-achievements" cta="Go to Combat Achievements">
              No Combat Achievement data cached yet — visit the page once and this will fill in
              automatically.
            </EmptyPrompt>
          )}
        </div>

        {/* Best training spot */}
        <div style={sectionTitle}>🛡️ Best training spot</div>
        <div>
          {!player ? (
            <div style={{ ...card, padding: "12px 14px", fontSize: 13, color: C.textDim }}>
              Load your RSN to see a training spot recommendation here.
            </div>
          ) : data?.trainingSpot ? (
            <Link
              href="/combat-adviser"
              style={{ ...card, display: "block", padding: "12px 14px", textDecoration: "none" }}
            >
              <div style={{ color: C.parch, fontWeight: 700, fontSize: 15 }}>
                {data.trainingSpot.entry.name}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                <span style={chip}>❤️ {fmtNum(data.trainingSpot.entry.hitpoints)} HP</span>
                <span style={chip}>📈 ~{fmtNum(data.trainingSpot.entry.xpPerKill)} xp/kill</span>
                <span style={chip}>{data.trainingSpot.members ? "💎 Members" : "🔓 F2P"}</span>
              </div>
            </Link>
          ) : (
            <EmptyPrompt href="/combat-adviser" cta="Go to Combat Adviser">
              No training data cached yet for your level — visit the Combat Adviser once and this will
              fill in automatically.
            </EmptyPrompt>
          )}
        </div>
      </div>
    </div>
  );
}
