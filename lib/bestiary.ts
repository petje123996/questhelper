import { API, cleanText, fetchJson } from "./format";

export type BestiaryRow = {
  name: string;
  combatLevel: number;
  hitpoints: number;
  members: boolean | null; // null = no members column found, unknown
};

function firstNumber(s: string): number {
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

// The wiki's Bestiary is a big sortable table listing (almost) every
// monster with Combat level/Hitpoints/etc columns — if it renders as a
// plain table server-side (rather than a client-side JS app with no
// server-rendered fallback), this gives us real stats for many monsters
// in one request instead of one request per candidate.
export function parseBestiary(html: string): BestiaryRow[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  root
    .querySelectorAll(".navbox, .references, #toc, .toc, .mw-editsection, sup, style, script")
    .forEach((el) => el.remove());

  const rows: BestiaryRow[] = [];

  root.querySelectorAll("table").forEach((table) => {
    const headerCells = Array.from(table.querySelectorAll("tr:first-child th")).map((th) =>
      cleanText(th.textContent || "").toLowerCase()
    );
    if (!headerCells.length) return;
    const nameIdx = headerCells.findIndex((h) => h.includes("name"));
    const cbIdx = headerCells.findIndex((h) => h.includes("combat"));
    const hpIdx = headerCells.findIndex((h) => h.includes("hitpoints") || h === "hp");
    const membersIdx = headerCells.findIndex((h) => h.includes("member"));
    if (nameIdx === -1 || hpIdx === -1) return; // not the bestiary table

    Array.from(table.querySelectorAll("tr"))
      .slice(1)
      .forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td"));
        if (cells.length <= Math.max(nameIdx, hpIdx)) return;
        const name = cleanText(cells[nameIdx]?.textContent || "");
        const hitpoints = firstNumber(cleanText(cells[hpIdx]?.textContent || ""));
        if (!name || !hitpoints) return;
        const combatLevel = cbIdx >= 0 ? firstNumber(cleanText(cells[cbIdx]?.textContent || "")) : 0;
        let members: boolean | null = null;
        if (membersIdx >= 0 && cells[membersIdx]) {
          const t = cleanText(cells[membersIdx].textContent || "").toLowerCase();
          if (t) members = /yes|true|✓/.test(t);
        }
        rows.push({ name, combatLevel, hitpoints, members });
      });
  });

  return rows;
}

export async function fetchBestiary(): Promise<BestiaryRow[]> {
  try {
    const data = await fetchJson(
      `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent("Bestiary")}`
    );
    if (data.error) return [];
    return parseBestiary(data.parse.text["*"]);
  } catch {
    return [];
  }
}
