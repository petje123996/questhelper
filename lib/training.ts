import { API, cleanText, fetchJson } from "./format";

export type TrainingEntry = {
  levelText: string;
  minLevel: number;
  monster: string;
  detail: string;
};

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

function firstNumber(s: string): number {
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : 1;
}

// Combat-training guide pages list recommended monsters either as one
// table with a level-range column, or as level-range section headers
// each followed by its own table — support both layouts since we can't
// verify which one is live without wiki access from this environment.
export function parseTrainingGuide(html: string): TrainingEntry[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  root
    .querySelectorAll(".navbox, .references, #toc, .toc, .mw-editsection, sup, style, script")
    .forEach((el) => el.remove());

  const entries: TrainingEntry[] = [];
  let sectionLevel: string | null = null;

  const handleTable = (table: Element) => {
    const headerCells = Array.from(table.querySelectorAll("tr:first-child th")).map((th) =>
      cleanText(th.textContent || "").toLowerCase()
    );
    const levelIdx = headerCells.findIndex((h) => h.includes("level") || h.includes("combat"));
    const monsterIdx = headerCells.findIndex(
      (h) => h.includes("monster") || h.includes("creature") || h.includes("enemy")
    );

    Array.from(table.querySelectorAll("tr"))
      .slice(headerCells.length ? 1 : 0)
      .forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td"));
        if (!cells.length) return;

        let levelText = sectionLevel || "";
        let monster = "";
        const rest: string[] = [];

        cells.forEach((td, i) => {
          const t = cleanText(td.textContent || "");
          if (!t) return;
          if (i === levelIdx) levelText = t;
          else if (i === monsterIdx) monster = t;
          else rest.push(t);
        });

        if (!monster) {
          // No monster column identified by header: assume the first
          // non-level cell is the monster name.
          const fallback = cells.find((_, i) => i !== levelIdx);
          if (fallback) monster = cleanText(fallback.textContent || "");
        }
        if (!levelText && rest.length && /^\d/.test(rest[0])) {
          levelText = rest.shift() || "";
        }
        if (!monster || monster.length > 60) return;

        entries.push({
          levelText: levelText || "Any",
          minLevel: firstNumber(levelText || "1"),
          monster,
          detail: rest.join(" · "),
        });
      });
  };

  Array.from(root.querySelectorAll("h2, h3, h4, table")).forEach((el) => {
    if (el.tagName === "TABLE") {
      handleTable(el);
      return;
    }
    const title = cleanText(el.textContent || "");
    if (/level/i.test(title) || /^\d/.test(title)) sectionLevel = title;
  });

  return entries.sort((a, b) => a.minLevel - b.minLevel);
}

async function tryPage(page: string): Promise<TrainingEntry[] | null> {
  try {
    const data = await fetchJson(
      `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(page)}`
    );
    if (data.error) return null;
    const parsed = parseTrainingGuide(data.parse.text["*"]);
    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

// Try each known candidate title for the F2P/members guide, then fall
// back to a wiki search so a wrong guess at the exact page title doesn't
// break it (same pattern used for the clue solver's page lookups).
export async function fetchTrainingGuide(members: boolean): Promise<TrainingEntry[]> {
  const guide = GUIDES.find((g) => g.members === members)!;
  for (const page of guide.pages) {
    const found = await tryPage(page);
    if (found) return found;
  }
  try {
    const search = await fetchJson(
      `${API}?action=opensearch&format=json&origin=*&limit=5&search=${encodeURIComponent(guide.searchTerm)}`
    );
    const candidates: string[] = search[1] || [];
    for (const page of candidates) {
      if (guide.pages.includes(page)) continue;
      const found = await tryPage(page);
      if (found) return found;
    }
  } catch {
    /* give up gracefully below */
  }
  return [];
}
