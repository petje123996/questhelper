"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, headBtn } from "@/lib/theme";
import { API, fetchJson } from "@/lib/format";
import { loadStored, saveStored } from "@/lib/storage";
import { DIARY_REGIONS, parseDiaryPage } from "@/lib/diary";
import type { DiaryTier } from "@/lib/diary";

const TIER_COLOR: Record<string, string> = {
  Easy: C.qGreen,
  Medium: C.qYellow,
  Hard: C.red,
  Elite: C.gold,
};

export default function DiariesPage() {
  const [region, setRegion] = useState<string | null>(null);
  const [tiers, setTiers] = useState<DiaryTier[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [totals, setTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    const d = loadStored("qh-diary-done");
    if (Array.isArray(d)) setDone(new Set(d));
    const t = loadStored("qh-diary-totals");
    if (t && typeof t === "object") setTotals(t);
  }, []);

  const openRegion = async (r: string) => {
    setRegion(r);
    setTiers(null);
    setError(null);
    setLoading(true);
    try {
      const data = await fetchJson(
        `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(
          r + " Diary"
        )}`
      );
      if (data.error) throw new Error("Diary page not found on the wiki.");
      const parsed = parseDiaryPage(data.parse.text["*"]);
      if (!parsed.length) throw new Error("No tasks found on this page.");
      setTiers(parsed);
      const total = parsed.reduce((s, t) => s + t.tasks.length, 0);
      setTotals((prev) => {
        const next = { ...prev, [r]: total };
        saveStored("qh-diary-totals", next);
        return next;
      });
    } catch (e: any) {
      setError(e?.message || "Loading failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = (key: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveStored("qh-diary-done", Array.from(next));
      return next;
    });
  };

  const regionDoneCount = (r: string) =>
    Array.from(done).filter((k) => k.startsWith(r + "::")).length;

  return (
    <div style={frame}>
      <div style={{ background: C.bg, borderBottom: `2px solid ${C.border}`, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {region ? (
            <button onClick={() => setRegion(null)} style={headBtn}>
              ←
            </button>
          ) : (
            <Link href="/" style={{ ...headBtn, textDecoration: "none", display: "inline-block" }}>
              ←
            </Link>
          )}
          <div style={{ ...goldTitle, fontSize: 17, fontWeight: 700, flex: 1 }}>
            📔 {region ? `${region} Diary` : "Achievement Diaries"}
          </div>
          <Nav />
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 14px 40px" }}>
        {!region && (
          <>
            <div style={{ fontSize: 13, color: C.textDim, marginBottom: 14 }}>
              Pick a region to see its Easy, Medium, Hard and Elite diary tasks.
              Progress is saved on this device.
            </div>
            <div style={{ ...card, overflow: "hidden" }}>
              {DIARY_REGIONS.map((r, i) => {
                const total = totals[r];
                const doneCount = regionDoneCount(r);
                const complete = total !== undefined && doneCount >= total && total > 0;
                return (
                  <button
                    key={r}
                    onClick={() => openRegion(r)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      textAlign: "left",
                      padding: "13px 16px",
                      background: "transparent",
                      color: complete ? C.qGreen : C.parch,
                      border: "none",
                      borderBottom: i < DIARY_REGIONS.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>{r}</span>
                    {total !== undefined && (
                      <span style={{ fontSize: 12, color: complete ? C.qGreen : C.textDim, fontWeight: 700 }}>
                        {complete ? "✓ " : ""}
                        {doneCount}/{total}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {region && loading && (
          <div style={{ textAlign: "center", padding: 40, color: C.textDim }}>
            Fetching the diary from the wiki…
          </div>
        )}

        {region && error && !loading && (
          <div style={{ ...card, borderColor: C.red, padding: 16, color: C.parch }}>
            <div style={{ color: C.red, fontWeight: 700, marginBottom: 4 }}>
              Couldn't load this diary
            </div>
            {error}
          </div>
        )}

        {region && tiers && !loading && !error && (
          <>
            {tiers.map((tier) => {
              const tierDone = tier.tasks.filter((t) => done.has(`${region}::${tier.tier}::${t}`)).length;
              return (
                <div key={tier.tier} style={{ marginBottom: 18 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: TIER_COLOR[tier.tier] || C.gold }}>
                      {tier.tier.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 12, color: C.textDim }}>
                      {tierDone}/{tier.tasks.length}
                    </div>
                  </div>
                  <div style={{ ...card, overflow: "hidden" }}>
                    {tier.tasks.map((t, i) => {
                      const key = `${region}::${tier.tier}::${t}`;
                      const isDone = done.has(key);
                      return (
                        <button
                          key={i}
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
                              i < tier.tasks.length - 1 ? `1px solid ${C.borderSoft}` : "none",
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
                          <span
                            style={{
                              color: isDone ? C.textDim : C.text,
                              textDecoration: isDone ? "line-through" : "none",
                            }}
                          >
                            {t}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
