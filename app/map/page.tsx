"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import { C, frame, goldTitle, headBtn, card } from "@/lib/theme";
import { loadStored, saveStored } from "@/lib/storage";
import { useCloseOnBack } from "@/hooks/useCloseOnBack";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import {
  TILES,
  F2P_RECTS,
  buildRouteOptions,
  chebyshev,
  fmtSec,
  runSecs,
  loadLeaflet,
} from "@/lib/map";

type MapTarget = {
  x: number;
  y: number;
  title: string;
  marker: boolean;
  plane?: number;
  mapId?: number;
};

function useMapTarget(): MapTarget {
  const params = useSearchParams();
  const hasCoords = params.has("x") && params.has("y");
  const x = hasCoords ? Number(params.get("x")) : 3222;
  const y = hasCoords ? Number(params.get("y")) : 3218;
  const planeRaw = params.get("plane");
  const plane = planeRaw !== null && !Number.isNaN(Number(planeRaw)) ? Number(planeRaw) : undefined;
  const mapIdRaw = params.get("mapId");
  const mapId = mapIdRaw !== null && Number(mapIdRaw) > 0 ? Number(mapIdRaw) : undefined;
  return {
    x: Number.isFinite(x) ? x : 3222,
    y: Number.isFinite(y) ? y : 3218,
    title: params.get("title") || "Gielinor",
    marker: hasCoords && params.get("marker") === "1",
    plane,
    mapId,
  };
}

