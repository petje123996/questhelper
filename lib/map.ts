export const TILES = "https://maps.runescape.wiki/osrs/tiles";

export type MapLinkTarget = {
  x: number;
  y: number;
  title: string;
  marker: boolean;
  plane?: number;
  mapId?: number;
};

// Build a /map URL for a specific target, so any page can link straight to
// a spot on the world map without holding map state itself.
export function mapHref(target: MapLinkTarget): string {
  const params = new URLSearchParams();
  params.set("x", String(Math.round(target.x)));
  params.set("y", String(Math.round(target.y)));
  params.set("title", target.title);
  if (target.marker) params.set("marker", "1");
  if (target.plane !== undefined) params.set("plane", String(target.plane));
  if (target.mapId !== undefined) params.set("mapId", String(target.mapId));
  return `/map?${params.toString()}`;
}

// Common teleports for route advice: destination coords + cast time
export type Teleport = {
  name: string;
  x: number;
  y: number;
  f2p: boolean;
  cast: number;
  note: string;
  icon: string;
};
export const TELEPORTS: Teleport[] = [
  { name: "Home Teleport (Lumbridge)", x: 3222, y: 3218, f2p: true, cast: 12, note: "free · 30 min cooldown", icon: "🏠" },
  { name: "Varrock Teleport", x: 3213, y: 3424, f2p: true, cast: 4, note: "25 Magic", icon: "✨" },
  { name: "Lumbridge Teleport", x: 3222, y: 3218, f2p: true, cast: 4, note: "31 Magic", icon: "✨" },
  { name: "Falador Teleport", x: 2965, y: 3379, f2p: true, cast: 4, note: "37 Magic", icon: "✨" },
  { name: "Camelot Teleport", x: 2757, y: 3477, f2p: false, cast: 4, note: "45 Magic", icon: "✨" },
  { name: "Ardougne Teleport", x: 2661, y: 3300, f2p: false, cast: 4, note: "51 Magic", icon: "✨" },
  { name: "Watchtower (Yanille)", x: 2544, y: 3095, f2p: false, cast: 4, note: "58 Magic", icon: "✨" },
  { name: "Trollheim Teleport", x: 2890, y: 3678, f2p: false, cast: 4, note: "61 Magic", icon: "✨" },
  { name: "Kourend Castle Teleport", x: 1643, y: 3673, f2p: false, cast: 4, note: "69 Magic", icon: "✨" },
  { name: "Civitas illa Fortis Tele.", x: 1681, y: 3133, f2p: false, cast: 4, note: "54 Magic", icon: "✨" },
  { name: "Glory: Edgeville", x: 3087, y: 3496, f2p: false, cast: 3, note: "Amulet of glory", icon: "💎" },
  { name: "Glory: Al Kharid", x: 3293, y: 3163, f2p: false, cast: 3, note: "Amulet of glory", icon: "💎" },
  { name: "Glory: Draynor", x: 3105, y: 3251, f2p: false, cast: 3, note: "Amulet of glory", icon: "💎" },
  { name: "Glory: Karamja", x: 2918, y: 3176, f2p: false, cast: 3, note: "Amulet of glory", icon: "💎" },
  { name: "Dueling: Ferox Enclave", x: 3150, y: 3635, f2p: false, cast: 3, note: "Ring of dueling", icon: "💍" },
  { name: "Dueling: Castle Wars", x: 2440, y: 3089, f2p: false, cast: 3, note: "Ring of dueling", icon: "💍" },
  { name: "Games: Burthorpe", x: 2898, y: 3546, f2p: false, cast: 3, note: "Games necklace", icon: "📿" },
  { name: "Games: Barbarian Outpost", x: 2519, y: 3571, f2p: false, cast: 3, note: "Games necklace", icon: "📿" },
];

// Approximate F2P areas as [x1, y1, x2, y2] rectangles (members areas get dimmed)
export const F2P_RECTS: [number, number, number, number][] = [
  [2920, 3000, 3400, 3560], // mainland: Falador–Varrock–Lumbridge–Al Kharid
  [2941, 3560, 3392, 3968], // F2P Wilderness
  [2872, 3130, 2919, 3202], // Musa Point (Karamja)
  [2805, 3220, 2875, 3320], // Crandor
  [2506, 2940, 2615, 3065], // Corsair Cove
];

export type RouteOption = {
  icon: string;
  name: string;
  sec: number;
  detail: string;
  f2p: boolean;
};

export function chebyshev(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(
    Math.abs(Math.round(a.x) - Math.round(b.x)),
    Math.abs(Math.round(a.y) - Math.round(b.y))
  );
}

export function runSecs(tiles: number): number {
  return Math.ceil(tiles / 2) * 0.6;
}

export function fmtSec(s: number): string {
  const r = Math.round(s);
  if (r < 90) return `${r}s`;
  return `${Math.floor(r / 60)}m ${r % 60}s`;
}

// Best travel options from a to b, sorted by estimated time
export function buildRouteOptions(
  a: { x: number; y: number },
  b: { x: number; y: number },
  f2pOnly: boolean
): RouteOption[] {
  const direct = chebyshev(a, b);
  const opts: RouteOption[] = [
    {
      icon: "🏃",
      name: "Run from your position",
      sec: runSecs(direct),
      detail: `${direct} tiles`,
      f2p: true,
    },
  ];
  TELEPORTS.filter((t) => !f2pOnly || t.f2p).forEach((t) => {
    const d = chebyshev(t, b);
    opts.push({
      icon: t.icon,
      name: t.name,
      sec: t.cast + runSecs(d),
      detail: `${t.note} → run ${d} tiles`,
      f2p: t.f2p,
    });
  });
  opts.sort((x, y) => x.sec - y.sec);
  return opts.slice(0, 5);
}

// Load Leaflet once from CDN
let leafletPromise: Promise<any> | null = null;
export function loadLeaflet(): Promise<any> {
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href =
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    s.onload = () => resolve((window as any).L);
    s.onerror = () => reject(new Error("Failed to load Leaflet"));
    document.head.appendChild(s);
  });
  return leafletPromise;
}
