"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, headBtn, bigBtn } from "@/lib/theme";
import { loadStored, saveStored } from "@/lib/storage";
import { mapHref } from "@/lib/map";
import { CLUE_TYPES, fetchClueTable } from "@/lib/clues";
import type { ClueEntry } from "@/lib/clues";

export default function CluesPage() {
  const router = useRouter();
  const [activeId, setActiveId] = useState(CLUE_TYPES[0].id);
  const [entries, setEntries] = useState<Record<string, ClueEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const activeType = CLUE_TYPES.find((t) => t.id === activeId)!;

  useEffect(() => {
    if (entries[activeId]) return;
    const cacheKey = `qh-clue-${activeId}`;
    const cached = loadStored(cacheKey);
    if (cached && Array.isArray(cached.entries) && cached.entries.length > 0) {
      setEntries((prev) => ({ ...prev, [activeId]: cached.entries }));
      if (Date.now() - (cached.ts || 0) < 30 * 24 * 60 * 60 * 1000) return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const parsed = await fetchClueTable(activeType);
        if (!parsed.length) throw new Error("No clues found on the wiki for this type.");
        setEntries((prev) => ({ ...prev, [activeId]: parsed }));
        saveStored(cacheKey, { ts: Date.now(), entries: parsed });
      } catch (e: any) {
        setError(e?.message || "Loading failed. Check your connection.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const list = entries[activeId] || [];
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return list.filter((e) => e.clue.toLowerCase().includes(q)).slice(0, 30);
  }, [query, list]);

  return (
    <div style={frame}>
      <div style={{ background: C.bg, borderBottom: `2px solid ${C.border}`, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ ...headBtn, textDecoration: "none", display: "inline-block" }}>
            ←
          </Link>
          <div style={{ ...goldTitle, fontSize: 17, fontWeight: 700, flex: 1 }}>🧩 Clue Solver</div>
          <Nav />
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 14px 40px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {CLUE_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setActiveId(t.id);
                setQuery("");
              }}
              style={{
                flex: 1,
                padding: "10px 8px",
                borderRadius: 10,
                background: activeId === t.id ? C.gold : "transparent",
                color: activeId === t.id ? C.ink : C.gold,
                border: `1px solid ${activeId === t.id ? C.gold : C.borderSoft}`,
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Paste or type the ${activeType.label.toLowerCase()} clue text…`}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "14px 16px",
            fontSize: 15,
            background: C.panelSoft,
            color: C.parch,
            border: `2px solid ${C.border}`,
            borderRadius: 10,
            outline: "none",
          }}
        />

        {loading && (
          <div style={{ textAlign: "center", padding: 30, color: C.textDim }}>
            Fetching {activeType.label.toLowerCase()} clues from the wiki…
          </div>
        )}

        {error && !loading && (
          <div style={{ ...card, borderColor: C.red, padding: 16, color: C.parch, marginTop: 14 }}>
            <div style={{ color: C.red, fontWeight: 700, marginBottom: 4 }}>
              Couldn't load {activeType.label.toLowerCase()} clues
            </div>
            {error}
          </div>
        )}

        {!loading && !error && list.length > 0 && (
          <div style={{ fontSize: 12, color: C.textDim, margin: "8px 0 4px" }}>
            {list.length} {activeType.label.toLowerCase()} clues loaded — start typing to search.
          </div>
        )}

        {query.trim() && (
          <div style={{ marginTop: 10 }}>
            {matches.length === 0 && !loading && (
              <div style={{ fontSize: 13, color: C.textDim, textAlign: "center", padding: 20 }}>
                No matching clues found.
              </div>
            )}
            {matches.map((m, i) => (
              <div key={i} style={{ ...card, padding: "12px 14px", marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: C.textDim, marginBottom: 4 }}>{m.clue}</div>
                <div style={{ fontSize: 15, color: C.parch, fontWeight: 600 }}>{m.solution}</div>
                {m.coords && (
                  <button
                    onClick={() =>
                      router.push(
                        mapHref({
                          x: m.coords!.x,
                          y: m.coords!.y,
                          title: m.solution,
                          marker: true,
                          plane: m.coords!.plane,
                          mapId: m.coords!.mapId,
                        })
                      )
                    }
                    style={{ ...bigBtn, marginTop: 10, padding: "9px 14px", fontSize: 13 }}
                  >
                    🗺️ Show on map
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
