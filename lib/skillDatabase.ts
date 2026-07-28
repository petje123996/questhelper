// Hand-verified skill training data — pasted directly from the live wiki
// by a user cross-checking each table, not auto-scraped. The wiki's own
// per-skill page layouts turned out too inconsistent to parse reliably:
// different column headers per skill ("Item" for Mining, "Rune" for
// Runecraft, ...), and unrelated tables on the same page (Pickaxes on
// Mining's, Pouches on Runecraft's) getting swept in alongside the real
// training-item table since they also happen to have a Level column.
//
// The wiki also has a "<Skill>/Experience table" subpage for at least
// some skills (confirmed for Mining and Crafting) that exhaustively
// lists every XP source for that skill with a proper Members/F2P column
// — the best source found so far when it exists, since the other
// per-skill pages don't reliably carry membership info. It also lists a
// lot of noise not worth including here: one-off creation recipes,
// minigame/quest-locked variants, and duplicate rows for the same real
// action documented from multiple wiki pages (e.g. "Copper ore" and
// "Copper rocks" are the same action) — so it's used to cross-check and
// fill in gaps in an existing entry, not transcribed wholesale.
//
// membersOnly is left null (unknown) only where it truly wasn't
// verified — an unverified guess here would be worse than admitting we
// don't know, since the whole point of this file is to be trustworthy
// where the live scrape wasn't.
//
// Only skills with an entry here are shown by the Skill Adviser — see
// lib/skillTraining.ts. Add more by pasting a skill's wiki table
// (preferably its "/Experience table" page, if it has one).

export type SkillItemEntry = {
  name: string;
  level: number;
  xp: number;
  membersOnly: boolean | null;
};

export const SKILL_ITEMS: Partial<Record<string, SkillItemEntry[]>> = {
  // Level/XP from Mining's "Ore table"; Members/F2P cross-checked against
  // the separate, more exhaustive "Mining/Experience table" page, which
  // also corrected two XP figures the Ore table had wrong: Volcanic
  // sulphur (25 -> 35) and Infernal shale (10 -> 13, its table gives a
  // range starting there). Deliberately excludes one-off creation recipes
  // (e.g. the Infernal pickaxe) and minigame/quest-locked variants (e.g.
  // Zalcano, Gauntlet crystal ore, Volcanic Mine, Corrupted ore in ToA) —
  // not repeatable "go train here" options. Stardust and Blasted ore
  // weren't present on the Experience table, so their Members status is
  // still unverified.
  mining: [
    { name: "Clay", level: 1, xp: 5, membersOnly: false },
    { name: "Rune essence", level: 1, xp: 5, membersOnly: false },
    { name: "Copper", level: 1, xp: 17.5, membersOnly: false },
    { name: "Tin", level: 1, xp: 17.5, membersOnly: false },
    { name: "Limestone", level: 10, xp: 26.5, membersOnly: true },
    { name: "Stardust", level: 10, xp: 32, membersOnly: null },
    { name: "Blurite", level: 10, xp: 17.5, membersOnly: false },
    { name: "Barronite", level: 14, xp: 16, membersOnly: false },
    { name: "Iron", level: 15, xp: 35, membersOnly: false },
    { name: "Daeyalt", level: 20, xp: 17.5, membersOnly: true },
    { name: "Silver", level: 20, xp: 40, membersOnly: false },
    { name: "Volcanic ash", level: 22, xp: 10, membersOnly: true },
    { name: "Lead", level: 25, xp: 40.5, membersOnly: true },
    { name: "Pure essence", level: 30, xp: 5, membersOnly: true },
    { name: "Coal", level: 30, xp: 50, membersOnly: false },
    { name: "Pay-dirt", level: 30, xp: 60, membersOnly: true },
    { name: "Sandstone", level: 35, xp: 30, membersOnly: true },
    { name: "Dense essence block", level: 38, xp: 12, membersOnly: true },
    { name: "Gem rocks", level: 40, xp: 65, membersOnly: true },
    { name: "Gold", level: 40, xp: 65, membersOnly: false },
    { name: "Calcified rocks", level: 41, xp: 33, membersOnly: true },
    { name: "Volcanic sulphur", level: 42, xp: 35, membersOnly: true },
    { name: "Blasted ore", level: 43, xp: 20, membersOnly: null },
    { name: "Granite", level: 45, xp: 50, membersOnly: true },
    { name: "Rubium splinters", level: 48, xp: 30, membersOnly: true },
    { name: "Mithril", level: 55, xp: 80, membersOnly: false },
    { name: "Lunar", level: 60, xp: 0, membersOnly: true },
    { name: "Daeyalt shard", level: 60, xp: 5, membersOnly: true },
    { name: "Lovakite", level: 65, xp: 60, membersOnly: true },
    { name: "Rubium geode", level: 68, xp: 10, membersOnly: true },
    { name: "Adamantite", level: 70, xp: 95, membersOnly: false },
    { name: "Soft clay", level: 70, xp: 5, membersOnly: true },
    { name: "Salts", level: 72, xp: 5, membersOnly: true },
    { name: "Nickel ore", level: 74, xp: 80.5, membersOnly: true },
    { name: "Ancient essence", level: 75, xp: 13.5, membersOnly: true },
    { name: "Infernal shale", level: 78, xp: 13, membersOnly: true },
    { name: "Runite", level: 85, xp: 125, membersOnly: false },
    { name: "Amethyst", level: 92, xp: 240, membersOnly: true },
  ],
  runecraft: [
    { name: "Air rune", level: 1, xp: 5, membersOnly: false },
    { name: "Mind rune", level: 2, xp: 5.5, membersOnly: false },
    { name: "Water rune", level: 5, xp: 6, membersOnly: false },
    { name: "Mist rune", level: 6, xp: 8, membersOnly: true },
    { name: "Earth rune", level: 9, xp: 6.5, membersOnly: false },
    { name: "Dust rune", level: 10, xp: 8.3, membersOnly: true },
    { name: "Mud rune", level: 13, xp: 9.3, membersOnly: true },
    { name: "Fire rune", level: 14, xp: 7, membersOnly: false },
    { name: "Smoke rune", level: 15, xp: 8.5, membersOnly: true },
    { name: "Steam rune", level: 19, xp: 9.3, membersOnly: true },
    { name: "Body rune", level: 20, xp: 7.5, membersOnly: false },
    { name: "Lava rune", level: 23, xp: 10, membersOnly: true },
    { name: "Cosmic rune", level: 27, xp: 8, membersOnly: true },
    { name: "Sunfire rune", level: 33, xp: 9, membersOnly: true },
    { name: "Chaos rune", level: 35, xp: 8.5, membersOnly: true },
    { name: "Astral rune", level: 40, xp: 8.7, membersOnly: true },
    { name: "Nature rune", level: 44, xp: 9, membersOnly: true },
    { name: "Law rune", level: 54, xp: 9.5, membersOnly: true },
    { name: "Death rune", level: 65, xp: 10, membersOnly: true },
    { name: "Blood rune", level: 77, xp: 10.5, membersOnly: true },
    { name: "Blood rune (Kourend)", level: 77, xp: 23.8, membersOnly: true },
    { name: "Soul rune", level: 90, xp: 29.7, membersOnly: true },
    { name: "Aether rune", level: 90, xp: 20, membersOnly: true },
    { name: "Wrath rune", level: 95, xp: 8, membersOnly: true },
  ],
};
