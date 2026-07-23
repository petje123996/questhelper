"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, card, headBtn } from "@/lib/theme";
import { fetchJson } from "@/lib/format";
import { loadStored, saveStored } from "@/lib/storage";
import { GE_API, itemIconUrl, fmtGp, timeAgo } from "@/lib/prices";
import type { ItemMapping, LatestPrice, PricePoint } from "@/lib/prices";

type RecentItem = { id: number; name: string };

function Sparkline({ points }: { points: number[] }) {
  const width = 320;
  const height = 56;
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const d = points
    .map((p, i) => {
      const x = (i * step).toFixed(1);
      const y = (height - ((p - min) / range) * (height - 6) - 3).toFixed(1);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={d} fill="none" stroke={C.gold} strokeWidth={2} />
    </svg>
  );
}

export default function PricesPage() {
  const [query, setQuery] = useState("");
  const [mapping, setMapping] = useState<ItemMapping[]>([]);
  const [suggest, setSuggest] = useState<ItemMapping[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [selected, setSelected] = useState<ItemMapping | null>(null);
  const [latest, setLatest] = useState<LatestPrice | null>(null);
  const [series, setSeries] = useState<PricePoint[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [mappingError, setMappingError] = useState<string | null>(null);

  useEffect(() => {
    const r = loadStored("qh-ge-recent");
    if (Array.isArray(r)) setRecent(r);

    const cached = loadStored("qh-ge-mapping");
    if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
      setMapping(cached.items);
      if (Date.now() - (cached.ts || 0) < 7 * 24 * 60 * 60 * 1000) return;
    }
    (async () => {
      try {
        const items: ItemMapping[] = await fetchJson(`${GE_API}/mapping`);
        if (Array.isArray(items) && items.length > 100) {
          setMapping(items);
          saveStored("qh-ge-mapping", { ts: Date.now(), items });
        }
      } catch {
        if (!cached) setMappingError("Couldn't load the item list.");
      }
    })();
  }, []);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q || mapping.length === 0) {
      setSuggest([]);
      return;
    }
    const starts: ItemMapping[] = [];
    const contains: ItemMapping[] = [];
    for (const it of mapping) {
      const n = it.name.toLowerCase();
      if (n.startsWith(q)) {
        if (starts.length < 8) starts.push(it);
      } else if (n.includes(q) && contains.length < 8) {
        contains.push(it);
      }
      if (starts.length >= 8) break;
    }
    setSuggest([...starts, ...contains].slice(0, 8));
  }, [query, mapping]);

  const selectItem = async (item: ItemMapping) => {
    setQuery("");
    setSuggest([]);
    setSelected(item);
    setDetailLoading(true);
    setDetailError(null);
    setLatest(null);
    setSeries([]);
    try {
      const [latestData, seriesData] = await Promise.all([
        fetchJson(`${GE_API}/latest?id=${item.id}`),
        fetchJson(`${GE_API}/timeseries?timestep=6h&id=${item.id}`).catch(() => null),
      ]);
      const lp: LatestPrice | undefined = latestData?.data?.[String(item.id)];
      setLatest(lp || null);
      if (Array.isArray(seriesData?.data)) setSeries(seriesData.data.slice(-40));
      setRecent((prev) => {
        const next = [{ id: item.id, name: item.name }, ...prev.filter((r) => r.id !== item.id)].slice(0, 8);
        saveStored("qh-ge-recent", next);
        return next;
      });
    } catch {
      setDetailError("Couldn't load price data for this item.");
    } finally {
      setDetailLoading(false);
    }
  };

  const selectById = (id: number, name: string) => {
    const found = mapping.find((m) => m.id === id) || { id, name } as ItemMapping;
    selectItem(found as ItemMapping);
  };

  const margin = latest && latest.high !== null && latest.low !== null ? latest.high - latest.low : null;
  const highSeries = series.map((p) => p.avgHighPrice).filter((n): n is number => n !== null);
  const lowSeries = series.map((p) => p.avgLowPrice).filter((n): n is number => n !== null);

  return (
    <div style={frame}>
      <div style={{ background: C.bg, borderBottom: `2px solid ${C.border}`, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ ...headBtn, textDecoration: "none", display: "inline-block" }}>
            ←
          </Link>
          <div style={{ ...goldTitle, fontSize: 17, fontWeight: 700, flex: 1 }}>💰 GE Prices</div>
          <Nav />
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 14px 40px" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for an item…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "14px 16px",
            fontSize: 16,
            background: C.panelSoft,
            color: C.parch,
            border: `2px solid ${C.border}`,
            borderRadius: 10,
            outline: "none",
          }}
        />
        {mappingError && (
          <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{mappingError}</div>
        )}

        {suggest.length > 0 && (
          <div style={{ ...card, marginTop: 8, overflow: "hidden" }}>
            {suggest.map((it) => (
              <button
                key={it.id}
                onClick={() => selectItem(it)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 16px",
                  background: "transparent",
                  color: C.parch,
                  border: "none",
                  borderBottom: `1px solid ${C.borderSoft}`,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                <img src={itemIconUrl(it.icon)} alt="" style={{ width: 24, height: 24, objectFit: "contain", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>{it.name}</span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div style={{ ...card, padding: "14px 16px", marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img
                src={itemIconUrl(selected.icon)}
                alt=""
                style={{ width: 36, height: 36, objectFit: "contain", flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...goldTitle, fontSize: 18, fontWeight: 700 }}>{selected.name}</div>
                {selected.examine && (
                  <div style={{ fontSize: 12, color: C.textDim }}>{selected.examine}</div>
                )}
              </div>
            </div>

            {detailLoading && (
              <div style={{ textAlign: "center", padding: 20, color: C.textDim }}>
                Fetching latest prices…
              </div>
            )}

            {detailError && !detailLoading && (
              <div style={{ fontSize: 13, color: C.red, marginTop: 12 }}>{detailError}</div>
            )}

            {!detailLoading && !detailError && latest && (
              <>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <div style={{ ...card, flex: 1, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700 }}>
                      INSTANT BUY
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>
                      {latest.high !== null ? fmtGp(latest.high) : "—"}
                    </div>
                    <div style={{ fontSize: 11, color: C.textDim }}>{timeAgo(latest.highTime)}</div>
                  </div>
                  <div style={{ ...card, flex: 1, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700 }}>
                      INSTANT SELL
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.red }}>
                      {latest.low !== null ? fmtGp(latest.low) : "—"}
                    </div>
                    <div style={{ fontSize: 11, color: C.textDim }}>{timeAgo(latest.lowTime)}</div>
                  </div>
                </div>

                {margin !== null && (
                  <div style={{ fontSize: 13, color: C.textDim, marginTop: 10 }}>
                    Margin: <b style={{ color: C.gold }}>{fmtGp(margin)}</b> gp
                    <span style={{ fontSize: 11 }}> (excl. GE tax)</span>
                  </div>
                )}

                {highSeries.length > 1 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700, marginBottom: 4 }}>
                      TREND (last ~10 days, 6h avg)
                    </div>
                    <Sparkline points={highSeries} />
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                    fontSize: 12,
                    color: C.textDim,
                    marginTop: 14,
                  }}
                >
                  <span>
                    Buy limit: <b style={{ color: C.parch }}>{selected.limit ?? "—"}</b>
                  </span>
                  <span>
                    High alch: <b style={{ color: C.parch }}>{fmtGp(selected.highalch)}</b>
                  </span>
                  <span>
                    Low alch: <b style={{ color: C.parch }}>{fmtGp(selected.lowalch)}</b>
                  </span>
                </div>
              </>
            )}

            {!detailLoading && !detailError && !latest && (
              <div style={{ fontSize: 13, color: C.textDim, marginTop: 12 }}>
                No trade data available for this item.
              </div>
            )}
          </div>
        )}

        {!selected && recent.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={{ ...goldTitle, fontSize: 15, marginBottom: 8 }}>Recent</div>
            {recent.map((r) => (
              <button
                key={r.id}
                onClick={() => selectById(r.id, r.name)}
                style={{
                  ...card,
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 14px",
                  marginBottom: 8,
                  color: C.parch,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}

        {!selected && recent.length === 0 && (
          <div style={{ fontSize: 13, color: C.textDim, marginTop: 20, textAlign: "center" }}>
            Search for an item to see its current Grand Exchange price.
          </div>
        )}
      </div>
    </div>
  );
}
