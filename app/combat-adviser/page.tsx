"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, headBtn, bigBtn, chip } from "@/lib/theme";
import { loadStored, saveStored } from "@/lib/storage";
import { calcCombat } from "@/lib/quest";
import type { Player } from "@/lib/quest";
import { fetchTrainingGuide } from "@/lib/training";
import type { TrainingEntry } from "@/lib/training";

type AccountType = "main" | "ironman" | "hcim";

const ACCOUNT_TYPES: { id: AccountType; label: string }[] = [
  { id: "main", label: "Main" },
  { id: "ironman", label: "Ironman" },
  { id: "hcim", label: "Hardcore" },
];

export default function CombatAdviserPage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [members, setMembers] = useState(true);
  const [accountType, setAccountType] = useState<AccountType>("main");
  const [entries, setEntries] = useState<TrainingEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedPlayer = loadStored("qh-rsn");
    if (savedPlayer && savedPlayer.name && savedPlayer.skills) setPlayer(savedPlayer);
  }, []);

  useEffect(() => {
    const cacheKey = `qh-training-${members ? "p2p" : "f2p"}`;
    setEntries(null);
    const cached = loadStored(cacheKey);
    if (cached && Array.isArray(cached.entries) && cached.entries.length > 0) {
      setEntries(cached.entries);
      if (Date.now() - (cached.ts || 0) < 14 * 24 * 60 * 60 * 1000) return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const parsed = await fetchTrainingGuide(members);
        if (!parsed.length) throw new Error("No training guide found on the wiki.");
        setEntries(parsed);
        saveStored(cacheKey, { ts: Date.now(), entries: parsed });
      } catch (e: any) {
        setError(e?.message || "Loading failed. Check your connection.");
      } finally {
        setLoading(false);
      }
    })();
  }, [members]);

  const combatLevel = player ? calcCombat(player.skills) : null;

  // Rough "pure" heuristic: Defence well below your offensive stats.
  // Best-effort only — used for a note, not to change the recommendations.
  const isPure = useMemo(() => {
    if (!player) return false;
    const def = player.skills.defence ?? 1;
    const offence = Math.max(
      player.skills.attack ?? 1,
      player.skills.strength ?? 1,
      player.skills.ranged ?? 1,
      player.skills.magic ?? 1
    );
    return def <= 20 && offence - def >= 15;
  }, [player]);

  const { best, alternatives } = useMemo(() => {
    if (!entries || !entries.length || combatLevel === null) {
      return { best: null as TrainingEntry | null, alternatives: [] as TrainingEntry[] };
    }
    let bestIdx = 0;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].minLevel <= combatLevel) bestIdx = i;
      else break;
    }
    const bestEntry = entries[bestIdx];
    const rest = entries
      .filter((_, i) => i !== bestIdx)
      .map((e) => ({ e, d: Math.abs(e.minLevel - combatLevel) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 5)
      .map((x) => x.e);
    return { best: bestEntry, alternatives: rest };
  }, [entries, combatLevel]);

  return (
    <div style={frame}>
      <div style={{ background: C.bg, borderBottom: `2px solid ${C.border}`, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ ...headBtn, textDecoration: "none", display: "inline-block" }}>
            ←
          </Link>
          <div style={{ ...goldTitle, fontSize: 17, fontWeight: 700, flex: 1 }}>🛡️ Combat Adviser</div>
          <Nav />
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 14px 40px" }}>
        {!player ? (
          <div style={{ ...card, padding: 16, color: C.textDim, fontSize: 14, textAlign: "center" }}>
            Load your RSN on the home screen first — the adviser needs your stats to find a
            training spot that matches your level.
            <div style={{ marginTop: 12 }}>
              <Link href="/" style={{ ...bigBtn, display: "inline-block", textDecoration: "none" }}>
                Go to home
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div style={{ ...card, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ color: C.parch, fontWeight: 700, fontSize: 16 }}>{player.name}</div>
              <div style={{ fontSize: 13, color: C.textDim }}>
                Combat level <b style={{ color: C.gold }}>{combatLevel}</b>
              </div>
            </div>

            <div style={{ fontSize: 12, color: C.goldDim, fontWeight: 700, marginBottom: 6 }}>
              GAME MODE
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[
                { v: false, label: "🔓 Free-to-play" },
                { v: true, label: "💎 Members" },
              ].map((o) => (
                <button
                  key={String(o.v)}
                  onClick={() => setMembers(o.v)}
                  style={{
                    flex: 1,
                    padding: "10px 8px",
                    borderRadius: 10,
                    background: members === o.v ? C.gold : "transparent",
                    color: members === o.v ? C.ink : C.gold,
                    border: `1px solid ${members === o.v ? C.gold : C.borderSoft}`,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 12, color: C.goldDim, fontWeight: 700, marginBottom: 6 }}>
              ACCOUNT TYPE
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {ACCOUNT_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setAccountType(t.id)}
                  style={{
                    flex: 1,
                    padding: "10px 8px",
                    borderRadius: 10,
                    background: accountType === t.id ? C.gold : "transparent",
                    color: accountType === t.id ? C.ink : C.gold,
                    border: `1px solid ${accountType === t.id ? C.gold : C.borderSoft}`,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {(accountType === "ironman" || accountType === "hcim" || isPure) && (
              <div style={{ ...card, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: C.textDim }}>
                {accountType === "ironman" && (
                  <div>🦾 Ironman: you'll need to gather or make any gear yourself — the GE isn't an option.</div>
                )}
                {accountType === "hcim" && (
                  <div style={{ marginTop: accountType === "hcim" && isPure ? 4 : 0 }}>
                    💀 Hardcore Ironman: favour safer, low-risk spots over the highest XP/hr — one death ends the
                    hardcore status. Check a monster's max hit before committing.
                  </div>
                )}
                {isPure && (
                  <div style={{ marginTop: accountType !== "main" ? 4 : 0 }}>
                    🎯 Your Defence looks low relative to your other combat stats — if these spots list a
                    dangerous max hit, consider Ranged/Magic safespotting instead of meleeing in the open.
                  </div>
                )}
              </div>
            )}

            {loading && (
              <div style={{ textAlign: "center", padding: 30, color: C.textDim }}>
                Fetching the {members ? "members'" : "F2P"} combat training guide from the wiki…
              </div>
            )}

            {error && !loading && (
              <div style={{ ...card, borderColor: C.red, padding: 16, color: C.parch }}>
                <div style={{ color: C.red, fontWeight: 700, marginBottom: 4 }}>
                  Couldn't load the training guide
                </div>
                {error}
              </div>
            )}

            {best && !loading && !error && (
              <>
                <div
                  style={{
                    ...card,
                    borderColor: C.gold,
                    padding: "14px 16px",
                    marginBottom: 18,
                    boxShadow: "0 3px 12px rgba(0,0,0,.35)",
                  }}
                >
                  <div style={{ fontSize: 12, color: C.goldDim, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
                    🎯 RECOMMENDED FOR YOU
                  </div>
                  <div style={{ ...goldTitle, fontSize: 20, fontWeight: 700 }}>{best.monster}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    <span style={chip}>📊 Level {best.levelText}</span>
                  </div>
                  {best.detail && (
                    <div style={{ fontSize: 13, color: C.text, marginTop: 8 }}>{best.detail}</div>
                  )}
                </div>

                <div style={{ ...goldTitle, fontSize: 15, marginBottom: 8 }}>Other options</div>
                {alternatives.map((e, i) => (
                  <div key={i} style={{ ...card, padding: "10px 14px", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ color: C.parch, fontWeight: 600, fontSize: 15 }}>{e.monster}</span>
                      <span style={{ fontSize: 12, color: C.textDim }}>Level {e.levelText}</span>
                    </div>
                    {e.detail && (
                      <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>{e.detail}</div>
                    )}
                  </div>
                ))}

                <div style={{ fontSize: 11, color: C.textDim, marginTop: 10 }}>
                  Based on the wiki's {members ? "Pay-to-play" : "Free-to-play"} Combat Training guide,
                  matched to your combat level.
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