function MapPageInner() {
  const target = useMapTarget();
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const planeRef = useRef(0);
  const routeModeRef = useRef(false);
  const routeRef = useRef<{ pts: { x: number; y: number }[]; layers: any[] }>({
    pts: [],
    layers: [],
  });
  const f2pModeRef = useRef(false);
  const f2pLayerRef = useRef<any>(null);

  const [mapError, setMapError] = useState<string | null>(null);
  const [floor, setFloor] = useState(0);
  const [routeMode, setRouteMode] = useState(false);
  const [routeResult, setRouteResult] = useState<{
    a: { x: number; y: number };
    b: { x: number; y: number };
    tiles: number;
  } | null>(null);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [f2pMode, setF2pMode] = useState(false);

  useCloseOnBack(routeModalOpen, useCallback(() => setRouteModalOpen(false), []));
  useLockBodyScroll(routeModalOpen);

  // Load the saved F2P-highlight preference before the map initialises
  useEffect(() => {
    const stored = loadStored("qh-f2p");
    if (stored === true) {
      setF2pMode(true);
      f2pModeRef.current = true;
    }
  }, []);

  useEffect(() => {
    let map: any = null;
    let cancelled = false;
    setMapError(null);
    setRouteResult(null);
    setRouteModalOpen(false);
    setRouteMode(false);
    routeModeRef.current = false;
    routeRef.current = { pts: [], layers: [] };
    planeRef.current = target.plane ?? 0;
    setFloor(target.plane ?? 0);
    (async () => {
      try {
        let v: string | null = null;
        const cached = loadStored("qh-mapver");
        if (cached && cached.v && Date.now() - (cached.ts || 0) < 86400000) {
          v = cached.v;
        }
        if (!v) {
          const res = await fetch("/api/mapconfig");
          const d = await res.json();
          if (!res.ok || !d.cacheVersion) throw new Error();
          v = d.cacheVersion as string;
          saveStored("qh-mapver", { v, ts: Date.now() });
        }

        const L = await loadLeaflet();
        if (cancelled || !mapDivRef.current) return;

        map = L.map(mapDivRef.current, {
          crs: L.CRS.Simple,
          minZoom: -3,
          maxZoom: 5,
          zoomControl: true,
          attributionControl: true,
        });

        mapRef.current = map;

        const mapId = target.mapId && target.mapId > 0 ? target.mapId : 0;
        const OsrsTiles = L.TileLayer.extend({
          getTileUrl: function (c: any) {
            return `${TILES}/${mapId}_${v}/${c.z}/${planeRef.current}_${c.x}_${-(c.y + 1)}.png`;
          },
        });
        const layer = new OsrsTiles("", {
          minZoom: -3,
          maxZoom: 5,
          minNativeZoom: -3,
          maxNativeZoom: 3,
          tileSize: 256,
          attribution:
            'Map © Jagex · tiles <a href="https://weirdgloop.org/licensing" target="_blank" rel="noopener">RuneScape Wiki</a>',
        });
        layer.addTo(map);
        layerRef.current = layer;

        const pos = [target.y + 0.5, target.x + 0.5];
        map.setView(pos, target.marker ? 2 : 0);
        if (target.marker) {
          L.circleMarker(pos, {
            radius: 9,
            color: "#E7B84C",
            weight: 3,
            fillColor: "#C96A5B",
            fillOpacity: 0.9,
          })
            .addTo(map)
            .bindTooltip(target.title);
        }

        // Route measuring: tap start, tap destination
        map.on("click", (e: any) => {
          if (!routeModeRef.current) return;
          const pt = { x: e.latlng.lng, y: e.latlng.lat };
          const r = routeRef.current;
          if (r.pts.length >= 2) {
            r.layers.forEach((ly: any) => map.removeLayer(ly));
            r.pts = [];
            r.layers = [];
            setRouteResult(null);
            setRouteModalOpen(false);
          }
          r.pts.push(pt);
          const mk = L.circleMarker([pt.y, pt.x], {
            radius: 7,
            color: "#E7B84C",
            weight: 3,
            fillColor: r.pts.length === 1 ? "#7CB363" : "#C96A5B",
            fillOpacity: 0.95,
          }).addTo(map);
          r.layers.push(mk);
          if (r.pts.length === 2) {
            const [a, b] = r.pts;
            const line = L.polyline(
              [
                [a.y, a.x],
                [b.y, b.x],
              ],
              { color: "#E7B84C", weight: 3, dashArray: "6 6" }
            ).addTo(map);
            r.layers.push(line);
            // OSRS movement allows diagonals → Chebyshev distance
            setRouteResult({ a, b, tiles: chebyshev(a, b) });
            setRouteModalOpen(true);
          }
        });

        // Dim members areas when F2P mode is on
        if (f2pModeRef.current) addF2pOverlay(map, L);
      } catch {
        if (!cancelled) setMapError("The map couldn't be loaded.");
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current = null;
      layerRef.current = null;
      f2pLayerRef.current = null;
      routeRef.current = { pts: [], layers: [] };
      if (map) map.remove();
    };
  }, [target.x, target.y, target.title, target.marker, target.plane, target.mapId]);

  // Dark polygon over the whole world with F2P areas cut out as holes
  const addF2pOverlay = (map: any, L: any) => {
    if (f2pLayerRef.current) return;
    const outer = [
      [0, 0],
      [0, 12800],
      [12800, 12800],
      [12800, 0],
    ];
    const holes = F2P_RECTS.map(([x1, y1, x2, y2]) => [
      [y1, x1],
      [y1, x2],
      [y2, x2],
      [y2, x1],
    ]);
    f2pLayerRef.current = L.polygon([outer, ...holes], {
      stroke: false,
      fillColor: "#000",
      fillOpacity: 0.55,
      interactive: false,
    }).addTo(map);
  };

  const toggleF2pMode = () => {
    const next = !f2pModeRef.current;
    f2pModeRef.current = next;
    setF2pMode(next);
    saveStored("qh-f2p", next);
    const L = (window as any).L;
    if (!mapRef.current || !L) return;
    if (next) {
      addF2pOverlay(mapRef.current, L);
    } else if (f2pLayerRef.current) {
      mapRef.current.removeLayer(f2pLayerRef.current);
      f2pLayerRef.current = null;
    }
  };

  const setMapFloor = (p: number) => {
    planeRef.current = p;
    setFloor(p);
    if (layerRef.current) layerRef.current.redraw();
  };

  const toggleRouteMode = () => {
    const next = !routeModeRef.current;
    routeModeRef.current = next;
    setRouteMode(next);
    if (!next && mapRef.current) {
      routeRef.current.layers.forEach((ly: any) => mapRef.current.removeLayer(ly));
      routeRef.current = { pts: [], layers: [] };
      setRouteResult(null);
      setRouteModalOpen(false);
    }
  };

  return (
    <div style={{ ...frame, height: "100vh", position: "relative", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderBottom: `2px solid ${C.border}`,
        }}
      >
        <Link href="/" style={{ ...headBtn, textDecoration: "none", display: "inline-block" }}>
          ←
        </Link>
        <div
          style={{
            ...goldTitle,
            fontSize: 16,
            fontWeight: 700,
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          🗺️ {target.title}
        </div>
        <button
          onClick={toggleRouteMode}
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: routeMode ? C.gold : C.panelSoft,
            color: routeMode ? C.ink : C.gold,
            border: `1px solid ${routeMode ? C.gold : C.border}`,
            fontSize: 15,
            cursor: "pointer",
            lineHeight: 1,
          }}
          title="Measure route"
        >
          📏
        </button>
        {[0, 1, 2, 3].map((p) => (
          <button
            key={p}
            onClick={() => setMapFloor(p)}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: floor === p ? C.gold : "transparent",
              color: floor === p ? C.ink : C.textDim,
              border: `1px solid ${floor === p ? C.gold : C.borderSoft}`,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              lineHeight: 1,
              flexShrink: 0,
            }}
            title={`Floor ${p}`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={toggleF2pMode}
          style={{
            height: 30,
            padding: "0 9px",
            borderRadius: 8,
            background: f2pMode ? C.gold : "transparent",
            color: f2pMode ? C.ink : C.textDim,
            border: `1px solid ${f2pMode ? C.gold : C.borderSoft}`,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            lineHeight: 1,
            flexShrink: 0,
          }}
          title="Highlight free-to-play area"
        >
          F2P
        </button>
        <Nav />
      </div>
      {routeMode && !routeModalOpen && (
        <div
          style={{
            padding: "8px 14px",
            fontSize: 13,
            color: C.textDim,
            borderBottom: `1px solid ${C.borderSoft}`,
            background: C.panel,
          }}
        >
          📏 Tap your start point, then your destination.
        </div>
      )}
      {mapError ? (
        <div style={{ padding: 30, textAlign: "center", color: C.textDim }}>{mapError}</div>
      ) : (
        <div ref={mapDivRef} style={{ flex: 1, background: "#000" }} />
      )}

      {/* Route advice modal */}
      {routeResult && routeModalOpen && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1200,
            maxHeight: "62%",
            overflowY: "auto",
            background: C.bg,
            borderTop: `2px solid ${C.gold}`,
            borderRadius: "16px 16px 0 0",
            padding: "12px 14px 20px",
            boxSizing: "border-box",
            boxShadow: "0 -6px 24px rgba(0,0,0,.5)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ ...goldTitle, fontSize: 16, fontWeight: 700, flex: 1 }}>
              📏 {routeResult.tiles} tiles
            </div>
            <button
              onClick={toggleF2pMode}
              style={{
                height: 28,
                padding: "0 9px",
                borderRadius: 8,
                background: f2pMode ? C.gold : "transparent",
                color: f2pMode ? C.ink : C.textDim,
                border: `1px solid ${f2pMode ? C.gold : C.borderSoft}`,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              F2P only
            </button>
            <button
              onClick={() => setRouteModalOpen(false)}
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: C.panelSoft,
                color: C.parch,
                border: `1px solid ${C.border}`,
                fontSize: 13,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ fontSize: 12, color: C.textDim, marginBottom: 10 }}>
            🚶 Walk ~{fmtSec(routeResult.tiles * 0.6)} · 🏃 Run ~{fmtSec(runSecs(routeResult.tiles))}
          </div>

          {buildRouteOptions(routeResult.a, routeResult.b, f2pMode).map((opt, i) => (
            <div
              key={opt.name}
              style={{
                ...card,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                marginBottom: 6,
                borderColor: i === 0 ? C.gold : C.borderSoft,
              }}
            >
              <span style={{ fontSize: 17, flexShrink: 0 }}>{opt.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: i === 0 ? C.gold : C.parch,
                  }}
                >
                  {opt.name}
                  {!opt.f2p && !f2pMode && (
                    <span style={{ fontSize: 10, color: C.textDim, marginLeft: 6, fontWeight: 400 }}>
                      members
                    </span>
                  )}
                  {i === 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        color: C.ink,
                        background: C.gold,
                        borderRadius: 5,
                        padding: "1px 5px",
                        marginLeft: 6,
                        fontWeight: 700,
                      }}
                    >
                      BEST
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: C.textDim }}>{opt.detail}</div>
              </div>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 14,
                  fontWeight: 700,
                  color: i === 0 ? C.gold : C.text,
                }}
              >
                ~{fmtSec(opt.sec)}
              </span>
            </div>
          ))}

          <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>
            Straight-line estimates — walls, doors and stairs not included.
          </div>
        </div>
      )}
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div style={{ ...frame, display: "flex", alignItems: "center", justifyContent: "center" }}>
          Loading map…
        </div>
      }
    >
      <MapPageInner />
    </Suspense>
  );
}
