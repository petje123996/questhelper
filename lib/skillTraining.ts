import { cleanText } from "./format";
import { fetchPageHtml } from "./quest";

export type TrainingMethod = {
  name: string;
  page: string | null; // wiki page for the method itself, if it links to one
  levelReq: number; // -1 = unknown (no level column, or a heading-only guide with no table at all)
  xpPerHour: number; // -1 = unknown, same as above
  membersOnly: boolean | null; // null = couldn't tell from this row
};

export type TrainingResult = {
  methods: TrainingMethod[];
  page: string | null; // which candidate title actually resolved
  // "table": levelReq/xpPerHour are real numbers, safe to rank/filter by.
  // "headings": the guide is prose with method sub-headings and no data
  // table (e.g. Free-to-play Cooking training) — names/links only, in the
  // order the guide presents them, no level/XP figures to rank by.
  // "none": the page didn't resolve, or nothing recognisable was found.
  source: "table" | "headings" | "none";
};

// Display label matching the wiki's own capitalisation in guide titles.
// Attack/Strength/Defence/Hitpoints/Ranged/Magic aren't here — those are
// trained by fighting monsters, already covered by the Combat Adviser.
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

// The wiki's "List of guides" page splits most skill guides by game mode
// instead of having one page per skill — "Free-to-play X training" /
// "Pay-to-play X training" (there's also an "Ironman X training" variant
// we don't use here). A members-only skill (Agility, Construction,
// Farming, Fletching, Herblore, Hunter, ...) simply has no Free-to-play
// page, so that candidate 404s and the plain "<Skill> training" fallback
// — used by a handful of skills with no mode split — is tried next.
function candidateTitles(skill: string, members: boolean): string[] {
  const label = SKILL_LABELS[skill];
  if (!label) return [];
  const modeTitle = members ? `Pay-to-play ${label} training` : `Free-to-play ${label} training`;
  return [modeTitle, `${label} training`];
}

// Same idea as firstNumber in lib/bestiary.ts, but comma-aware — XP/hr
// figures on these pages are written as full numbers ("40,000"), and a
// plain \d+ match would only catch the "40" before the comma breaks it.
function firstNumberLoose(s: string): number {
  const m = s.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Math.round(parseFloat(m[0])) : -1;
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

// Parses every sortable "Training methods"-style table on a skill guide
// page. Not every guide has one at all (see parseTrainingHeadings below
// for the prose-only fallback) — some skills split methods across
// several tables by level range, others use one big table, wording for
// the rate column varies a lot, so this leans on tolerant keyword
// matching rather than a fixed layout.
function parseTrainingTables(root: Element): TrainingMethod[] {
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
    const nameIdx = labels.findIndex(
      (h) => h.includes("method") || h.includes("activity") || h.includes("action") || h.includes("training")
    );
    if (levelIdx === -1 || nameIdx === -1) return; // not a training-methods table

    const rateIdx = labels.findIndex((h) => h.includes("xp") || h.includes("experience") || h.includes("rate"));
    const membersIdx = labels.findIndex((h) => h.includes("member") || h.includes("f2p"));

    Array.from(table.querySelectorAll("tr"))
      .slice(1)
      .forEach((tr) => {
        const cells: Element[] = [];
        Array.from(tr.children).forEach((cell) => {
          if (cell.tagName !== "TH" && cell.tagName !== "TD") return;
          const span = Math.max(1, parseInt(cell.getAttribute("colspan") || "1", 10) || 1);
          for (let i = 0; i < span; i++) cells.push(cell);
        });
        if (cells.length <= Math.max(levelIdx, nameIdx)) return;

        const nameCell = cells[nameIdx];
        const anchor = nameCell.querySelector("a");
        const name = anchor ? cleanText(anchor.textContent || "") : cleanText(nameCell.textContent || "");
        if (!name || name.length < 2) return;

        const levelReq = firstNumberLoose(cleanText(cells[levelIdx]?.textContent || ""));
        const xpPerHour = rateIdx >= 0 ? firstNumberLoose(cleanText(cells[rateIdx]?.textContent || "")) : -1;

        let membersOnly: boolean | null = null;
        if (membersIdx >= 0 && cells[membersIdx]) {
          const cell = cells[membersIdx];
          const label = headerLabel(cell) || cleanText(cell.textContent || "").toLowerCase();
          if (/f2p|free|non.?member/.test(label)) membersOnly = false;
          else if (/\bmember|p2p|paid/.test(label)) membersOnly = true;
          else if (cell.querySelector("img, svg")) membersOnly = true;
        }

        methods.push({ name, page: pageFromHref(anchor?.getAttribute("href")), levelReq, xpPerHour, membersOnly });
      });
  });

  // A method can appear on more than one bracket table on longer guides
  // (e.g. listed again once a faster variant unlocks) — keep whichever
  // row actually carries an XP/hr figure.
  const byName = new Map<string, TrainingMethod>();
  methods.forEach((m) => {
    const existing = byName.get(m.name);
    if (!existing || m.xpPerHour > existing.xpPerHour) byName.set(m.name, m);
  });
  return Array.from(byName.values());
}

