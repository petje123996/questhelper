import type { SkillReq } from "./quest";
import { fetchPageHtml, matchQuestName, parseGuide } from "./quest";
import { normalizeSkill } from "./format";

export type QuestChainNode = {
  name: string;
  skillReqs: SkillReq[];
  questReqs: string[]; // names of prerequisite quests, resolved against allQuests
  found: boolean; // false if the wiki page couldn't be fetched
};

export type QuestChainResult = {
  order: string[]; // prerequisites first, target quest last
  nodes: Record<string, QuestChainNode>;
  skillTotals: Record<string, number>; // highest level required for each skill, across the whole chain
};

// Safety cap on how many quest pages a single chain will fetch — some
// quests (Dragon Slayer II, Monkey Madness II, Song of the Elves) have
// deep prerequisite trees, but nothing in the game comes close to this.
const MAX_QUESTS = 80;

// Walks a quest's requirement chain by recursively following "Completion
// of X" style requirement lines (matched against the known quest list),
// fetching each prerequisite's own page in turn — the same wiki page
// already used for the quest wizard, just followed backwards. Fetches
// sequentially rather than in parallel so a prerequisite shared by
// multiple quests in the chain (a common case near the start of the
// tree) is only ever fetched once.
export async function fetchQuestChain(
  target: string,
  allQuests: string[],
  onProgress?: (checked: number) => void
): Promise<QuestChainResult> {
  const nodes: Record<string, QuestChainNode> = {};
  const skillTotals: Record<string, number> = {};

  const visit = async (name: string): Promise<void> => {
    if (nodes[name] || Object.keys(nodes).length >= MAX_QUESTS) return;
    const html = await fetchPageHtml(name);
    if (!html) {
      nodes[name] = { name, skillReqs: [], questReqs: [], found: false };
      onProgress?.(Object.keys(nodes).length);
      return;
    }
    const { meta } = parseGuide(html);
    const questReqs = Array.from(
      new Set(
        meta.otherReqs
          .map((r) => matchQuestName(r, allQuests))
          .filter((n): n is string => !!n && n !== name)
      )
    );
    nodes[name] = { name, skillReqs: meta.skillReqs, questReqs, found: true };
    meta.skillReqs.forEach((sr) => {
      const skill = normalizeSkill(sr.skill);
      skillTotals[skill] = Math.max(skillTotals[skill] || 0, sr.level);
    });
    onProgress?.(Object.keys(nodes).length);
    for (const q of questReqs) {
      await visit(q);
    }
  };

  await visit(target);

  // Topological sort (prerequisites before dependents) via DFS post-order.
  // The `stack` cycle guard is a safety net only — the wiki's own
  // requirement lists shouldn't reference each other circularly.
  const order: string[] = [];
  const seen = new Set<string>();
  const stack = new Set<string>();
  const dfs = (name: string) => {
    if (seen.has(name) || stack.has(name)) return;
    stack.add(name);
    (nodes[name]?.questReqs || []).forEach(dfs);
    stack.delete(name);
    seen.add(name);
    order.push(name);
  };
  dfs(target);

  return { order, nodes, skillTotals };
}
