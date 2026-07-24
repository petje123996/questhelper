import { loadStored } from "./storage";
import { calcCombat } from "./quest";
import type { Player } from "./quest";
import { POPULAR, OPTIMAL_FALLBACK } from "./questLists";
import { loadAllCachedDiaryTasks, parseTaskLevelReq } from "./diary";
import { loadCachedCaTasks } from "./combatAchievements";
import type { CATask } from "./combatAchievements";
import { CA_TIERS } from "./combatAchievements";
import { computeCombatWeights, filterByLevelRange, filterTrainable, rankCombatEntries } from "./combatScore";
import type { CombatEntry } from "./combatScore";

// Everything here is READ-ONLY against caches the respective feature
// pages already write (qh-optimal, qh-questlist2, qh-diary-tasks-*,
// qh-ca-tasks, qh-bestiary-v3-*) — the dashboard never fetches from the
// wiki itself, so a section simply prompts a visit to the full page if
// nothing's cached yet instead of duplicating that page's fetch logic.

export function computeNextQuest(): string | null {
  const cachedOpt = loadStored("qh-optimal");
  const optimal: string[] =
    cachedOpt && Array.isArray(cachedOpt.names) && cachedOpt.names.length > 0
      ? cachedOpt.names
      : OPTIMAL_FALLBACK;

  const cachedList = loadStored("qh-questlist2");
  const allQuests: string[] =
    cachedList && Array.isArray(cachedList.all) && cachedList.all.length > 0 ? cachedList.all : POPULAR;

  const completedRaw = loadStored("qh-completed");
  const completed = new Set<string>(Array.isArray(completedRaw) ? completedRaw : []);

  const questByLower = new Map(allQuests.map((n) => [n.toLowerCase(), n]));
  for (const n of optimal) {
    const real = questByLower.get(n.toLowerCase());
    if (real && !completed.has(real)) return real;
  }
  return null;
}

export type AlmostThereDiaryTask = {
  region: string;
  tier: string;
  task: string;
  skill: string;
  playerLevel: number;
  neededLevel: number;
};

// Diary tasks near completion: a level requirement was found in the task
// text, the player is under it, and the gap is small. Only covers
// regions the user has actually opened at least once (cached by the
// Diaries page) — nothing is fetched here.
export function computeAlmostThereDiaryTasks(
  player: Player | null,
  maxGap = 3
): AlmostThereDiaryTask[] {
  if (!player) return [];
  const doneRaw = loadStored("qh-diary-done");
  const done = new Set<string>(Array.isArray(doneRaw) ? doneRaw : []);
  const results: AlmostThereDiaryTask[] = [];

  loadAllCachedDiaryTasks().forEach(({ region, tiers }) => {
    tiers.forEach((tier) => {
      tier.tasks.forEach((task) => {
        const key = `${region}::${tier.tier}::${task}`;
        if (done.has(key)) return;
        const req = parseTaskLevelReq(task);
        if (!req) return;
        const playerLevel = player.skills[req.skill] ?? 1;
        const gap = req.level - playerLevel;
        if (gap > 0 && gap <= maxGap) {
          results.push({ region, tier: tier.tier, task, skill: req.skill, playerLevel, neededLevel: req.level });
        }
      });
    });
  });

  // Smallest gap (closest to unlocking) first.
  return results.sort((a, b) => (a.neededLevel - a.playerLevel) - (b.neededLevel - b.playerLevel));
}

// Whether the dashboard has any cached diary data to draw from at all —
// used to tell "no regions loaded yet" apart from "loaded, but nothing's
// close".
export function hasCachedDiaryData(): boolean {
  return loadAllCachedDiaryTasks().length > 0;
}

export function computeNextCaTask(): CATask | null {
  const doneRaw = loadStored("qh-ca-done");
  const done = new Set<string>(Array.isArray(doneRaw) ? doneRaw : []);
  const tasks = loadCachedCaTasks();
  if (!tasks) return null;
  const taskKey = (t: CATask) => `${t.tier}::${t.monster}::${t.text}`;
  for (const tier of CA_TIERS) {
    const next = tasks.find((t) => t.tier === tier && !done.has(taskKey(t)));
    if (next) return next;
  }
  return null;
}

export type TrainingSpot = { entry: CombatEntry; members: boolean };

// Mirrors the Combat Adviser's own scoring (lib/combatScore.ts) against
// whichever bracket it has already cached for this player's level —
// defaults to Members mode and a Main account, matching what the
// adviser itself opens with, since neither is persisted between visits.
export function computeBestTrainingSpot(player: Player | null): TrainingSpot | null {
  if (!player) return null;
  const combatLevel = calcCombat(player.skills);
  for (const members of [true, false]) {
    const cacheKey = `qh-bestiary-v3-${members ? "p2p" : "f2p"}-${Math.floor(combatLevel / 10)}`;
    const cached = loadStored(cacheKey);
    if (!cached || !Array.isArray(cached.entries) || !cached.entries.length) continue;
    const weights = computeCombatWeights(player, "main");
    const levelPool = filterByLevelRange(cached.entries as CombatEntry[], combatLevel);
    const trainable = filterTrainable(levelPool);
    const ranked = rankCombatEntries(trainable, weights);
    if (ranked[0]) return { entry: ranked[0], members };
  }
  return null;
}

export type DashboardData = {
  nextQuest: string | null;
  almostThereDiary: AlmostThereDiaryTask[];
  hasDiaryData: boolean;
  nextCaTask: CATask | null;
  trainingSpot: TrainingSpot | null;
};

export function computeDashboard(player: Player | null): DashboardData {
  return {
    nextQuest: computeNextQuest(),
    almostThereDiary: computeAlmostThereDiaryTasks(player),
    hasDiaryData: hasCachedDiaryData(),
    nextCaTask: computeNextCaTask(),
    trainingSpot: computeBestTrainingSpot(player),
  };
}
