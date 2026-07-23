import { API, cleanText, fetchJson } from "./format";

const GUIDES: { members: boolean; pages: string[]; searchTerm: string }[] = [
  {
    members: false,
    pages: ["Free-to-play combat training", "Money making guide/Free-to-play combat training"],
    searchTerm: "free-to-play combat training",
  },
  {
    members: true,
    pages: ["Pay-to-play combat training", "Combat training"],
    searchTerm: "pay-to-play combat training",
  },
];

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

// Try each known candidate title for the F2P/members guide, then fall
// back to a wiki search so a wrong guess at the exact page title doesn't
// break it (same pattern used for the clue solver's page lookups).
export async function fetchTrainingCandidates(members: boolean): Promise<string[]> {
  const guide = GUIDES.find((g) => g.members === members)!;
  for (const page of guide.pages) {
    const found = await tryPageLinks(page);
    if (found) return found;
  }
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
