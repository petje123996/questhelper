"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, headBtn, bigBtn, chip } from "@/lib/theme";
import { loadStored, saveStored } from "@/lib/storage";
import { calcCombat } from "@/lib/quest";
import type { Player, Lookup } from "@/lib/quest";
import { fetchTrainingCandidates } from "@/lib/training";
import { fetchMonsterEntries } from "@/lib/monsters";
import type { MonsterEntry } from "@/lib/monsters";
import { mapHref } from "@/lib/map";
import { fmtNum, wikiUrl } from "@/lib/format";
import { useCloseOnBack } from "@/hooks/useCloseOnBack";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";

type AccountType = "main" | "ironman" | "hcim";

const ACCOUNT_TYPES: { id: AccountType; label: string }[] = [
  { id: "main", label: "Main" },
  { id: "ironman", label: "Ironman" },
  { id: "hcim", label: "Hardcore" },
];

export default function CombatAdviserPage() {
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [members, setMembers] = useState(true);
  const [accountType, setAccountType] = useState<AccountType>("main");
  const [entries, setEntries] = useState<MonsterEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [picture, setPicture] = useState<{ name: string; lookup: Lookup } | null>(null);

  useEffect(() => {
    const savedPlayer = loadStored("qh-rsn");
    if (savedPlayer && savedPlayer.name && savedPlayer.skills) setPlayer(savedPlayer);
  }, []);

  useCloseOnBack(!!picture, () => setPicture(null));
  useLockBodyScroll(!!picture);

  useEffect(() => {
    const cacheKey = `qh-monsters-${members ? "p2p" : "f2p"}`;
    setEntries(null);
    const cached = loadStored(cacheKey);
    if (cached && Array.isArray(cached.entries) && cached.entries.length > 0) {
      setEntries(cached.entries);
      if (Date.now() - (cached.ts || 0) < 7 * 24 * 60 * 60 * 1000) return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        setLoadingLabel("Reading the training guide…");
        const names = await fetchTrainingCandidates(members);
        if (!names.length) throw new Error("No training guide found on the wiki.");
        setLoadingLabel(`Checking stats for ${Math.min(names.length, 45)} monsters…`);
        const found = await fetchMonsterEntries(names);
        if (!found.length) {
          throw new Error(
            `Found ${Math.min(names.length, 45)} candidate names on the guide, but couldn't read ` +
              "monster stats from any of their wiki pages."
          );
        }
        setEntries(found);
        saveStored(cacheKey, { ts: Date.now(), entries: found });
      } catch (e: any) {
        setError(e?.message || "Loading failed. Check your connection.");
      } finally {
        setLoading(false);
      }
    })();
  }, [members]);

  const combatLevel = player ? calcCombat(player.skills) : null;

  // Rough "pure" heuristic: Defence well below your offensive stats.
  // Best-effort only — used for a note, not to change the ranking.
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

  // Basis: hitpoints × XP-per-hitpoint picks which monsters are worth
  // fighting at all (higher HP ≈ more combat XP per kill); the final
  // display order is then lowest Defence first (easiest/fastest to hit),
  // highest last.
  const { best, alternatives } = useMemo(() => {
    if (!entries || !entries.length || combatLevel === null) {
      return { best: null as MonsterEntry | null, alternatives: [] as MonsterEntry[] };
    }
    const levelMin = Math.max(1, combatLevel - 60);
    const levelMax = combatLevel + 20;
    const inRange = entries.filter(
      (e) => e.combatLevel === 0 || (e.combatLevel >= levelMin && e.combatLevel <= levelMax)
    );
    const pool = inRange.length ? inRange : entries;
    const byValue = [...pool].sort((a, b) => b.xpPerKill - a.xpPerKill).slice(0, 15);
    const ranked = byValue.sort((a, b) => a.defence - b.defence);
    return { best: ranked[0] ?? null, alternatives: ranked.slice(1, 6) };
  }, [entries, combatLevel]);

  const monsterCard = (e: MonsterEntry, highlight: boolean) => (
    <div
      key={e.name}
      style={{
        ...card,
        padding: highlight ? "14px 16px" : "10px 14px",
        marginBottom: highlight ? 18 : 8,
        borderColor: highlight ? C.gold : C.borderSoft,
        boxShadow: highlight ? "0 3px 12px rgba(0,0,0,.35)" : undefined,
      }}
    >
      {highlight && (
        <div style={{ fontSize: 12, color: C.goldDim, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
          🎯 RECOMMENDED FOR YOU
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ ...(highlight ? { ...goldTitle, fontSize: 20 } : {}), color: highlight ? undefined : C.parch, fontWeight: 700, fontSize: highlight ? 20 : 15 }}>
          {e.name}
        </span>
        {e.combatLevel > 0 && (
          <span style={{ fontSize: 12, color: C.textDim }}>Lvl {e.combatLevel}</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: highlight ? 8 : 6 }}>
        <span style={chip}>❤️ {fmtNum(e.hitpoints)} HP</span>
        <span style={chip}>🛡️ {fmtNum(e.defence)} Def</span>
        <span style={chip}>📈 ~{fmtNum(e.xpPerKill)} xp/kill</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {e.lookup.coords && (
          <button
            onClick={() =>
              router.push(
                mapHref({
                  x: e.lookup.coords!.x,
                  y: e.lookup.coords!.y,
                  title: e.name,
                  marker: true,
                  plane: e.lookup.coords!.plane,
                  mapId: e.lookup.coords!.mapId,
                })
              )
            }
            style={{ flex: 1, padding: "8px 10px", fontSize: 12, fontWeight: 700, background: C.gold, color: C.ink, border: "none", borderRadius: 10, cursor: "pointer" }}
          >
            🗺️ Location
          </button>
        )}
        {e.lookup.images.length > 0 && (
          <button
            onClick={() => setPicture({ name: e.name, lookup: e.lookup })}
            style={{ flex: 1, padding: "8px 10px", fontSize: 12, fontWeight: 700, background: "transparent", color: C.gold, border: `1px solid ${C.border}`, borderRadius: 10, cursor: "pointer" }}
          >
            🖼️ Picture
          </button>
        )}
      </div>
    </div>
  );

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
                    🎯 Your Defence looks low relative to your other combat stats — consider Ranged/Magic
                    safespotting instead of meleeing in the open where possible.
                  </div>
                )}
              </div>
            )}

            {loading && (
              <div style={{ textAlign: "center", padding: 30, color: C.textDim }}>{loadingLabel}</div>
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
                {monsterCard(best, true)}
                <div style={{ ...goldTitle, fontSize: 15, marginBottom: 8 }}>Other options</div>
                {alternatives.map((e) => monsterCard(e, false))}

                <div style={{ fontSize: 11, color: C.textDim, marginTop: 10 }}>
                  Picked from the wiki's {members ? "Pay-to-play" : "Free-to-play"} Combat Training guide by
                  hitpoints (≈ XP value per kill), ordered lowest Defence first.
                </div>
              </>
            )}
          </>
        )}
      </div>

      {picture && (
        <div
          onClick={() => setPicture(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.7)",
            zIndex: 50,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 560,
              maxHeight: "82vh",
              overflowY: "auto",
              background: C.bg,
              borderTop: `2px solid ${C.gold}`,
              borderRadius: "16px 16px 0 0",
              padding: "14px 14px 24px",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ ...goldTitle, fontSize: 17, fontWeight: 700 }}>🔍 {picture.name}</div>
              <button
                onClick={() => setPicture(null)}
                style={{ width: 32, height: 32, borderRadius: "50%", background: C.panelSoft, color: C.parch, border: `1px solid ${C.border}`, fontSize: 14, cursor: "pointer", lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
            {picture.lookup.images.map((src) => (
              <img
                key={src}
                src={src}
                alt=""
                style={{ width: "100%", borderRadius: 10, marginBottom: 10, border: `1px solid ${C.borderSoft}` }}
              />
            ))}
            <a
              href={wikiUrl(picture.name)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", textAlign: "center", padding: "12px", background: C.panelSoft, color: C.gold, border: `1px solid ${C.border}`, borderRadius: 10, textDecoration: "none", fontWeight: 600, fontSize: 14 }}
            >
              Open on wiki ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
