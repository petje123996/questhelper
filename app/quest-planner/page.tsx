"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, headBtn, chip } from "@/lib/theme";
import { loadStored, saveStored } from "@/lib/storage";
import { capitalize, normalizeSkill, wikiUrl } from "@/lib/format";
import { fetchQuestCategories } from "@/lib/quest";
import type { Player } from "@/lib/quest";
import { fetchQuestChain } from "@/lib/questChain";
import type { QuestChainResult } from "@/lib/questChain";
import { POPULAR, F2P_FALLBACK, MINI_FALLBACK } from "@/lib/questLists";

export default function QuestPlannerPage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [allQuests, setAllQuests] = useState<string[]>(POPULAR);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [result, setResult] = useState<QuestChainResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedCount, setCheckedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    const savedPlayer = loadStored("qh-rsn");
    if (savedPlayer && savedPlayer.name && savedPlayer.skills) setPlayer(savedPlayer);

    const comp = loadStored("qh-completed");
    if (Array.isArray(comp)) setCompleted(new Set(comp));

    const cached = loadStored("qh-questlist2");
    if (cached && Array.isArray(cached.all) && cached.all.length > 0) {
      setAllQuests(cached.all);
      if (Date.now() - (cached.ts || 0) < 7 * 24 * 60 * 60 * 1000) return;
    }
    (async () => {
      const res = await fetchQuestCategories();
      if (!res) return;
      setAllQuests(res.all);
      saveStored("qh-questlist2", {
        ts: Date.now(),
        all: res.all,
        f2p: res.f2p.length > 5 ? res.f2p : F2P_FALLBACK,
        mini: res.mini.length > 0 ? res.mini : MINI_FALLBACK,
      });
    })();
  }, []);

  const suggestions = query.trim()
    ? allQuests.filter((n) => n.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  const planFor = async (name: string) => {
    setTarget(name);
    setQuery("");
    setResult(null);
    setError(null);
    setCheckedCount(0);
    setLoading(true);
    const myRun = ++runId.current;
    try {
      const chain = await fetchQuestChain(name, allQuests, (n) => {
        if (runId.current === myRun) setCheckedCount(n);
      });
      if (runId.current === myRun) setResult(chain);
    } catch (e: any) {
      if (runId.current === myRun) setError(e?.message || "Couldn't plan this quest's requirements.");
    } finally {
      if (runId.current === myRun) setLoading(false);
    }
  };

  const toggleCompleted = (name: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      saveStored("qh-completed", Array.from(next));
      return next;
    });
  };

  const remaining = result ? result.order.filter((n) => !completed.has(n)) : [];
  const skillEntries = result
    ? Object.entries(result.skillTotals).sort((a, b) => {
        const aMet = player ? (player.skills[a[0]] ?? 1) >= a[1] : true;
        const bMet = player ? (player.skills[b[0]] ?? 1) >= b[1] : true;
        if (aMet !== bMet) return aMet ? 1 : -1;
        return a[0].localeCompare(b[0]);
      })
    : [];
  const unresolved = result ? result.order.filter((n) => result.nodes[n] && !result.nodes[n].found) : [];

  return (
    <div style={frame}>
      <div style={{ background: C.bg, borderBottom: `2px solid ${C.border}`, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ ...headBtn, textDecoration: "none", display: "inline-block" }}>
            ←
          </Link>
          <div style={{ ...goldTitle, fontSize: 17, fontWeight: 700, flex: 1 }}>🧭 Quest Path Planner</div>
          <Nav />
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 14px 40px" }}>
        <div style={{ fontSize: 13, color: C.textDim, marginBottom: 14 }}>
          Pick a quest and this works out every quest you'd need to finish first — in order — plus the
          highest skill level each one calls for, pulled from each quest's own requirement list on the
          wiki.
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a quest…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            fontSize: 15,
            background: C.panelSoft,
            color: C.parch,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            outline: "none",
          }}
        />
        {suggestions.length > 0 && (
          <div style={{ ...card, marginTop: 6, overflow: "hidden" }}>
            {suggestions.map((n) => (
              <button
                key={n}
                onClick={() => planFor(n)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  background: "transparent",
                  color: C.parch,
                  border: "none",
                  borderBottom: `1px solid ${C.borderSoft}`,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {n}
                {completed.has(n) && <span style={{ color: C.green, marginLeft: 6, fontSize: 12 }}>✓ done</span>}
              </button>
            ))}
          </div>
        )}

        {target && (
          <div style={{ marginTop: 18 }}>
            <div style={{ ...goldTitle, fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{target}</div>

            {loading && (
              <div style={{ textAlign: "center", padding: 30, color: C.textDim }}>
                Checking prerequisites… ({checkedCount} quest{checkedCount === 1 ? "" : "s"} so far)
              </div>
            )}

            {error && !loading && (
              <div style={{ ...card, borderColor: C.red, padding: 16, color: C.parch, marginBottom: 14 }}>
                <div style={{ color: C.red, fontWeight: 700, marginBottom: 4 }}>Couldn't plan this quest</div>
                {error}
              </div>
            )}

            {result && !loading && (
              <>
                {completed.has(target) ? (
                  <div style={{ ...card, padding: 16, color: C.green, textAlign: "center", fontWeight: 700 }}>
                    ✓ You've already marked this quest as completed.
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: C.textDim, marginBottom: 14 }}>
                    <b style={{ color: C.gold }}>{remaining.length}</b> of {result.order.length} quest
                    {result.order.length === 1 ? "" : "s"} left to go, in order.
                  </div>
                )}

                {skillEntries.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: C.goldDim, fontWeight: 700, marginBottom: 6 }}>
                      SKILL REQUIREMENTS (HIGHEST ACROSS THE WHOLE CHAIN)
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                      {skillEntries.map(([skill, level]) => {
                        const current = player ? player.skills[normalizeSkill(skill)] ?? 1 : null;
                        const met = current !== null ? current >= level : null;
                        return (
                          <span
                            key={skill}
                            style={{
                              ...chip,
                              borderColor: met === false ? C.red : met === true ? C.green : C.border,
                              color: met === false ? C.red : met === true ? C.green : C.parch,
                            }}
                          >
                            {capitalize(skill)} {level}
                            {current !== null && <span style={{ opacity: 0.7 }}> (you: {current})</span>}
                          </span>
                        );
                      })}
                    </div>
                  </>
                )}

                <div style={{ fontSize: 12, color: C.goldDim, fontWeight: 700, marginBottom: 6 }}>
                  QUEST ORDER
                </div>
                {result.order.map((name, i) => {
                  const isDone = completed.has(name);
                  const isTarget = name === target;
                  const node = result.nodes[name];
                  return (
                    <div
                      key={name}
                      style={{
                        ...card,
                        padding: "10px 12px",
                        marginBottom: 6,
                        borderColor: isTarget ? C.gold : C.borderSoft,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <button
                        onClick={() => toggleCompleted(name)}
                        aria-label={isDone ? "Mark not completed" : "Mark completed"}
                        style={{
                          width: 26,
                          height: 26,
                          flexShrink: 0,
                          borderRadius: "50%",
                          background: isDone ? C.green : "transparent",
                          border: `1px solid ${isDone ? C.green : C.borderSoft}`,
                          color: isDone ? C.ink : "transparent",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        ✓
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: isTarget ? 700 : 600,
                            color: isDone ? C.textDim : isTarget ? C.gold : C.parch,
                            textDecoration: isDone ? "line-through" : "none",
                          }}
                        >
                          {i + 1}. {name} {isTarget && "🎯"}
                        </div>
                        {node && !node.found && (
                          <div style={{ fontSize: 11, color: C.red, marginTop: 2 }}>
                            ⚠️ Couldn't load this quest's requirements — check it manually.
                          </div>
                        )}
                      </div>
                      <a
                        href={wikiUrl(name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...headBtn, padding: "6px 8px", fontSize: 12, flexShrink: 0 }}
                        title="Open on wiki"
                      >
                        🔍
                      </a>
                      <Link
                        href={`/?quest=${encodeURIComponent(name)}`}
                        style={{ ...headBtn, padding: "6px 8px", fontSize: 12, flexShrink: 0, textDecoration: "none" }}
                        title="Open in Quest Helper"
                      >
                        ▶️
                      </Link>
                    </div>
                  );
                })}

                {unresolved.length > 0 && (
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 10 }}>
                    ⚠️ {unresolved.length} quest page{unresolved.length === 1 ? "" : "s"} couldn't be read from
                    the wiki, so their own prerequisites (if any) aren't reflected above:{" "}
                    {unresolved.join(", ")}.
                  </div>
                )}

                <div style={{ fontSize: 11, color: C.textDim, marginTop: 10 }}>
                  Built from each quest's "Requirements" list on the wiki, matched against known quest
                  names — an unusual requirement wording could miss a prerequisite, so double-check
                  anything surprising against the quest's own wiki page.
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
