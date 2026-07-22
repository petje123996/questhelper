export const API = "https://oldschool.runescape.wiki/api.php";
export const WIKI = "https://oldschool.runescape.wiki";

export function cleanText(s: string): string {
  return s
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

export function normalizeSkill(s: string): string {
  const t = s.toLowerCase().trim();
  return t === "runecrafting" ? "runecraft" : t;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function resolveSrc(raw: string): string {
  if (raw.startsWith("//")) return "https:" + raw;
  if (raw.startsWith("/")) return WIKI + raw;
  return raw;
}

export function wikiUrl(page: string): string {
  return WIKI + "/w/" + encodeURIComponent(page.replace(/ /g, "_"));
}

export async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Wiki returned status " + res.status);
  return res.json();
}
