import { cleanText } from "./format";
import { extractCoords } from "./quest";
import type { Coords } from "./quest";

export type ClueType = { id: string; label: string; page: string; icon: string };

export const CLUE_TYPES: ClueType[] = [
  { id: "anagram", label: "Anagram", page: "Anagram clues", icon: "🔤" },
  { id: "cryptic", label: "Cryptic", page: "Cryptic clues", icon: "📜" },
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
