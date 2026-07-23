"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, headBtn, bigBtn, chip } from "@/lib/theme";
import { loadStored, saveStored } from "@/lib/storage";
import { calcCombat, fetchLookup } from "@/lib/quest";
import type { Player, Lookup } from "@/lib/quest";
import { fetchTrainingCandidates, isNonMonsterName } from "@/lib/training";
import { debugMonsterPage, fetchMonsterEntries } from "@/lib/monsters";
import type { MonsterDebug } from "@/lib/monsters";
import { debugBestiaryPage, fetchBestiaryRows } from "@/lib/bestiary";
import type { BestiaryDebug, BracketAttempt, MembershipCounts } from "@/lib/bestiary";
import { mapHref } from "@/lib/map";
import { fmtNum, wikiUrl } from "@/lib/format";
import { useCloseOnBack } from "@/hooks/useCloseOnBack";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";

type AccountType = "main" | "ironman" | "hcim";
type Entry = {
  name: string;
  hitpoints: number;
  defence: number;
  attack: number;
  combatLevel: number;
  xpPerKill: number;
};

// -1 means "column not found" (unknown); anything else non-numeric means
// a stale cached entry saved before this stat existed on Entry.
function statLabel(v: number): string {
  return typeof v !== "number" || !Number.isFinite(v) || v < 0 ? "?" : fmtNum(v);
}

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
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [picture, setPicture] = useState<{ name: string; lookup: Lookup | null; loading: boolean } | null>(null);
  const [debug, setDebug] = useState<MonsterDebug[] | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [bracketAttempts, setBracketAttempts] = useState<BracketAttempt[] | null>(null);
  const [bestiaryDebug, setBestiaryDebug] = useState<BestiaryDebug | null>(null);
  const [bestiaryDebugOpen, setBestiaryDebugOpen] = useState(false);
  const [membershipCounts, setMembershipCounts] = useState<MembershipCounts | null>(null);

  useEffect(() => {
    const savedPlayer = loadStored("qh-rsn");
    if (savedPlayer && savedPlayer.name && savedPlayer.skills) setPlayer(savedPlayer);
  }, []);

  useCloseOnBack(!!picture, () => setPicture(null));
  useLockBodyScroll(!!picture);

  const combatLevel = player ? calcCombat(player.skills) : null;

  useEffect(() => {
    if (combatLevel === null) return;
    // v3: fixed the Members/F2P column classification (an unrecognised
    // label used to default to "members", which could make every monster
    // look like a Members monster and leave F2P mode empty) — versioned so
    // a cache built under the old, wrong classification isn't reused.
    const cacheKey = `qh-bestiary-v3-${members ? "p2p" : "f2p"}-${Math.floor(combatLevel / 10)}`;
    setEntries(null);
    const cached = loadStored(cacheKey);
    if (cached && Array.isArray(cached.entries) && cached.entries.length > 0) {
      setEntries(cached.entries);
      if (Date.now() - (cached.ts || 0) < 7 * 24 * 60 * 60 * 1000) return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      setDebug(null);
      setDebugOpen(false);
      setBracketAttempts(null);
      setBestiaryDebug(null);
      setBestiaryDebugOpen(false);
      setMembershipCounts(null);
      try {
        setLoadingLabel("Loading the bestiary…");
        const { rows, attempted, membershipCounts: counts } = await fetchBestiaryRows(combatLevel);
        setBracketAttempts(attempted);
        setMembershipCounts(counts);
        const modeFiltered = rows.filter((r) => r.members === null || r.members === members);
        const byName = new Map<string, Entry>();
        modeFiltered.forEach((r) => {
          if (byName.has(r.name)) return;
          byName.set(r.name, {
            name: r.name,
            hitpoints: r.hitpoints,
            defence: r.defence,
            attack: r.attack,
            combatLevel: r.combatLevel,
            xpPerKill: r.hitpoints * 4,
          });
        });
        let found = Array.from(byName.values());

        if (!found.length) {
          // Bracket pages were found but yielded no rows — dump the raw
          // structure of the first one so a mismatch is directly visible.
          const sampleTitle = attempted.find((a) => a.found)?.title;
          if (sampleTitle) setBestiaryDebug(await debugBestiaryPage(sampleTitle));

          // Bestiary subpages didn't parse — fall back to harvesting
          // monster links from the training guides and reading each
          // one's own infobox (slower, but a different data source).
          setLoadingLabel("Bestiary unavailable — reading the training guide instead…");
          const names = await fetchTrainingCandidates(members);
          if (!names.length) throw new Error("No monster data found on the wiki.");
          setLoadingLabel(`Checking stats for ${names.length} monsters…`);
          const viaGuide = await fetchMonsterEntries(names);
          if (!viaGuide.length) {
            const sample = names.filter((n) => !isNonMonsterName(n)).slice(0, 3);
            setDebug(await Promise.all(sample.map((n) => debugMonsterPage(n))));
            throw new Error(
              `Found ${names.length} candidate names (via training guide links), but couldn't read ` +
                "monster stats from any of their wiki pages."
            );
          }
          found = viaGuide.map((e) => ({
            name: e.name,
            hitpoints: e.hitpoints,
            defence: e.defence,
            attack: e.attack,
            combatLevel: e.combatLevel,
            xpPerKill: e.xpPerKill,
          }));
        }

        setEntries(found);
        saveStored(cacheKey, { ts: Date.now(), entries: found });
      } catch (e: any) {
        setError(e?.message || "Loading failed. Check your connection.");
      } finally {
        setLoading(false);
      }
    })();
  }, [members, combatLevel]);

  // Rough "pure" heuristic: Defence well below your offensive stats. Shown
  // as a note; the actual ranking below picks up the same underlying stats
  // directly rather than branching on this boolean.
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

  // How much a monster's Attack/Defence should count against it depends on
  // the player fighting it, not just the monster: a low-Defence account
  // (a pure, most extremely) takes real risk from a hard-hitting monster,
  // so monster Attack should be weighted heavily for them — a tanky
  // high-Defence account can shrug the same hits off, so it barely matters.
  // Symmetrically, a low-offence account struggles to punch through a
  // high-Defence monster (slow kills, more food/time spent), so monster
  // Defence should count for more against them than it does for a
  // high-offence account that kills anything quickly regardless. Hardcore
  // Ironman gets extra weight on Attack on top of that, since a death is
  // unrecoverable regardless of how tanky the stats look on paper.
  const weights = useMemo(() => {
    if (!player) return { attackWeight: 1, defenceWeight: 1 };
    const def = player.skills.defence ?? 1;
    const offence = Math.max(
      player.skills.attack ?? 1,
      player.skills.strength ?? 1,
      player.skills.ranged ?? 1,
      player.skills.magic ?? 1
    );
    const defenceRatio = Math.min(1, def / 60);
    const offenceRatio = Math.min(1, offence / 60);
    let attackWeight = 1 + (1 - defenceRatio) * 3; // 1 (tanky) .. 4 (pure)
    const defenceWeight = 1 + (1 - offenceRatio) * 2; // 1 (strong offence) .. 3 (weak offence)
    if (accountType === "hcim") attackWeight *= 1.5; // permadeath: extra caution
    return { attackWeight, defenceWeight };
  }, [player, accountType]);

  // Score each monster by hitpoints (more HP ≈ more combat XP per kill,
  // and more kills survivable per trip) against how hard it hits back and
  // how much Defence it takes to actually land hits on it, weighted by
  // what actually matters for THIS player's own combat stats (see
  // `weights` above) — as high as possible HP, as low as possible Attack
  // and Defence, but "as low as possible" means more for a squishy/pure
  // account than a tanky one. Monsters with an unknown Attack/Defence (-1,
  // column missing on that table) are scored as worst-case rather than
  // best-case, so missing data can't falsely push them to the top.
  const { best, alternatives } = useMemo(() => {
    if (!entries || !entries.length || combatLevel === null) {
      return { best: null as Entry | null, alternatives: [] as Entry[] };
    }
    const levelMin = Math.max(1, combatLevel - 60);
    const levelMax = combatLevel + 20;
    const inRange = entries.filter(
      (e) => e.combatLevel === 0 || (e.combatLevel >= levelMin && e.combatLevel <= levelMax)
    );
    const levelPool = inRange.length ? inRange : entries;
    // A near-zero-stat monster (Seagull: 1 HP, ~0 Attack/Defence) can win
    // the safety-weighted score purely by having nothing to avoid, even
    // though one hit ends the fight and it's worth almost no XP — a
    // one-hit joke monster, not a real training target. Drop anything
    // whose Hitpoints (≈ XP/kill) sits far below the best the pool has to
    // offer for this level range, so only monsters actually worth
    // fighting compete for the recommendation. Falls back to the
    // unfiltered pool if that would leave nothing at all.
    const maxHp = Math.max(...levelPool.map((e) => e.hitpoints));
    const hpFloor = Math.max(3, maxHp * 0.15);
    const trainable = levelPool.filter((e) => e.hitpoints >= hpFloor);
    const pool = trainable.length ? trainable : levelPool;
    const statOrWorst = (v: number) => (typeof v !== "number" || !Number.isFinite(v) || v < 0 ? 9999 : v);
    const { attackWeight, defenceWeight } = weights;
    const score = (e: Entry) =>
      e.hitpoints / (1 + statOrWorst(e.defence) * defenceWeight + statOrWorst(e.attack) * attackWeight);
    const ranked = [...pool].sort((a, b) => score(b) - score(a));
    return { best: ranked[0] ?? null, alternatives: ranked.slice(1) };
  }, [entries, combatLevel, weights]);

  const openPicture = async (name: string) => {
    setPicture({ name, lookup: null, loading: true });
    const lookup = await fetchLookup(name, name);
    setPicture({ name, lookup, loading: false });
  };

  const monsterCard = (e: Entry, highlight: boolean) => (
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
        <span
          style={{
            ...(highlight ? { ...goldTitle, fontSize: 20 } : {}),
            color: highlight ? undefined : C.parch,
            fontWeight: 700,
            fontSize: highlight ? 20 : 15,
          }}
        >
          {e.name}
        </span>
        {e.combatLevel > 0 && <span style={{ fontSize: 12, color: C.textDim }}>Lvl {e.combatLevel}</span>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: highlight ? 8 : 6 }}>
        <span style={chip}>❤️ {fmtNum(e.hitpoints)} HP</span>
        <span style={chip}>⚔️ {statLabel(e.attack)} Atk</span>
        <span style={chip}>🛡️ {statLabel(e.defence)} Def</span>
        <span style={chip}>📈 ~{fmtNum(e.xpPerKill)} xp/kill</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={() => openPicture(e.name)}
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 12,
            fontWeight: 700,
            background: "transparent",
            color: C.gold,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          🖼️ Picture / location
        </button>
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
                <div style={{ color: C.red, fontWeight: 700, marginBottom: 4 }}>Couldn't load monster data</div>
                {error}

                {bracketAttempts && bracketAttempts.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 11, color: C.textDim }}>
                    <div style={{ fontWeight: 700, color: C.gold, marginBottom: 4 }}>Bestiary pages tried:</div>
                    {bracketAttempts.map((a) => (
                      <div key={a.title}>
                        {a.title}: {a.found ? `${a.rowCount} rows` : "page not found"}
                      </div>
                    ))}
                  </div>
                )}

                {bestiaryDebug && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => setBestiaryDebugOpen(!bestiaryDebugOpen)}
                      style={{
                        background: "transparent",
                        border: `1px solid ${C.border}`,
                        color: C.gold,
                        borderRadius: 8,
                        padding: "7px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {bestiaryDebugOpen ? "Hide" : "🔧 Show"} raw bestiary page structure
                    </button>
                    {bestiaryDebugOpen && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, marginBottom: 4 }}>
                          {bestiaryDebug.title} — {bestiaryDebug.tableCount} table(s) found
                        </div>
                        {bestiaryDebug.headerDumps.map((line, i) => (
                          <div key={i} style={{ fontSize: 11, color: C.textDim, marginBottom: 2 }}>
                            {line}
                          </div>
                        ))}
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.gold, marginTop: 8, marginBottom: 4 }}>
                          Raw HTML (first table, tap to select all for copying):
                        </div>
                        <pre
                          onClick={(e) => {
                            const sel = window.getSelection();
                            const range = document.createRange();
                            range.selectNodeContents(e.currentTarget);
                            sel?.removeAllRanges();
                            sel?.addRange(range);
                          }}
                          style={{
                            fontSize: 10,
                            color: C.textDim,
                            background: C.bg,
                            border: `1px solid ${C.borderSoft}`,
                            borderRadius: 8,
                            padding: 10,
                            overflowX: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            maxHeight: 260,
                            overflowY: "auto",
                          }}
                        >
                          {bestiaryDebug.rawSnippet}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {debug && debug.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => setDebugOpen(!debugOpen)}
                      style={{
                        background: "transparent",
                        border: `1px solid ${C.border}`,
                        color: C.gold,
                        borderRadius: 8,
                        padding: "7px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {debugOpen ? "Hide" : "🔧 Show"} what the parser found
                    </button>
                    {debugOpen && (
                      <div style={{ marginTop: 10 }}>
                        {debug.map((d) => (
                          <div key={d.name} style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, marginBottom: 4 }}>
                              {d.name} {!d.found && "(page not found)"}
                            </div>
                            <pre
                              style={{
                                fontSize: 11,
                                color: C.textDim,
                                background: C.bg,
                                border: `1px solid ${C.borderSoft}`,
                                borderRadius: 8,
                                padding: 10,
                                overflowX: "auto",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                              }}
                            >
                              {d.rows.length ? d.rows.join("\n") : "(no table rows with 2+ cells found)"}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {best && !loading && !error && (
              <>
                {monsterCard(best, true)}
                <div style={{ ...goldTitle, fontSize: 15, marginBottom: 8 }}>
                  All options ({alternatives.length + 1})
                </div>
                {alternatives.map((e) => monsterCard(e, false))}

                <div style={{ fontSize: 11, color: C.textDim, marginTop: 10 }}>
                  From the wiki's Bestiary for your level range, ranked by highest Hitpoints (≈ XP value
                  per kill) against lowest Attack and Defence, weighted to your own stats — the lower your
                  Defence, the more a monster's Attack counts against it; the lower your offence, the more
                  its Defence does. One-hit joke monsters (very low HP relative to the best options here)
                  are filtered out — they're not worth fighting regardless of how weak their stats look.
                </div>
                {membershipCounts && (
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: 4, opacity: 0.7 }}>
                    Bestiary column check: {membershipCounts.members} members-only, {membershipCounts.f2p}{" "}
                    F2P, {membershipCounts.unknown} unclear.
                  </div>
                )}
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
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: C.panelSoft,
                  color: C.parch,
                  border: `1px solid ${C.border}`,
                  fontSize: 14,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {picture.loading && (
              <div style={{ color: C.textDim, padding: "20px 0", textAlign: "center" }}>Searching the wiki…</div>
            )}

            {!picture.loading && picture.lookup?.images.map((src) => (
              <img
                key={src}
                src={src}
                alt=""
                style={{ width: "100%", borderRadius: 10, marginBottom: 10, border: `1px solid ${C.borderSoft}` }}
              />
            ))}

            {!picture.loading && picture.lookup?.coords && (
              <button
                onClick={() => {
                  const c = picture.lookup!.coords!;
                  const name = picture.name;
                  setPicture(null);
                  router.push(mapHref({ x: c.x, y: c.y, title: name, marker: true, plane: c.plane, mapId: c.mapId }));
                }}
                style={{ ...bigBtn, marginBottom: 12 }}
              >
                🗺️ Show on map
              </button>
            )}

            {!picture.loading && (
              <a
                href={wikiUrl(picture.name)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "12px",
                  background: C.panelSoft,
                  color: C.gold,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Open on wiki ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
