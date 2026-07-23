import { API, cleanText, fetchJson } from "./format";

// Combat training isn't one master table — the wiki splits it into a
// separate guide per combat style, discovered the hard way: guessing a
// single "combat training" page instead surfaced these style guides as
// *links* on a hub page, which then got mistaken for monsters themselves.
// Fetch all style guides for the mode and merge whichever ones exist.
const GUIDES: { members: boolean; pages: string[]; searchTerm: string }[] = [
  {
    members: false,
    pages: ["Free-to-play melee training", "Free-to-play ranged training", "Free-to-play magic training"],
    searchTerm: "free-to-play combat training",
  },
  {
    members: true,
    pages: ["Pay-to-play melee training", "Pay-to-play ranged training", "Pay-to-play magic training"],
    searchTerm: "pay-to-play combat training",
  },
];

// Guide/meta pages (and skill pages, commonly linked from within a guide
// like "you'll need 40 Attack") that can slip through as if they were a
// monster, since they can still contain a table with a "Hitpoints"-ish
// row somewhere in their own content.
const SKILL_NAMES = new Set([
  "attack", "strength", "defence", "ranged", "prayer", "magic", "runecraft",
  "hitpoints", "crafting", "mining", "smithing", "fishing", "cooking",
  "firemaking", "woodcutting", "agility", "herblore", "thieving",
  "fletching", "slayer", "farming", "construction", "hunter",
]);

export function isNonMonsterName(name: string): boolean {
  return (
    SKILL_NAMES.has(name.trim().toLowerCase()) ||
    /training|guide|calculator|efficient|money making|slayer task|combat achievements?/i.test(name)
  );
}

// Every monster mentioned in a guide's tables or lists is wiki-linked, so
// harvesting all links (rather than trying to identify a "monster column"
// in each table, which varies between guides) is a much more reliable way
// to find candidate names — it doesn't matter if the surrounding table
// layout doesn't match what we expect, or if some monsters are only
// mentioned in prose/bullet lists instead of a table.
function extractGuideLinks(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  root
    .querySelectorAll(".navbox, .references, #toc, .toc, .mw-editsection, sup, style, script")
    .forEach((el) => el.remove());

  const names: string[] = [];
  const seen = new Set<string>();
  root.querySelectorAll("table a, li a, p a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!href.startsWith("/w/")) return;
    if (a.querySelector("img")) return;
    const page = decodeURIComponent(href.slice(3)).split("#")[0].replace(/_/g, " ");
    if (!page || page.includes(":") || page.includes("/")) return;
    const key = page.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const label = cleanText(a.textContent || "");
    if (label.length < 2) return;
    names.push(page);
  });
  return names;
}

async function tryPageLinks(page: string): Promise<string[] | null> {
  try {
    const data = await fetchJson(
      `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(page)}`
    );
    if (data.error) return null;
    const names = extractGuideLinks(data.parse.text["*"]);
    return names.length > 0 ? names : null;
  } catch {
    return null;
  }
}

// Fetch every known style guide for this mode (melee/ranged/magic) and
// merge whichever ones actually exist, rather than stopping at the first
// hit — they're complementary guides, not alternate titles for the same
// page. Falls back to a wiki search only if none of them resolved at all.
export async function fetchTrainingCandidates(members: boolean): Promise<string[]> {
  const guide = GUIDES.find((g) => g.members === members)!;
  const results = await Promise.all(guide.pages.map((p) => tryPageLinks(p)));
  const merged = Array.from(new Set(results.filter((r): r is string[] => r !== null).flat()));
  if (merged.length) return merged;

  try {
    const search = await fetchJson(
      `${API}?action=opensearch&format=json&origin=*&limit=5&search=${encodeURIComponent(guide.searchTerm)}`
    );
    const candidates: string[] = search[1] || [];
    for (const page of candidates) {
      if (guide.pages.includes(page)) continue;
      const found = await tryPageLinks(page);
      if (found) return found;
    }
  } catch {
    /* give up gracefully below */
  }
  return [];
}
