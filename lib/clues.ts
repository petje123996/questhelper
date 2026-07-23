import { API, cleanText, fetchJson } from "./format";
import { buildLookup, extractCoords, fetchPageHtml } from "./quest";
import type { Coords, Lookup } from "./quest";

// Wiki page titles for clue solutions move around / aren't 100% certain
// from memory, so each type lists candidate titles to try in order.
export type ClueType = { id: string; label: string; pages: string[]; searchTerm: string; icon: string };

export const CLUE_TYPES: ClueType[] = [
  {
    id: "anagram",
    label: "Anagram",
    pages: ["Treasure Trails/Guide/Anagrams", "Anagram clues", "Anagram clue"],
    searchTerm: "anagram clues",
    icon: "🔤",
  },
  {
    id: "cryptic",
    label: "Cryptic",
    pages: ["Treasure Trails/Guide/Cryptic clues", "Cryptic clues", "Cryptic clue"],
    searchTerm: "cryptic clues",
    icon: "📜",
  },
];

export type ClueEntry = {
  clue: string;
  solution: string;
  coords: Coords | null;
};

// Anagram and cryptic clue lists share a similar wikitable layout: a "clue
// text" column and a "solution/location" column, sometimes with an
// embedded "Show on map" link. We read the header row to find the right
// columns instead of assuming a fixed layout, and fall back to the longest
// remaining cell for the solution if no column looks like one.
export function parseClueTable(html: string): ClueEntry[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  root
    .querySelectorAll(".navbox, .references, #toc, .toc, .mw-editsection, sup, style, script")
    .forEach((el) => el.remove());

  const entries: ClueEntry[] = [];

  root.querySelectorAll("table").forEach((table) => {
    const headerCells = Array.from(table.querySelectorAll("tr:first-child th")).map((th) =>
      cleanText(th.textContent || "").toLowerCase()
    );
    if (!headerCells.length) return;
    const clueIdx = headerCells.findIndex(
      (h) => h.includes("clue") || h.includes("anagram") || h.includes("text") || h.includes("puzzle")
    );
    if (clueIdx === -1) return;
    const solIdx = headerCells.findIndex(
      (h) => h.includes("solution") || h.includes("location") || h.includes("answer") || h.includes("challenge")
    );

    Array.from(table.querySelectorAll("tr"))
      .slice(1)
      .forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td"));
        if (cells.length <= clueIdx) return;
        const clue = cleanText(cells[clueIdx]?.textContent || "");
        if (!clue) return;

        let solution = "";
        if (solIdx >= 0 && cells[solIdx]) {
          solution = cleanText(cells[solIdx].textContent || "");
        }
        if (!solution) {
          cells.forEach((td, i) => {
            if (i === clueIdx) return;
            const t = cleanText(td.textContent || "");
            if (t.length > solution.length) solution = t;
          });
        }

        let coords: Coords | null = null;
        cells.forEach((td) => {
          if (coords) return;
          coords = extractCoords(td.outerHTML || "");
        });

        if (solution) entries.push({ clue, solution, coords });
      });
  });

  return entries;
}

export type ClueLocation = { x: number; y: number; plane?: number; mapId?: number; title: string };

// Anagram (and some cryptic) solutions are an instruction like "Talk to
// Hans." rather than a table cell with an embedded map link, so there's no
// coordinate to read directly. Best-effort: strip the instruction down to
// a likely NPC/location name and look up that page's own embedded map
// coordinates, same as NPC/location lookups elsewhere in the app.
function guessTitles(solution: string): string[] {
  const stripped = solution
    .replace(/^(talk to|speak to|search|dig near|dig at|ask|pickpocket)\s+/i, "")
    .trim();
  const cut = stripped
    .split(/[,.(]| who | near | in | at | found | west of| east of| north of| south of/i)[0]
    .trim();
  return Array.from(new Set([cut, stripped, solution].filter(Boolean)));
}

export async function locateClueSolution(solution: string): Promise<ClueLocation | null> {
  for (const title of guessTitles(solution)) {
    const html = await fetchPageHtml(title);
    if (!html) continue;
    const coords = extractCoords(html);
    if (coords) return { ...coords, title };
  }
  return null;
}

// Images (and coordinates, if any) for whoever/whatever a clue solution
// points at — e.g. an NPC that only roams an area shows its wiki
// infobox's area map here instead of a single pinpoint.
export async function lookupClueSolution(solution: string): Promise<Lookup | null> {
  for (const title of guessTitles(solution)) {
    const html = await fetchPageHtml(title);
    if (html) return buildLookup(title, title, html);
  }
  return null;
}

async function tryPage(page: string): Promise<ClueEntry[] | null> {
  try {
    const data = await fetchJson(
      `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(page)}`
    );
    if (data.error) return null;
    const parsed = parseClueTable(data.parse.text["*"]);
    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

// Try each known candidate title for this clue type, then fall back to a
// wiki search so a wrong guess at the exact page title doesn't break it.
export async function fetchClueTable(type: ClueType): Promise<ClueEntry[]> {
  for (const page of type.pages) {
    const found = await tryPage(page);
    if (found) return found;
  }
  try {
    const search = await fetchJson(
      `${API}?action=opensearch&format=json&origin=*&limit=5&search=${encodeURIComponent(type.searchTerm)}`
    );
    const candidates: string[] = search[1] || [];
    for (const page of candidates) {
      if (type.pages.includes(page)) continue;
      const found = await tryPage(page);
      if (found) return found;
    }
  } catch {
    /* give up gracefully below */
  }
  return [];
}
