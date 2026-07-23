import { WIKI } from "./format";

// Community-run Grand Exchange price API (same data source RuneLite uses)
export const GE_API = "https://prices.runescape.wiki/api/v1/osrs";

export type ItemMapping = {
  id: number;
  name: string;
  examine: string;
  members: boolean;
  lowalch: number;
  highalch: number;
  limit: number;
  value: number;
  icon: string;
};

export type LatestPrice = {
  high: number | null;
  highTime: number | null;
  low: number | null;
  lowTime: number | null;
};

export type PricePoint = {
  timestamp: number;
  avgHighPrice: number | null;
  avgLowPrice: number | null;
  highPriceVolume: number;
  lowPriceVolume: number;
};

export function itemIconUrl(icon: string): string {
  return `${WIKI}/images/${encodeURIComponent(icon.replace(/ /g, "_"))}`;
}

// Short OSRS-style amounts: 523k, 12.4m, 2.10b
export function fmtGp(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}b`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${abs}`;
}

export function timeAgo(ts: number | null): string {
  if (!ts) return "unknown";
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
