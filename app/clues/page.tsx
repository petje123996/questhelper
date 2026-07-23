"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, headBtn, bigBtn } from "@/lib/theme";
import { wikiUrl } from "@/lib/format";
import { loadStored, saveStored } from "@/lib/storage";
import { mapHref } from "@/lib/map";
import { CLUE_TYPES, fetchClueTable, locateClueSolution, lookupClueSolution } from "@/lib/clues";
import type { ClueEntry } from "@/lib/clues";
import type { Lookup } from "@/lib/quest";
import { useCloseOnBack } from "@/hooks/useCloseOnBack";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";

export default function CluesPage() {
  const router = useRouter();
  const [activeId, setActiveId] = useState(CLUE_TYPES[0].id);
  const [entries, setEntries] = useState<Record<string, ClueEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState<Record<string, boolean>>({});
  const [locateError, setLocateError] = useState<Record<string, string>>({});
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  useCloseOnBack(!!lookup, useCallback(() => setLookup(null), []));
  useLockBodyScroll(!!lookup);

  const activeType = CLUE_TYPES.find((t) => t.id === activeId)!;

  const openLookup = async (entry: ClueEntry) => {
    setLookupLoading(true);
    setLookup({ title: entry.solution, page: "", loading: true, images: [], coords: null, error: null });
    const result = await lookupClueSolution(entry.solution);
    setLookupLoading(false);
    setLookup(
      result || {
        title: entry.solution,
        page: entry.solution,
        loading: false,
        images: [],
        coords: null,
        error: "Couldn't find a wiki page for this.",
      }
    );
  };

  const locateOnMap = async (entry: ClueEntry) => {
    const key = entry.clue;
    setLocating((p) => ({ ...p, [key]: true }));
    setLocateError((p) => {
      if (!(key in p)) return p;
      const next = { ...p };
      delete next[key];
      return next;
    });
    const loc = await locateClueSolution(entry.solution);
    setLocating((p) => {
      const next = { ...p };
      delete next[key];
      return next;
    });
    if (loc) {
      router.push(mapHref({ x: loc.x, y: loc.y, title: loc.title, marker: true, plane: loc.plane, mapId: loc.mapId }));
    } else {
      setLocateError((p) => ({ ...p, [key]: "Couldn't find a map location for this." }));
    }
  };

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
  const displayed = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => e.clue.toLowerCase().includes(q));
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
            {query.trim()
              ? `${displayed.length} of ${list.length} ${activeType.label.toLowerCase()} clues match.`
              : `${list.length} ${activeType.label.toLowerCase()} clues loaded — type to filter.`}
          </div>
        )}

        {!loading && !error && list.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {displayed.length === 0 && (
              <div style={{ fontSize: 13, color: C.textDim, textAlign: "center", padding: 20 }}>
                No matching clues found.
              </div>
            )}
            {displayed.map((m, i) => (
              <div key={i} style={{ ...card, padding: "12px 14px", marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: C.textDim, marginBottom: 4 }}>{m.clue}</div>
                <div style={{ fontSize: 15, color: C.parch, fontWeight: 600 }}>{m.solution}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  {m.coords ? (
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
                      style={{ ...bigBtn, flex: 1, padding: "9px 10px", fontSize: 13 }}
                    >
                      🗺️ Show on map
                    </button>
                  ) : (
                    <button
                      onClick={() => locateOnMap(m)}
                      disabled={!!locating[m.clue]}
                      style={{
                        ...bigBtn,
                        flex: 1,
                        padding: "9px 10px",
                        fontSize: 13,
                        opacity: locating[m.clue] ? 0.6 : 1,
                        cursor: locating[m.clue] ? "default" : "pointer",
                      }}
                    >
                      {locating[m.clue] ? "Locating…" : "🗺️ Locate on map"}
                    </button>
                  )}
                  <button
                    onClick={() => openLookup(m)}
                    style={{
                      flex: 1,
                      padding: "9px 10px",
                      fontSize: 13,
                      fontWeight: 700,
                      background: "transparent",
                      color: C.gold,
                      border: `1px solid ${C.border}`,
                      borderRadius: 12,
                      cursor: "pointer",
                    }}
                  >
                    🖼️ Picture
                  </button>
                </div>
                {locateError[m.clue] && (
                  <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
                    {locateError[m.clue]}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {lookup && (
        <div
          onClick={() => setLookup(null)}
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div style={{ ...goldTitle, fontSize: 17, fontWeight: 700 }}>🔍 {lookup.title}</div>
              <button
                onClick={() => setLookup(null)}
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

            {lookupLoading && (
              <div style={{ color: C.textDim, padding: "20px 0", textAlign: "center" }}>
                Searching the wiki…
              </div>
            )}

            {!lookupLoading && lookup.error && (
              <div style={{ color: C.textDim, fontSize: 14, marginBottom: 12 }}>{lookup.error}</div>
            )}

            {!lookupLoading &&
              lookup.images.map((src) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    marginBottom: 10,
                    border: `1px solid ${C.borderSoft}`,
                  }}
                />
              ))}

            {!lookupLoading && lookup.coords && (
              <button
                onClick={() => {
                  const c = lookup.coords!;
                  const title = lookup.title;
                  setLookup(null);
                  router.push(mapHref({ x: c.x, y: c.y, title, marker: true, plane: c.plane, mapId: c.mapId }));
                }}
                style={{ ...bigBtn, marginBottom: 12 }}
              >
                🗺️ Show on map
              </button>
            )}

            {!lookupLoading && lookup.page && (
              <a
                href={wikiUrl(lookup.page)}
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
