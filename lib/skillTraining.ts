import { cleanText } from "./format";
import { fetchPageHtml } from "./quest";

export type TrainingMethod = {
  name: string;
  page: string | null; // wiki page for the item/method itself, if it links to one
  levelReq: number; // -1 = unknown
  xp: number; // -1 = unknown. XP per action, not per hour — see fetchTrainingMethods.
  membersOnly: boolean | null; // null = couldn't tell from this row
};

export type TrainingResult = {
  methods: TrainingMethod[];
  page: string | null; // page the level/XP table was read from, if any
  guidePage: string | null; // the written mode-specific guide, for a "read more" link only
  source: "table" | "none";
};

// Display label matching the wiki's own page titles. Attack/Strength/
// Defence/Hitpoints/Ranged/Magic aren't here — those are trained by
// fighting monsters, already covered by the Combat Adviser.
const SKILL_LABELS: Record<string, string> = {
  prayer: "Prayer",
  runecraft: "Runecraft",
  crafting: "Crafting",
  mining: "Mining",
  smithing: "Smithing",
  fishing: "Fishing",
  cooking: "Cooking",
  firemaking: "Firemaking",
  woodcutting: "Woodcutting",
  agility: "Agility",
  herblore: "Herblore",
  thieving: "Thieving",
  fletching: "Fletching",
  slayer: "Slayer",
  farming: "Farming",
  construction: "Construction",
  hunter: "Hunter",
};

export const TRAINABLE_SKILLS = Object.keys(SKILL_LABELS);

// Same idea as firstNumber in lib/bestiary.ts, but comma-aware — XP
// figures on these pages are written as full numbers ("1,678"), and a
// plain \d+ match would only catch the "1" before the comma breaks it.
function firstNumberLoose(s: string): number {
  const m = s.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Math.round(parseFloat(m[0]) * 10) / 10 : -1;
}

// Column headers are icons on some of these tables (same sortable-table
// convention as the Bestiary), so the readable label can live in a
// title/alt attribute rather than the cell's visible text.
function headerLabel(cell: Element): string {
  const parts: string[] = [cleanText(cell.textContent || "")];
  const title = cell.getAttribute("title");
  if (title) parts.push(title);
  cell.querySelectorAll("[title]").forEach((el) => {
    const t = el.getAttribute("title");
    if (t) parts.push(t);
  });
  cell.querySelectorAll("img[alt]").forEach((img) => {
    const a = img.getAttribute("alt");
    if (a) parts.push(a);
  });
  return parts.join(" ").toLowerCase();
}

function pageFromHref(href: string | null | undefined): string | null {
  if (!href || !href.startsWith("/w/")) return null;
  return decodeURIComponent(href.slice(3)).split("#")[0].replace(/_/g, " ");
}

// Expands a row's cells by colspan so array index lines up with the
// header's expanded column position — same convention as the Bestiary
// parser (a spanned header like "Rune" covering an icon cell + a name
// cell would otherwise put every later column one index off).
function expandedCells(tr: Element): Element[] {
  const cells: Element[] = [];
  Array.from(tr.children).forEach((cell) => {
    if (cell.tagName !== "TH" && cell.tagName !== "TD") return;
    const span = Math.max(1, parseInt(cell.getAttribute("colspan") || "1", 10) || 1);
    for (let i = 0; i < span; i++) cells.push(cell);
  });
  return cells;
}

const PLAIN_NUMBER = /^\d+([.,]\d+)?$/;

// The item-name column's header varies per skill with no reliable
// keyword to match on — confirmed "Item" for Mining's ore table but
// "Rune" for Runecraft's, and other skills will have their own noun
// ("Fish", "Log", "Bar", ...). Guessing from wording doesn't scale, so
// instead this looks at the actual data: whichever column most
// consistently holds link text (an item linking to its own wiki page)
// across the sampled rows is treated as the name column — the same
// signal a human would use to spot it, rather than the header text.
function bestNameColumn(bodyRows: Element[], excludeIdx: Set<number>, colCount: number): number {
  const counts = new Array(colCount).fill(0);
  bodyRows.slice(0, 40).forEach((tr) => {
    expandedCells(tr).forEach((cell, i) => {
      if (excludeIdx.has(i)) return;
      const anchor = cell.querySelector("a");
      const text = anchor ? cleanText(anchor.textContent || "") : "";
      if (text.length >= 2 && !PLAIN_NUMBER.test(text)) counts[i] = (counts[i] || 0) + 1;
    });
  });
  let best = -1;
  let bestCount = 0;
  counts.forEach((c, i) => {
    if (c > bestCount) {
      bestCount = c;
      best = i;
    }
  });
  return best;
}

