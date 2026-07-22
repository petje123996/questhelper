"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, chip, headBtn } from "@/lib/theme";
import { capitalize, fmtNum } from "@/lib/format";
import { calcCombat } from "@/lib/quest";
import { loadStored } from "@/lib/storage";
import type { Player, Progress } from "@/lib/quest";

export default function ProfilePage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Progress>({});

  useEffect(() => {
    const savedPlayer = loadStored("qh-rsn");
    if (savedPlayer && savedPlayer.name && savedPlayer.skills) setPlayer(savedPlayer);

    const comp = loadStored("qh-completed");
    if (Array.isArray(comp)) setCompleted(new Set(comp));

    const prog = loadStored("qh-progress");
    if (prog && typeof prog === "object") setProgress(prog);
  }, []);

  const combatLevel = player ? calcCombat(player.skills) : null;
  const totalQp = Object.values(progress).reduce((s, p) => s + (p.qp || 0), 0);
  const xpTotals: Record<string, number> = {};
  Object.values(progress).forEach((p) => {
    Object.entries(p.xp || {}).forEach(([sk, amt]) => {
      xpTotals[sk] = (xpTotals[sk] || 0) + amt;
    });
  });
  const xpSorted = Object.entries(xpTotals).sort((a, b) => b[1] - a[1]);
  const completedList = Array.from(completed).sort();

  return (
    <div style={frame}>
      <div style={{ background: C.bg, borderBottom: `2px solid ${C.border}`, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ ...headBtn, textDecoration: "none", display: "inline-block" }}>
            ←
          </Link>
          <div style={{ ...goldTitle, fontSize: 17, fontWeight: 700, flex: 1 }}>👤 Profile</div>
          <Nav />
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 14px 40px" }}>
        {player ? (
          <div style={{ ...card, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ color: C.parch, fontWeight: 700, fontSize: 16 }}>{player.name}</div>
            {combatLevel !== null && (
              <div style={{ fontSize: 13, color: C.textDim }}>
                Combat level <b style={{ color: C.gold }}>{combatLevel}</b>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: C.textDim, marginBottom: 12 }}>
            Enter your RSN on the home screen to link your stats.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ ...card, flex: 1, padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.gold }}>{completedList.length}</div>
            <div style={{ fontSize: 12, color: C.textDim }}>🏆 Quests done</div>
          </div>
          <div style={{ ...card, flex: 1, padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.gold }}>{totalQp}</div>
            <div style={{ fontSize: 12, color: C.textDim }}>⭐ Quest points</div>
          </div>
        </div>

        <div style={{ ...goldTitle, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
          📈 XP earned from quests
        </div>
        {xpSorted.length === 0 && (
          <div style={{ fontSize: 13, color: C.textDim, marginBottom: 12 }}>
            No XP tracked yet — complete a quest (or tick one off as done) and its rewards will show up
            here.
          </div>
        )}
        {xpSorted.map(([sk, amt]) => (
          <div
            key={sk}
            style={{
              ...card,
              display: "flex",
              justifyContent: "space-between",
              padding: "9px 14px",
              marginBottom: 5,
              fontSize: 14,
            }}
          >
            <span style={{ color: C.parch }}>{capitalize(sk)}</span>
            <span style={{ color: C.gold, fontWeight: 700 }}>+{fmtNum(amt)} xp</span>
          </div>
        ))}

        <div style={{ ...goldTitle, fontSize: 15, fontWeight: 700, margin: "14px 0 6px" }}>
          ✅ Completed quests
        </div>
        {completedList.length === 0 && (
          <div style={{ fontSize: 13, color: C.textDim }}>
            Nothing completed yet — your adventure awaits!
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {completedList.map((n) => (
            <span key={n} style={{ ...chip, borderColor: C.green, color: C.textDim, fontSize: 12 }}>
              ✓ {n}
            </span>
          ))}
        </div>

        <div style={{ fontSize: 11, color: C.textDim, marginTop: 14 }}>
          Quest points and XP are tracked from quests completed in this app — including quests you tick
          off as already done, whose rewards are looked up from the wiki automatically.
        </div>
      </div>
    </div>
  );
}
