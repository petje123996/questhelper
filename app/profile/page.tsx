"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, chip, headBtn } from "@/lib/theme";
import { capitalize, fmtNum, normalizeSkill } from "@/lib/format";
import { calcCombat } from "@/lib/quest";
import { loadStored, saveStored, removeStored, removeStoredByPrefix } from "@/lib/storage";
import type { Player, Progress } from "@/lib/quest";

// Matches the order the OSRS hiscores API itself returns skills in.
// "overall" is returned too (as the total level) but shown separately,
// not mixed into the individual skills grid.
const SKILL_ORDER = [
  "attack", "defence", "strength", "hitpoints", "ranged", "prayer", "magic",
  "cooking", "woodcutting", "fletching", "fishing", "firemaking", "crafting",
  "smithing", "mining", "herblore", "agility", "thieving", "slayer",
  "farming", "runecraft", "hunter", "construction",
];

export default function ProfilePage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Progress>({});
  const [rsnInput, setRsnInput] = useState("");
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    const savedPlayer = loadStored("qh-rsn");
    if (savedPlayer && savedPlayer.name && savedPlayer.skills) {
      setPlayer(savedPlayer);
      setRsnInput(savedPlayer.name);
    }

    const comp = loadStored("qh-completed");
    if (Array.isArray(comp)) setCompleted(new Set(comp));

    const prog = loadStored("qh-progress");
    if (prog && typeof prog === "object") setProgress(prog);
  }, []);

  const loadStats = async () => {
    const name = rsnInput.trim();
    if (!name) return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch(`/api/hiscores?player=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.skills)) {
        throw new Error(data.error || "Player not found");
      }
      const skills: Record<string, number> = {};
      data.skills.forEach((s: any) => {
        if (s && s.name) skills[normalizeSkill(String(s.name))] = Number(s.level) || 1;
      });
      const p: Player = { name, skills };

      const previousName = player?.name;
      if (previousName && previousName.toLowerCase() !== name.toLowerCase()) {
        // Switching to a different character: this device's tracked
        // progress belonged to the old one, so start fresh for the new one.
        setCompleted(new Set());
        setProgress({});
        saveStored("qh-completed", []);
        saveStored("qh-progress", {});
        saveStored("qh-recent", []);
        removeStored("qh-diary-done");
        removeStored("qh-diary-totals");
        removeStored("qh-ca-done");
        removeStoredByPrefix("qh-quest-");
      }

      setPlayer(p);
      saveStored("qh-rsn", p);
    } catch (e: any) {
      setStatsError(e?.message || "Failed to load stats");
    } finally {
      setStatsLoading(false);
    }
  };

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

  const skillEntries = player
    ? Object.entries(player.skills).filter(([sk]) => sk !== "overall")
    : [];
  const skillsSorted = skillEntries.sort((a, b) => {
    const ai = SKILL_ORDER.indexOf(a[0]);
    const bi = SKILL_ORDER.indexOf(b[0]);
    if (ai === -1 && bi === -1) return a[0].localeCompare(b[0]);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  const totalLevel = player?.skills.overall;

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
        <div style={{ ...goldTitle, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>RuneScape name</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={rsnInput}
            onChange={(e) => setRsnInput(e.target.value)}
            placeholder="RuneScape name…"
            maxLength={12}
            style={{
              flex: 1,
              minWidth: 0,
              boxSizing: "border-box",
              padding: "11px 14px",
              fontSize: 15,
              background: C.panelSoft,
              color: C.parch,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              outline: "none",
            }}
          />
          <button
            onClick={loadStats}
            disabled={statsLoading || !rsnInput.trim()}
            style={{
              flexShrink: 0,
              padding: "11px 16px",
              fontSize: 14,
              fontWeight: 700,
              background: C.gold,
              color: C.ink,
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              opacity: statsLoading || !rsnInput.trim() ? 0.5 : 1,
            }}
          >
            {statsLoading ? "…" : player ? "Refresh" : "Load"}
          </button>
        </div>
        {statsError && <div style={{ fontSize: 13, color: C.red, marginTop: 6 }}>{statsError}</div>}
        {!player && !statsError && (
          <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
            Load your stats to see quest requirements you meet, achievement diary/combat achievement
            eligibility, and Combat Adviser suggestions.
          </div>
        )}

        {player && (
          <div style={{ ...card, padding: "12px 14px", margin: "14px 0" }}>
            <div style={{ color: C.parch, fontWeight: 700, fontSize: 16 }}>{player.name}</div>
            <div style={{ fontSize: 13, color: C.textDim }}>
              {combatLevel !== null && (
                <>
                  Combat level <b style={{ color: C.gold }}>{combatLevel}</b>
                </>
              )}
              {typeof totalLevel === "number" && (
                <>
                  {combatLevel !== null ? " · " : ""}
                  Total level <b style={{ color: C.gold }}>{fmtNum(totalLevel)}</b>
                </>
              )}
            </div>
          </div>
        )}

        {player && (
          <>
            <div style={{ ...goldTitle, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>📊 Skills</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 6,
                marginBottom: 14,
              }}
            >
              {skillsSorted.map(([sk, lvl]) => (
                <div
                  key={sk}
                  style={{
                    ...card,
                    padding: "8px 6px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 11, color: C.textDim }}>{capitalize(sk)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.gold }}>{lvl}</div>
                </div>
              ))}
            </div>
          </>
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
