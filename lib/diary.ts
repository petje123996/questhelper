import { cleanText } from "./format";

export const DIARY_REGIONS = [
  "Ardougne", "Desert", "Falador", "Fremennik", "Kandarin", "Karamja",
  "Kourend & Kebos", "Lumbridge & Draynor", "Morytania", "Varrock",
  "Western Provinces", "Wilderness",
];

const TIERS = ["Easy", "Medium", "Hard", "Elite"];

export type DiaryTier = { tier: string; tasks: string[] };

// Achievement diary pages list tasks in tiered sections (Easy/Medium/Hard/
// Elite), each followed by a wikitable. Column layout differs slightly
// between diaries, so per row we take the longest text cell as the task
// description rather than assuming a fixed column index.
export function parseDiaryPage(html: string): DiaryTier[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  root
    .querySelectorAll(".navbox, .references, #toc, .toc, .mw-editsection, sup, style, script")
    .forEach((el) => el.remove());

  const tiers: DiaryTier[] = [];
  let current: DiaryTier | null = null;

  root.querySelectorAll("h2, h3, table").forEach((el) => {
    if (el.tagName === "H2" || el.tagName === "H3") {
      const title = cleanText(el.textContent || "");
      const tier = TIERS.find((t) => title.toLowerCase().startsWith(t.toLowerCase()));
      if (tier) {
        current = { tier, tasks: [] };
        tiers.push(current);
      } else {
        current = null; // left the tasks section (e.g. "Rewards", "Trivia")
      }
      return;
    }
    if (!current) return;
    el.querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll("td"));
      if (cells.length === 0) return;
      let best = "";
      cells.forEach((td) => {
        const t = cleanText(td.textContent || "");
        if (t.length > best.length) best = t;
      });
      if (best && best.length > 3 && !/^\d+$/.test(best)) {
        current!.tasks.push(best);
      }
    });
  });

  return tiers.filter((t) => t.tasks.length > 0);
}
