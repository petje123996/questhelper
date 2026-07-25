import { cleanText } from "./format";
import { loadStored, saveStored } from "./storage";

export const CA_TIERS = ["Easy", "Medium", "Hard", "Elite", "Master", "Grandmaster"];

export type CATask = { tier: string; text: string; monster: string };

// Cached for 7 days so the dashboard's "next Combat Achievement" summary
// can read the full task list without a fresh fetch every time.
const CA_TASKS_CACHE_KEY = "qh-ca-tasks";
const CA_TASKS_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

export function cacheCaTasks(tasks: CATask[]): void {
  saveStored(CA_TASKS_CACHE_KEY, { ts: Date.now(), tasks });
}

export function loadCachedCaTasks(): CATask[] | null {
  const cached = loadStored(CA_TASKS_CACHE_KEY);
  if (!cached || !Array.isArray(cached.tasks)) return null;
  if (Date.now() - (cached.ts || 0) > CA_TASKS_CACHE_MS) return null;
  return cached.tasks;
}

// Combat Achievements are listed in one large sortable table with a tier
// column, a monster column and a task/description column. We read the
// header row to find which column is which rather than assuming a fixed
// layout, then skip any table that doesn't look like a task table.
export function parseCombatAchievements(html: string): CATask[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  root
    .querySelectorAll(".navbox, .references, #toc, .toc, .mw-editsection, sup, style, script")
    .forEach((el) => el.remove());

  const tasks: CATask[] = [];

  root.querySelectorAll("table").forEach((table) => {
    const headerCells = Array.from(table.querySelectorAll("tr:first-child th")).map((th) =>
      cleanText(th.textContent || "").toLowerCase()
    );
    if (!headerCells.length) return;
    const tierIdx = headerCells.findIndex((h) => h.includes("tier"));
    const taskIdx = headerCells.findIndex((h) => h.includes("task") || h.includes("name"));
    const monsterIdx = headerCells.findIndex(
      (h) => h.includes("monster") || h.includes("boss") || h.includes("npc")
    );
    if (tierIdx === -1 || taskIdx === -1) return; // not a combat achievements table

    Array.from(table.querySelectorAll("tr"))
      .slice(1)
      .forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td"));
        if (cells.length <= Math.max(tierIdx, taskIdx)) return;
        const tierText = cleanText(cells[tierIdx]?.textContent || "");
        const tier = CA_TIERS.find((t) => tierText.toLowerCase().includes(t.toLowerCase()));
        const text = cleanText(cells[taskIdx]?.textContent || "");
        const monster = monsterIdx >= 0 ? cleanText(cells[monsterIdx]?.textContent || "") : "";
        if (tier && text) tasks.push({ tier, text, monster });
      });
  });

  return tasks;
}
