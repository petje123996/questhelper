import { SKILL_ITEMS } from "./skillDatabase";

export type TrainingMethod = {
  name: string;
  page: string | null; // wiki page for the item itself, for the picture/location lookup
  levelReq: number;
  xp: number; // XP per action, not per hour — see fetchTrainingMethods.
  membersOnly: boolean | null; // null = not catalogued yet
};

export type TrainingResult = {
  methods: TrainingMethod[];
  guidePage: string | null; // the skill's own wiki page, for a "learn more" link
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

// Reads from the hand-verified database in lib/skillDatabase.ts — no
// network fetch involved, so this is synchronous and instant. A skill
// with no entry there yet just comes back with source: "none"; it isn't
// an error, the database simply hasn't been filled in for it.
export function fetchTrainingMethods(skill: string): TrainingResult {
  const entries = SKILL_ITEMS[skill];
  const guidePage = SKILL_LABELS[skill] ?? null;
  if (!entries || !entries.length) {
    return { methods: [], guidePage, source: "none" };
  }
  const methods: TrainingMethod[] = entries.map((e) => ({
    name: e.name,
    page: e.name,
    levelReq: e.level,
    xp: e.xp,
    membersOnly: e.membersOnly,
  }));
  return { methods, guidePage, source: "table" };
}
