"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, headBtn, bigBtn, chip } from "@/lib/theme";
import { loadStored } from "@/lib/storage";
import { capitalize, fmtNum, normalizeSkill, wikiUrl } from "@/lib/format";
import { fetchLookup } from "@/lib/quest";
import type { Player, Lookup } from "@/lib/quest";
import { fetchTrainingMethods, TRAINABLE_SKILLS } from "@/lib/skillTraining";
import type { TrainingMethod, TrainingResult } from "@/lib/skillTraining";
import { mapHref } from "@/lib/map";
import { useCloseOnBack } from "@/hooks/useCloseOnBack";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";

const UPCOMING_LIMIT = 8;
const OTHER_OPTIONS_LIMIT = 25;

function methodLabel(m: TrainingMethod): string {
  return m.levelReq >= 1 ? `Lvl ${m.levelReq}` : "Lvl ?";
}

export default function SkillAdviserPage() {
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [skill, setSkill] = useState<string>(TRAINABLE_SKILLS[0]);
  const [members, setMembers] = useState(true);
  const [picture, setPicture] = useState<{ name: string; lookup: Lookup | null; loading: boolean } | null>(null);

  useEffect(() => {
    const savedPlayer = loadStored("qh-rsn");
    if (savedPlayer && savedPlayer.name && savedPlayer.skills) setPlayer(savedPlayer);
  }, []);

  useCloseOnBack(!!picture, () => setPicture(null));
  useLockBodyScroll(!!picture);

  // Reads the hand-verified database in lib/skillDatabase.ts — no
  // network fetch, so this is instant.
  const result: TrainingResult = useMemo(() => fetchTrainingMethods(skill), [skill]);
  const currentLevel = player ? player.skills[normalizeSkill(skill)] ?? 1 : null;
  const methods = result.methods;

  const { usable, upcoming, unknownLevel } = useMemo(() => {
    if (!methods) return { usable: [] as TrainingMethod[], upcoming: [] as TrainingMethod[], unknownLevel: [] as TrainingMethod[] };
    const modeFiltered = methods.filter((m) => members || m.membersOnly !== true);
    const known = modeFiltered.filter((m) => m.levelReq >= 1);
    const unknown = modeFiltered.filter((m) => m.levelReq < 1);
    const level = currentLevel ?? 1;
    const usableNow = known
      .filter((m) => m.levelReq <= level)
      .sort((a, b) => {
        const aXp = a.xp >= 0 ? a.xp : -1;
        const bXp = b.xp >= 0 ? b.xp : -1;
        return bXp - aXp;
      });
    const locked = known.filter((m) => m.levelReq > level).sort((a, b) => a.levelReq - b.levelReq);
    return { usable: usableNow, upcoming: locked.slice(0, UPCOMING_LIMIT), unknownLevel: unknown };
  }, [methods, members, currentLevel]);

  const openPicture = async (m: TrainingMethod) => {
    const page = m.page || m.name;
    setPicture({ name: m.name, lookup: null, loading: true });
    const lookup = await fetchLookup(page, m.name);
    setPicture({ name: m.name, lookup, loading: false });
  };

  const methodRow = (m: TrainingMethod, highlight: boolean) => (
    <div
      key={m.name}
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
          🎯 BEST XP FOR YOU
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            ...(highlight ? { ...goldTitle, fontSize: 18 } : {}),
            color: highlight ? undefined : C.parch,
            fontWeight: 700,
            fontSize: highlight ? 18 : 15,
          }}
        >
          {m.name}
        </span>
        {m.levelReq >= 1 && <span style={{ fontSize: 12, color: C.textDim }}>{methodLabel(m)}</span>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: highlight ? 8 : 6 }}>
        {m.xp >= 0 && <span style={chip}>📈 {fmtNum(m.xp)} xp</span>}
        {m.membersOnly === true && <span style={chip}>💎 Members</span>}
        {m.membersOnly === false && <span style={chip}>🔓 F2P</span>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={() => openPicture(m)}
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
          <div style={{ ...goldTitle, fontSize: 17, fontWeight: 700, flex: 1 }}>🎓 Skill Adviser</div>
          <Nav />
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 14px 40px" }}>
        {!player ? (
          <div style={{ ...card, padding: 16, color: C.textDim, fontSize: 14, textAlign: "center" }}>
            Load your RSN in your Profile first — the adviser needs your levels to find training methods
            that match where you're at.
            <div style={{ marginTop: 12 }}>
              <Link href="/profile" style={{ ...bigBtn, display: "inline-block", textDecoration: "none" }}>
                Go to Profile
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: C.goldDim, fontWeight: 700, marginBottom: 6 }}>SKILL</div>
            <select
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                fontSize: 15,
                background: C.panelSoft,
                color: C.parch,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                outline: "none",
                marginBottom: 14,
              }}
            >
              {[...TRAINABLE_SKILLS].sort((a, b) => a.localeCompare(b)).map((s) => (
                <option key={s} value={s}>
                  {capitalize(s)}
                </option>
              ))}
            </select>

            <div style={{ ...card, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ color: C.parch, fontWeight: 700, fontSize: 16 }}>{player.name}</div>
              <div style={{ fontSize: 13, color: C.textDim }}>
                {capitalize(skill)} level <b style={{ color: C.gold }}>{currentLevel}</b>
              </div>
            </div>

            <div style={{ fontSize: 12, color: C.goldDim, fontWeight: 700, marginBottom: 6 }}>GAME MODE</div>
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

            {result.source === "none" ? (
              <div style={{ ...card, padding: 16, color: C.textDim, textAlign: "center" }}>
                {capitalize(skill)} isn't in the training database yet.
                {result.guidePage && (
                  <>
                    {" "}
                    Check the{" "}
                    <a
                      href={wikiUrl(result.guidePage)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: C.gold }}
                    >
                      {capitalize(skill)} wiki page ↗
                    </a>{" "}
                    directly for now.
                  </>
                )}
              </div>
            ) : (
              <>
                {usable.length === 0 ? (
                  <div style={{ ...card, padding: 16, color: C.textDim, textAlign: "center" }}>
                    No methods found at or below your current {capitalize(skill)} level — see "Unlocks soon"
                    below, or check the {capitalize(skill)} training guide directly on the wiki.
                  </div>
                ) : (
                  <>
                    {methodRow(usable[0], true)}
                    {usable.length > 1 && (
                      <>
                        <div style={{ ...goldTitle, fontSize: 15, marginBottom: 8 }}>
                          Other options you can use now ({usable.length - 1})
                        </div>
                        {usable.slice(1, 1 + OTHER_OPTIONS_LIMIT).map((m) => methodRow(m, false))}
                        {usable.length - 1 > OTHER_OPTIONS_LIMIT && (
                          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 10 }}>
                            + {usable.length - 1 - OTHER_OPTIONS_LIMIT} more, lower XP than these.
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {upcoming.length > 0 && (
                  <>
                    <div style={{ ...goldTitle, fontSize: 15, marginTop: 18, marginBottom: 8 }}>
                      Unlocks soon
                    </div>
                    {upcoming.map((m) => (
                      <div
                        key={m.name}
                        style={{
                          ...card,
                          padding: "8px 12px",
                          marginBottom: 6,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span style={{ fontSize: 13, color: C.text }}>{m.name}</span>
                        <span style={{ fontSize: 12, color: C.textDim }}>
                          {methodLabel(m)}
                          {m.xp >= 0 && ` · ${fmtNum(m.xp)} xp`}
                        </span>
                      </div>
                    ))}
                  </>
                )}

                {unknownLevel.length > 0 && (
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 14 }}>
                    {unknownLevel.length} item{unknownLevel.length === 1 ? "" : "s"} on this page didn't have a
                    readable level requirement, so {unknownLevel.length === 1 ? "it isn't" : "they aren't"} shown
                    above: {unknownLevel.map((m) => m.name).join(", ")}.
                  </div>
                )}

                <div style={{ fontSize: 11, color: C.textDim, marginTop: 10 }}>
                  From the wiki's own XP tables (see lib/skillDatabase.ts for how), ranked by highest XP per action among options you can already
                  use at your current level. This is XP per action, not XP per hour — how fast you can
                  repeat that action isn't in this data, so it's not a true speed comparison between very
                  different activities.
                  {result.guidePage && (
                    <>
                      {" "}
                      <a
                        href={wikiUrl(result.guidePage)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: C.gold }}
                      >
                        Open {capitalize(skill)} on the wiki ↗
                      </a>
                    </>
                  )}
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
