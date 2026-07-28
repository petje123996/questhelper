// Hand-verified skill training data — pasted directly from the live wiki
// by a user cross-checking each table, not auto-scraped. The wiki's own
// per-skill page layouts turned out too inconsistent to parse reliably:
// different column headers per skill ("Item" for Mining, "Rune" for
// Runecraft, ...), and unrelated tables on the same page (Pickaxes on
// Mining's, Pouches on Runecraft's) getting swept in alongside the real
// training-item table since they also happen to have a Level column.
//
// membersOnly is left null (unknown) wherever it wasn't verified rather
// than guessed — an unverified guess here would be worse than admitting
// we don't know, since the whole point of this file is to be trustworthy
// where the live scrape wasn't. Only Runecraft's F2P/members rune split
// is filled in, since that's long-standing, extremely stable game
// knowledge (the six basic runes — Air/Mind/Water/Earth/Fire/Body — have
// been Free-to-play since the game's earliest years).
//
// Only skills with an entry here are shown by the Skill Adviser — see
// lib/skillTraining.ts. Add more by pasting a skill's wiki table.

export type SkillItemEntry = {
  name: string;
  level: number;
  xp: number;
  membersOnly: boolean | null;
};

export const SKILL_ITEMS: Partial<Record<string, SkillItemEntry[]>> = {
  mining: [
    { name: "Clay", level: 1, xp: 5, membersOnly: null },
    { name: "Rune essence", level: 1, xp: 5, membersOnly: null },
    { name: "Copper", level: 1, xp: 17.5, membersOnly: null },
    { name: "Tin", level: 1, xp: 17.5, membersOnly: null },
    { name: "Limestone", level: 10, xp: 26.5, membersOnly: null },
    { name: "Stardust", level: 10, xp: 32, membersOnly: null },
    { name: "Blurite", level: 10, xp: 17.5, membersOnly: null },
    { name: "Barronite", level: 14, xp: 16, membersOnly: null },
    { name: "Iron", level: 15, xp: 35, membersOnly: null },
    { name: "Daeyalt", level: 20, xp: 17.5, membersOnly: null },
    { name: "Silver", level: 20, xp: 40, membersOnly: null },
    { name: "Volcanic ash", level: 22, xp: 10, membersOnly: null },
    { name: "Lead", level: 25, xp: 40.5, membersOnly: null },
    { name: "Pure essence", level: 30, xp: 5, membersOnly: null },
    { name: "Coal", level: 30, xp: 50, membersOnly: null },
    { name: "Pay-dirt", level: 30, xp: 60, membersOnly: null },
    { name: "Sandstone", level: 35, xp: 30, membersOnly: null },
    { name: "Dense essence block", level: 38, xp: 12, membersOnly: null },
    { name: "Gem rocks", level: 40, xp: 65, membersOnly: null },
    { name: "Gold", level: 40, xp: 65, membersOnly: null },
    { name: "Calcified rocks", level: 41, xp: 33, membersOnly: null },
    { name: "Volcanic sulphur", level: 42, xp: 25, membersOnly: null },
    { name: "Blasted ore", level: 43, xp: 20, membersOnly: null },
    { name: "Granite", level: 45, xp: 50, membersOnly: null },
    { name: "Rubium splinters", level: 48, xp: 30, membersOnly: null },
    { name: "Mithril", level: 55, xp: 80, membersOnly: null },
    { name: "Lunar", level: 60, xp: 0, membersOnly: null },
    { name: "Daeyalt shard", level: 60, xp: 5, membersOnly: null },
    { name: "Lovakite", level: 65, xp: 60, membersOnly: null },
    { name: "Rubium geode", level: 68, xp: 10, membersOnly: null },
    { name: "Adamantite", level: 70, xp: 95, membersOnly: null },
    { name: "Soft clay", level: 70, xp: 5, membersOnly: null },
    { name: "Salts", level: 72, xp: 5, membersOnly: null },
    { name: "Nickel ore", level: 74, xp: 80.5, membersOnly: null },
    { name: "Ancient essence", level: 75, xp: 13.5, membersOnly: null },
    { name: "Infernal shale", level: 78, xp: 10, membersOnly: null },
    { name: "Runite", level: 85, xp: 125, membersOnly: null },
    { name: "Amethyst", level: 92, xp: 240, membersOnly: null },
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
