import type { Player } from "./quest";

export type AccountType = "main" | "ironman" | "hcim";

export type CombatEntry = {
  name: string;
  hitpoints: number;
  defence: number;
  attack: number;
  strength: number;
  maxHit: number;
  combatLevel: number;
  xpPerKill: number;
};

// How much a monster's Attack/Defence/Max hit should count against it
// depends on the player fighting it, not just the monster: a low-Defence
// account (a pure, most extremely) takes real risk from a hard-hitting
// monster, so monster Attack/Max hit should be weighted heavily for them
// — a tanky high-Defence account can shrug the same hits off, so it
// barely matters. Symmetrically, a low-offence account struggles to
// punch through a high-Defence monster (slow kills, more food/time
// spent), so monster Defence should count for more against them than it
// does for a high-offence account that kills anything quickly regardless.
// Hardcore Ironman gets extra weight on Attack/Max hit on top of that,
// since a death is unrecoverable regardless of how tanky the stats look
// on paper. Shared between the Combat Adviser page and the dashboard's
// "best training spot" summary so both always agree.
export function computeCombatWeights(
  player: Player | null,
  accountType: AccountType
): { attackWeight: number; defenceWeight: number } {
  if (!player) return { attackWeight: 1, defenceWeight: 1 };
  const def = player.skills.defence ?? 1;
  const offence = Math.max(
    player.skills.attack ?? 1,
    player.skills.strength ?? 1,
    player.skills.ranged ?? 1,
    player.skills.magic ?? 1
  );
  const defenceRatio = Math.min(1, def / 60);
  const offenceRatio = Math.min(1, offence / 60);
  let attackWeight = 1 + (1 - defenceRatio) * 3; // 1 (tanky) .. 4 (pure)
  const defenceWeight = 1 + (1 - offenceRatio) * 2; // 1 (strong offence) .. 3 (weak offence)
  if (accountType === "hcim") attackWeight *= 1.5; // permadeath: extra caution
  return { attackWeight, defenceWeight };
}

const statOrWorst = (v: number) => (typeof v !== "number" || !Number.isFinite(v) || v < 0 ? 9999 : v);

// Hitpoints (≈ XP/kill) as the PRIMARY factor — the recommendation should
// be "the most HP you can get", not "the safest monster available" — and
// Attack/Max hit/Defence as secondary deductions weighted to the
// player's own stats (see computeCombatWeights). Additive, not a ratio:
// dividing HP by (1 + stats) let a high-stat monster's penalty overwhelm
// a much bigger HP advantage. Monsters with an unknown Attack/Defence/Max
// hit (-1) are scored as worst-case rather than best-case.
const HP_WEIGHT = 10;
export function scoreCombatEntry(
  e: CombatEntry,
  weights: { attackWeight: number; defenceWeight: number }
): number {
  return (
    e.hitpoints * HP_WEIGHT -
    (statOrWorst(e.defence) * weights.defenceWeight +
      statOrWorst(e.attack) * weights.attackWeight +
      statOrWorst(e.maxHit) * weights.attackWeight)
  );
}

// A near-zero-stat monster (e.g. Seagull: 1 HP, ~0 Attack/Defence) can
// win the safety-weighted score purely by having nothing to avoid, even
// though one hit ends the fight and it's worth almost no XP — a one-hit
// joke monster, not a real training target. Drops anything whose
// Hitpoints sits far below the best the pool has to offer, falling back
// to the unfiltered pool if that would leave nothing at all.
export function filterTrainable<T extends { hitpoints: number }>(pool: T[]): T[] {
  if (!pool.length) return pool;
  const maxHp = Math.max(...pool.map((e) => e.hitpoints));
  const hpFloor = Math.max(3, maxHp * 0.15);
  const trainable = pool.filter((e) => e.hitpoints >= hpFloor);
  return trainable.length ? trainable : pool;
}

// Restricts a pool to monsters near the player's own combat level —
// widened well above nominal level (+60) since combat level under-sells
// a low-Defence account's real striking power, but capped modestly below
// (-60) so it doesn't recommend something wildly beneath them either.
export function filterByLevelRange<T extends { combatLevel: number }>(
  pool: T[],
  combatLevel: number
): T[] {
  const levelMin = Math.max(1, combatLevel - 60);
  const levelMax = combatLevel + 20;
  const inRange = pool.filter(
    (e) => e.combatLevel === 0 || (e.combatLevel >= levelMin && e.combatLevel <= levelMax)
  );
  return inRange.length ? inRange : pool;
}

export function rankCombatEntries<T extends CombatEntry>(
  pool: T[],
  weights: { attackWeight: number; defenceWeight: number }
): T[] {
  return [...pool].sort((a, b) => scoreCombatEntry(b, weights) - scoreCombatEntry(a, weights));
}