// Fallback for guides written as prose with method sub-headings instead
// of a data table (e.g. Free-to-play Cooking training's "Training
// methods" section: "Training alongside Fishing", "Cooking with a range",
// etc, each followed by a paragraph rather than a table row). There's no
// reliable level/XP figure to pull out of free text, so these come back
// with levelReq/xpPerHour left at -1 — just names, in the order the guide
// presents them (roughly low-to-high level, since that's how these
// guides are conventionally written), and a link where the heading
// itself is one.
function parseTrainingHeadings(root: Element): TrainingMethod[] {
  const methods: TrainingMethod[] = [];
  let inSection = false;
  let current: { name: string; anchor: Element | null } | null = null;

  const flush = () => {
    if (current && current.name) {
      methods.push({
        name: current.name,
        page: pageFromHref(current.anchor?.getAttribute("href")),
        levelReq: -1,
        xpPerHour: -1,
        membersOnly: null,
      });
    }
    current = null;
  };

  const walk = (node: Element) => {
    Array.from(node.children).forEach((child) => {
      const tag = child.tagName;
      if (tag === "H2") {
        if (inSection) flush();
        inSection = /training method/i.test(cleanText(child.textContent || ""));
        return;
      }
      if (!inSection) {
        if (tag === "DIV" || tag === "SECTION") walk(child);
        return;
      }
      if (tag === "H3" || tag === "H4") {
        flush();
        const name = cleanText(child.textContent || "");
        if (name) current = { name, anchor: child.querySelector("a") };
        return;
      }
      if (tag === "DIV" || tag === "SECTION") walk(child);
    });
  };
  walk(root);
  flush();
  return methods;
}

export async function fetchTrainingMethods(skill: string, members: boolean): Promise<TrainingResult> {
  const candidates = candidateTitles(skill, members);
  for (const title of candidates) {
    const html = await fetchPageHtml(title);
    if (!html) continue;

    const doc = new DOMParser().parseFromString(html, "text/html");
    const root = doc.body;
    root
      .querySelectorAll(".navbox, .references, #toc, .toc, .mw-editsection, sup, style, script")
      .forEach((el) => el.remove());

    const tableMethods = parseTrainingTables(root);
    if (tableMethods.length) return { methods: tableMethods, page: title, source: "table" };

    const headingMethods = parseTrainingHeadings(root);
    if (headingMethods.length) return { methods: headingMethods, page: title, source: "headings" };

    // Page exists but neither parser found anything recognisable — still
    // report which page we landed on so the caller can link out to it.
    return { methods: [], page: title, source: "none" };
  }
  return { methods: [], page: null, source: "none" };
}
