"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, headBtn } from "@/lib/theme";
import { API, fetchJson } from "@/lib/format";
import { loadStored, saveStored } from "@/lib/storage";
import { CA_TIERS, parseCombatAchievements } from "@/lib/combatAchievements";
import type { CATask } from "@/lib/combatAchievements";

const TIER_COLOR: Record<string, string> = {
  Easy: C.qGreen,
  Medium: C.qYellow,
  Hard: C.red,
  Elite: C.gold,
  Master: "#B36AE0",
  Grandmaster: "#7CC7E0",
};

const taskKey = (t: CATask) => `${t.tier}::${t.monster}::${t.text}`;

export default function CombatAchievementsPage() {
  const [tasks, setTasks] = useState<CATask[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const d = loadStored("qh-ca-done");
    if (Array.isArray(d)) setDone(new Set(d));

    (async () => {
      setLoading(true);
      setError(null);
      try {
        let data = await fetchJson(
          `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(
            "Combat Achievements/All tasks"
          )}`
        );
        if (data.error) {
          data = await fetchJson(
            `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(
              "Combat Achievements"
            )}`
          );
        }
        if (data.error) throw new Error("Combat Achievements page not found on the wiki.");
        const parsed = parseCombatAchievements(data.parse.text["*"]);
        if (!parsed.length) throw new Error("No tasks found on this page.");
        setTasks(parsed);
      } catch (e: any) {
        setError(e?.message || "Loading failed. Check your connection.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleTask = (key: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveStored("qh-ca-done", Array.from(next));
      return next;
    });
  };

  const byTier = useMemo(() => {
    const groups: Record<string, CATask[]> = {};
    (tasks || []).forEach((t) => {
      (groups[t.tier] = groups[t.tier] || []).push(t);
    });
    return groups;
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q || !tasks) return null;
    return tasks.filter(
      (t) => t.text.toLowerCase().includes(q) || t.monster.toLowerCase().includes(q)
    );
  }, [filter, tasks]);

  const totalDone = (tasks || []).filter((t) => done.has(taskKey(t))).length;

  return (
    <div style={frame}>
      <div style={{ background: C.bg, borderBottom: `2px solid ${C.border}`, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ ...headBtn, textDecoration: "none", display: "inline-block" }}>
            ←
          </Link>
          <div style={{ ...goldTitle, fontSize: 17, fontWeight: 700, flex: 1 }}>
            🗡️ Combat Achievements
          </div>
          <Nav />
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 14px 40px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: C.textDim }}>
            Fetching combat achievement tasks from the wiki…
          </div>
        )}

        {error && !loading && (
          <div style={{ ...card, borderColor: C.red, padding: 16, color: C.parch }}>
            <div style={{ color: C.red, fontWeight: 700, marginBottom: 4 }}>
              Couldn't load Combat Achievements
            </div>
            {error}
          </div>
        )}

        {tasks && !loading && !error && (
          <>
            <div style={{ fontSize: 13, color: C.textDim, marginBottom: 12 }}>
              <b style={{ color: C.gold }}>{totalDone}</b> / {tasks.length} tasks completed —
              progress is saved on this device.
            </div>

            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by task or monster…"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                fontSize: 15,
                background: C.panelSoft,
                color: C.parch,
                border: `2px solid ${C.border}`,
                borderRadius: 10,
                outline: "none",
                marginBottom: 16,
              }}
            />

            {filtered ? (
              <div style={{ ...card, overflow: "hidden" }}>
                {filtered.length === 0 && (
                  <div style={{ padding: 16, fontSize: 13, color: C.textDim, textAlign: "center" }}>
                    No matching tasks.
                  </div>
                )}
                {filtered.map((t, i) => {
                  const key = taskKey(t);
                  const isDone = done.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleTask(key)}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 14px",
                        background: "transparent",
                        border: "none",
                        borderBottom: i < filtered.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          marginTop: 2,
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          background: isDone ? C.green : "transparent",
                          color: isDone ? C.bg : "transparent",
                          border: isDone ? `1px solid ${C.green}` : `2px solid ${C.border}`,
                        }}
                      >
                        ✓
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            color: isDone ? C.textDim : C.text,
                            textDecoration: isDone ? "line-through" : "none",
                          }}
                        >
                          {t.text}
                        </span>
                        {t.monster && (
                          <span style={{ display: "block", fontSize: 11, color: TIER_COLOR[t.tier] || C.textDim }}>
                            {t.monster} · {t.tier}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              CA_TIERS.filter((tier) => byTier[tier]?.length).map((tier) => {
                const tierTasks = byTier[tier];
                const tierDone = tierTasks.filter((t) => done.has(taskKey(t))).length;
                const isOpen = expanded === tier;
                return (
                  <div key={tier} style={{ marginBottom: 10 }}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : tier)}
                      style={{
                        ...card,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "12px 14px",
                        cursor: "pointer",
                        borderColor: isOpen ? (TIER_COLOR[tier] || C.gold) : C.borderSoft,
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 700, color: TIER_COLOR[tier] || C.gold }}>
                        {tier}
                      </span>
                      <span style={{ fontSize: 12, color: C.textDim }}>
                        {tierDone}/{tierTasks.length} {isOpen ? "▲" : "▼"}
                      </span>
                    </button>
                    {isOpen && (
                      <div style={{ ...card, overflow: "hidden", marginTop: 6 }}>
                        {tierTasks.map((t, i) => {
                          const key = taskKey(t);
                          const isDone = done.has(key);
                          return (
                            <button
                              key={key}
                              onClick={() => toggleTask(key)}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 10,
                                width: "100%",
                                textAlign: "left",
                                padding: "10px 14px",
                                background: "transparent",
                                border: "none",
                                borderBottom:
                                  i < tierTasks.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                                fontSize: 14,
                                cursor: "pointer",
                              }}
                            >
                              <span
                                style={{
                                  flexShrink: 0,
                                  marginTop: 2,
                                  width: 18,
                                  height: 18,
                                  borderRadius: 5,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 12,
                                  background: isDone ? C.green : "transparent",
                                  color: isDone ? C.bg : "transparent",
                                  border: isDone ? `1px solid ${C.green}` : `2px solid ${C.border}`,
                                }}
                              >
                                ✓
                              </span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span
                                  style={{
                                    color: isDone ? C.textDim : C.text,
                                    textDecoration: isDone ? "line-through" : "none",
                                  }}
                                >
                                  {t.text}
                                </span>
                                {t.monster && (
                                  <span style={{ display: "block", fontSize: 11, color: C.textDim }}>
                                    {t.monster}
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}