// Parses a Level+XP reference table — the shape confirmed against
// Mining's "Ore table" (Item / Mining Level / Exp / GE Price / Members)
// and Runecraft's rune table (Level / Rune / Exp / Essence required / GE
// Price / Members?).
function parseLevelXpTables(root: Element): TrainingMethod[] {
  const methods: TrainingMethod[] = [];

  root.querySelectorAll("table").forEach((table) => {
    const headerRow = table.querySelector("tr");
    if (!headerRow) return;
    const headerCells = Array.from(headerRow.querySelectorAll("th"));
    if (headerCells.length < 2) return;
    const labels: string[] = [];
    headerCells.forEach((th) => {
      const span = Math.max(1, parseInt(th.getAttribute("colspan") || "1", 10) || 1);
      const label = headerLabel(th);
      for (let i = 0; i < span; i++) labels.push(label);
    });

    const levelIdx = labels.findIndex((h) => h.includes("level"));
    if (levelIdx === -1) return; // no level column at all — not this kind of table
    const rateIdx = labels.findIndex((h) => h.includes("xp") || h.includes("experience") || h.includes("rate"));
    const membersIdx = labels.findIndex((h) => h.includes("member") || h.includes("f2p"));

    const bodyRows = Array.from(table.querySelectorAll("tr")).slice(1);
    const nameIdx = bestNameColumn(bodyRows, new Set([levelIdx, rateIdx, membersIdx].filter((i) => i >= 0)), labels.length);
    if (nameIdx === -1) return; // no column consistently links to an item's own page

    bodyRows.forEach((tr) => {
      const cells = expandedCells(tr);
      if (cells.length <= Math.max(levelIdx, nameIdx)) return;

      const nameCell = cells[nameIdx];
      const anchor = nameCell.querySelector("a");
      const name = anchor ? cleanText(anchor.textContent || "") : cleanText(nameCell.textContent || "");
      if (!name || name.length < 2) return;

      const levelReq = firstNumberLoose(cleanText(cells[levelIdx]?.textContent || ""));
      const xp = rateIdx >= 0 ? firstNumberLoose(cleanText(cells[rateIdx]?.textContent || "")) : -1;

      let membersOnly: boolean | null = null;
      if (membersIdx >= 0 && cells[membersIdx]) {
        const cell = cells[membersIdx];
        const label = headerLabel(cell) || cleanText(cell.textContent || "").toLowerCase();
        if (/f2p|free|non.?member/.test(label)) membersOnly = false;
        else if (/\bmember|p2p|paid/.test(label)) membersOnly = true;
        else if (cell.querySelector("img, svg")) membersOnly = true;
      }

      methods.push({ name, page: pageFromHref(anchor?.getAttribute("href")), levelReq, xp, membersOnly });
    });
  });

  // The same item can appear in more than one table on a page (e.g. an
  // "Ores" table and a separate "Gems" table) — keep whichever row
  // actually carries an XP figure.
  const byName = new Map<string, TrainingMethod>();
  methods.forEach((m) => {
    const existing = byName.get(m.name);
    if (!existing || m.xp > existing.xp) byName.set(m.name, m);
  });
  return Array.from(byName.values());
}

function stripHtml(html: string): Element {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  root
    .querySelectorAll(".navbox, .references, #toc, .toc, .mw-editsection, sup, style, script")
    .forEach((el) => el.remove());
  return root;
}

// Two separate wiki pages come into play per skill: the skill's own
// overview page (e.g. "Mining") usually has a straightforward Level+XP
// reference table for every trainable item — confirmed against Mining's
// "Ore table" — and is used as the actual data source here. The written,
// mode-specific training guide ("Pay-to-play Mining training" /
// "Free-to-play Mining training") is prose organised under headings that
// differ per skill (confirmed different between Cooking and Mining, with
// no shared section title to key off), too unreliable to parse
// structurally — so it's only surfaced as a "read the full guide" link,
// not a data source.
export async function fetchTrainingMethods(skill: string, members: boolean): Promise<TrainingResult> {
  const label = SKILL_LABELS[skill];
  if (!label) return { methods: [], page: null, guidePage: null, source: "none" };

  const mainHtml = await fetchPageHtml(label);
  const methods = mainHtml ? parseLevelXpTables(stripHtml(mainHtml)) : [];

  const guideCandidates = [members ? `Pay-to-play ${label} training` : `Free-to-play ${label} training`, `${label} training`];
  let guidePage: string | null = null;
  for (const title of guideCandidates) {
    const html = await fetchPageHtml(title);
    if (html) {
      guidePage = title;
      break;
    }
  }

  return {
    methods,
    page: mainHtml ? label : null,
    guidePage,
    source: methods.length ? "table" : "none",
  };
}
