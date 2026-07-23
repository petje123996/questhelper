"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useCloseOnBack } from "@/hooks/useCloseOnBack";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import {
  C,
  frame,
  goldTitle,
  card,
  bigBtn,
  ghostBtn,
  chip,
  headBtn,
  dashed,
  toolChip,
  toolIcon,
} from "@/lib/theme";
import { loadStored, saveStored, removeStored, removeStoredByPrefix, storageKey } from "@/lib/storage";
import { API, capitalize, fmtNum, fetchJson, normalizeSkill, wikiUrl } from "@/lib/format";
import { calcCombat, enemyLevel, parseGuide, parseGallery, parseRewardStats, extractCoords, fetchLookup } from "@/lib/quest";
import { mapHref } from "@/lib/map";
import type {
  SkillReq,
  Meta,
  Step,
  Item,
  Quest,
  RecentItem,
  Player,
  GalleryImg,
  Lookup,
  QuestReward,
  Progress,
} from "@/lib/quest";

// ─── OSRS Quest Helper ───────────────────────────────────────────
// Flow: quest info & requirements → item checklist → step wizard.
// Quest list styled like the in-game quest tab (red/yellow/green).

const POPULAR = [
  "Cook's Assistant", "The Restless Ghost", "Rune Mysteries", "Sheep Shearer",
  "Imp Catcher", "Romeo & Juliet", "Doric's Quest", "Ernest the Chicken",
  "Vampyre Slayer", "The Knight's Sword", "Dragon Slayer I", "Waterfall Quest",
  "Tree Gnome Village", "Fight Arena", "The Grand Tree", "Priest in Peril",
  "Witch's House", "Monkey Madness I", "Recipe for Disaster",
  "Animal Magnetism", "Lost City", "Desert Treasure I", "Monk's Friend",
  "Plague City", "Dwarf Cannon", "The Dig Site", "Druidic Ritual",
  "Client of Kourend", "X Marks the Spot", "A Porcine of Interest",
];

// Fallback F2P list, used if the wiki category can't be fetched
const F2P_FALLBACK = [
  "Below Ice Mountain", "Black Knights' Fortress", "Cook's Assistant",
  "The Corsair Curse", "Demon Slayer", "Doric's Quest", "Dragon Slayer I",
  "Ernest the Chicken", "Goblin Diplomacy", "Imp Catcher",
  "The Knight's Sword", "Misthalin Mystery", "Pirate's Treasure",
  "Prince Ali Rescue", "The Restless Ghost", "Romeo & Juliet",
  "Rune Mysteries", "Sheep Shearer", "Shield of Arrav", "Vampyre Slayer",
  "Witch's Potion", "X Marks the Spot",
];

const MINI_FALLBACK = [
  "Barbarian Training", "Bear Your Soul", "Daddy's Home", "Enter the Abyss",
  "Family Pest", "Hopespear's Will", "In Search of Knowledge",
  "Lair of Tarn Razorlor", "Skippy and the Mogres", "The Frozen Door",
  "The General's Shadow", "The Mage Arena", "The Mage Arena II",
];

// Render text with … bold markers as real bold text
function renderRich(t: string): React.ReactNode {
  if (!t.includes("")) return t;
  const parts = t.split(/[]/);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <b key={i} style={{ fontWeight: 800 }}>
        {p}
      </b>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

export default function QuestHelper() {
  const router = useRouter();
  const [view, setView] = useState<"home" | "quest">("home");
  const [phase, setPhase] = useState<"info" | "items" | "steps" | "done">("info");
  const [query, setQuery] = useState("");
  const [suggest, setSuggest] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [allQuests, setAllQuests] = useState<string[]>(POPULAR);
  const [optimal, setOptimal] = useState<string[]>([]);
  const [f2p, setF2p] = useState<Set<string>>(new Set(F2P_FALLBACK));
  const [miniSet, setMiniSet] = useState<Set<string>>(new Set(MINI_FALLBACK));
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Progress>({});
  const [fetchingRewards, setFetchingRewards] = useState<Set<string>>(new Set());
  const [lastReward, setLastReward] = useState<QuestReward | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [quest, setQuest] = useState<Quest | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [itemsChecked, setItemsChecked] = useState<Set<number>>(new Set());
  const [openInfo, setOpenInfo] = useState<number | null>(null);
  const [stepInfoOpen, setStepInfoOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [gallery, setGallery] = useState<GalleryImg[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rsn, setRsn] = useState("");
  const [player, setPlayer] = useState<Player | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const debounceRef = useRef<any>(null);

  useCloseOnBack(!!lookup, useCallback(() => setLookup(null), []));
  useCloseOnBack(stepsOpen, useCallback(() => setStepsOpen(false), []));
  useCloseOnBack(galleryOpen, useCallback(() => setGalleryOpen(false), []));
  useLockBodyScroll(!!lookup || stepsOpen || galleryOpen);

  useEffect(() => {
    const r = loadStored("qh-recent");
    if (Array.isArray(r)) {
      const active = r.filter(
        (x: RecentItem) => x && x.total > 0 && x.done < x.total
      );
      setRecent(active);
      if (active.length !== r.length) saveStored("qh-recent", active);
    }

    const comp = loadStored("qh-completed");
    if (Array.isArray(comp)) setCompleted(new Set(comp));

    const prog = loadStored("qh-progress");
    if (prog && typeof prog === "object") setProgress(prog);

    const savedPlayer = loadStored("qh-rsn");
    if (savedPlayer && savedPlayer.name && savedPlayer.skills) {
      setPlayer(savedPlayer);
      setRsn(savedPlayer.name);
    }

    // Optimal Quest Guide order from the wiki (refresh at most weekly)
    const cachedOpt = loadStored("qh-optimal");
    const optFresh =
      cachedOpt &&
      Array.isArray(cachedOpt.names) &&
      cachedOpt.names.length > 0 &&
      Date.now() - (cachedOpt.ts || 0) < 7 * 24 * 60 * 60 * 1000;
    if (cachedOpt && Array.isArray(cachedOpt.names) && cachedOpt.names.length > 0) {
      setOptimal(cachedOpt.names);
    }
    if (!optFresh) {
      (async () => {
        try {
          const data = await fetchJson(
            `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(
              "Optimal quest guide"
            )}`
          );
          if (data.error) return;
          const doc = new DOMParser().parseFromString(
            data.parse.text["*"],
            "text/html"
          );
          const names: string[] = [];
          const seen = new Set<string>();
          // Quest links inside tables/lists, in document order
          doc.querySelectorAll("table a, ul a, ol a").forEach((a) => {
            const href = a.getAttribute("href") || "";
            if (!href.startsWith("/w/")) return;
            const page = decodeURIComponent(href.slice(3))
              .split("#")[0]
              .replace(/_/g, " ");
            if (!page || page.includes(":") || page.includes("/")) return;
            const key = page.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            names.push(page);
          });
          if (names.length > 20) {
            setOptimal(names);
            saveStored("qh-optimal", { ts: Date.now(), names });
          }
        } catch {
          /* no adviser, no problem */
        }
      })();
    }

    // Quest lists from the wiki, grouped like the in-game quest tab
    const cached = loadStored("qh-questlist2");
    if (cached && Array.isArray(cached.all) && cached.all.length > 0) {
      setAllQuests(cached.all);
      if (Array.isArray(cached.f2p)) setF2p(new Set(cached.f2p));
      if (Array.isArray(cached.mini)) setMiniSet(new Set(cached.mini));
      if (Date.now() - (cached.ts || 0) < 7 * 24 * 60 * 60 * 1000) return;
    }
    (async () => {
      const fetchCategory = async (category: string): Promise<string[]> => {
        const names: string[] = [];
        let cont: string | null = null;
        for (let i = 0; i < 3; i++) {
          const url =
            `${API}?action=query&format=json&origin=*&list=categorymembers` +
            `&cmtitle=${encodeURIComponent("Category:" + category)}` +
            `&cmtype=page&cmlimit=500` +
            (cont ? `&cmcontinue=${encodeURIComponent(cont)}` : "");
          const data: any = await fetchJson(url);
          (data.query?.categorymembers || []).forEach((m: any) => {
            const t = String(m.title || "");
            if (
              t &&
              !t.includes("/") &&
              !t.includes(":") &&
              !/^(Quests|Quest points|Quest List|Miniquests)$/i.test(t)
            ) {
              names.push(t);
            }
          });
          cont = data.continue?.cmcontinue || null;
          if (!cont) break;
        }
        return names;
      };
      try {
        const [quests, free, minis] = await Promise.all([
          fetchCategory("Quests"),
          fetchCategory("Free-to-play quests").catch(() => [] as string[]),
          fetchCategory("Miniquests").catch(() => [] as string[]),
        ]);
        if (quests.length > 10) {
          const all = Array.from(new Set([...quests, ...minis])).sort((a, b) =>
            a.localeCompare(b)
          );
          setAllQuests(all);
          if (free.length > 5) setF2p(new Set(free));
          if (minis.length > 0) setMiniSet(new Set(minis));
          saveStored("qh-questlist2", {
            ts: Date.now(),
            all,
            f2p: free.length > 5 ? free : F2P_FALLBACK,
            mini: minis.length > 0 ? minis : MINI_FALLBACK,
          });
        }
      } catch {
        /* fallbacks remain */
      }
    })();
  }, []);

  // Wiki search suggestions + local list
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setSuggest([]);
      return;
    }
    const local = allQuests.filter((n) => n.toLowerCase().includes(q));
    setSuggest(local.slice(0, 8));
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await fetchJson(
          `${API}?action=opensearch&format=json&origin=*&limit=8&search=${encodeURIComponent(
            query.trim()
          )}`
        );
        const names: string[] = (data[1] || []).filter(
          (n: string) => !n.includes("/")
        );
        const merged = Array.from(new Set([...local, ...names])).slice(0, 8);
        setSuggest(merged);
      } catch {
        /* keep the local list */
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query, allQuests]);

  const loadStats = async () => {
    const name = rsn.trim();
    if (!name) return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch(`/api/hiscores?player=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.skills)) {
        throw new Error(data.error || "Player not found");
      }
      const skills: Record<string, number> = {};
      data.skills.forEach((s: any) => {
        if (s && s.name) skills[normalizeSkill(String(s.name))] = Number(s.level) || 1;
      });
      const p: Player = { name, skills };

      const previousName = player?.name;
      if (previousName && previousName.toLowerCase() !== name.toLowerCase()) {
        // Switching to a different character: this device's tracked
        // progress belonged to the old one, so start fresh for the new one.
        setCompleted(new Set());
        setProgress({});
        setRecent([]);
        saveStored("qh-completed", []);
        saveStored("qh-progress", {});
        saveStored("qh-recent", []);
        removeStored("qh-diary-done");
        removeStored("qh-diary-totals");
        removeStored("qh-ca-done");
        removeStoredByPrefix("qh-quest-");
      }

      setPlayer(p);
      saveStored("qh-rsn", p);
    } catch (e: any) {
      setStatsError(e?.message || "Failed to load stats");
    } finally {
      setStatsLoading(false);
    }
  };

  const checkReq = (req: SkillReq): boolean | null => {
    if (!player) return null;
    return (player.skills[normalizeSkill(req.skill)] ?? 1) >= req.level;
  };

  const combatLevel = player ? calcCombat(player.skills) : null;

  // Look up a quest's QP + XP rewards on the wiki (used when a quest is
  // ticked off as already done, without playing through it in the app)
  const fetchQuestReward = async (name: string): Promise<QuestReward | null> => {
    try {
      const data = await fetchJson(
        `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(
          name
        )}`
      );
      if (data.error) return null;
      const { rewards } = parseGuide(data.parse.text["*"]);
      return parseRewardStats(rewards);
    } catch {
      return null;
    }
  };

  const toggleCompleted = (name: string) => {
    const wasCompleted = completed.has(name);
    setCompleted((prev) => {
      const next = new Set(prev);
      if (wasCompleted) next.delete(name);
      else next.add(name);
      saveStored("qh-completed", Array.from(next));
      return next;
    });

    if (wasCompleted) {
      // Unmarking: drop any rewards tracked for this quest
      setProgress((prev) => {
        if (!(name in prev)) return prev;
        const next = { ...prev };
        delete next[name];
        saveStored("qh-progress", next);
        return next;
      });
      return;
    }

    // Marking done: fetch its rewards from the wiki if we don't have them yet
    if (progress[name]) return;
    setFetchingRewards((prev) => new Set(prev).add(name));
    fetchQuestReward(name).then((reward) => {
      setFetchingRewards((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      if (!reward) return;
      setProgress((prev) => {
        const next = { ...prev, [name]: reward };
        saveStored("qh-progress", next);
        return next;
      });
    });
  };

  // Check whether a requirement line is a quest name
  const matchQuest = (req: string): string | null => {
    const r = req.toLowerCase();
    const exact = allQuests.find((n) => n.toLowerCase() === r);
    if (exact) return exact;
    const partial = allQuests.find(
      (n) => n.length >= 8 && r.includes(n.toLowerCase())
    );
    return partial || null;
  };

  const updateRecent = useCallback(
    (name: string, done: number, total: number) => {
      setRecent((prev) => {
        const next = [
          { name, done, total },
          ...prev.filter((r) => r.name !== name),
        ].slice(0, 8);
        saveStored("qh-recent", next);
        return next;
      });
    },
    []
  );

  const removeFromRecent = useCallback((name: string) => {
    setRecent((prev) => {
      const next = prev.filter((r) => r.name !== name);
      saveStored("qh-recent", next);
      return next;
    });
  }, []);

  const deleteRecent = (name: string) => {
    removeFromRecent(name);
    removeStored(storageKey(name));
  };

  const persist = (
    name: string,
    p: string,
    step: number,
    items: Set<number>
  ) => {
    saveStored(storageKey(name), {
      phase: p,
      step,
      items: Array.from(items),
    });
  };

  // Navigate to the world map page for a specific target
  const goToMap = (target: {
    x: number;
    y: number;
    title: string;
    marker: boolean;
    plane?: number;
    mapId?: number;
  }) => {
    router.push(mapHref(target));
  };

  const openQuest = async (name: string) => {
    setLoading(true);
    setError(null);
    setView("quest");
    setQuest(null);
    setOpenInfo(null);
    setStepInfoOpen(false);
    setGallery([]);
    setGalleryOpen(false);
    setLookup(null);
    try {
      let usedMainPage = false;
      let data = await fetchJson(
        `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(
          name + "/Quick guide"
        )}`
      );
      if (data.error) {
        data = await fetchJson(
          `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(
            name
          )}`
        );
        usedMainPage = true;
      }
      if (data.error) throw new Error("Quest not found on the wiki.");
      const html = data.parse.text["*"];
      const parsed = parseGuide(html);
      if (!parsed.steps.length) {
        throw new Error("No steps found on this page.");
      }
      const displayName = String(data.parse.title).replace("/Quick guide", "");
      const q: Quest = { name: displayName, ...parsed };

      const saved = loadStored(storageKey(displayName));
      let p: "info" | "items" | "steps" = "info";
      let step = 0;
      let items = new Set<number>();
      if (saved && saved.phase !== "done") {
        if (saved.phase === "steps") p = "steps";
        else if (saved.phase === "items") p = "items";
        step = Math.min(saved.step || 0, q.steps.length - 1);
        items = new Set<number>(
          (saved.items || []).filter((i: number) => i < q.items.length)
        );
      }

      setQuest(q);
      setPhase(p);
      setStepIdx(step);
      setItemsChecked(items);
      updateRecent(displayName, p === "steps" ? step : 0, q.steps.length);

      // Load gallery (and missing data) from the full guide in the background
      if (usedMainPage) {
        setGallery(parseGallery(html));
      } else {
        (async () => {
          try {
            const d2 = await fetchJson(
              `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(
                displayName
              )}`
            );
            if (!d2.error) {
              const fullHtml = d2.parse.text["*"];
              const g = parseGallery(fullHtml);
              const own = parseGallery(html);
              const seen = new Set(g.map((x) => x.src));
              setGallery([...g, ...own.filter((x) => !seen.has(x.src))]);
              const c = parsed.meta.startCoords ? null : extractCoords(fullHtml);
              const extraRewards = parsed.rewards.length
                ? null
                : parseGuide(fullHtml).rewards;
              if (c || extraRewards) {
                setQuest((prev) => {
                  if (!prev || prev.name !== displayName) return prev;
                  return {
                    ...prev,
                    meta: c ? { ...prev.meta, startCoords: c } : prev.meta,
                    rewards: extraRewards || prev.rewards,
                  };
                });
              }
            }
          } catch {
            /* no gallery, no problem */
          }
        })();
      }
    } catch (e: any) {
      setError(e?.message || "Loading failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch images + coordinates for a wiki page
  const lookupPage = async (page: string, label: string) => {
    setLookup({ title: label, page, loading: true, images: [], coords: null, error: null });
    setLookup(await fetchLookup(page, label));
  };

  const afterInfo = () => {
    if (!quest) return;
    const p = quest.items.length ? "items" : "steps";
    setPhase(p);
    persist(quest.name, p, stepIdx, itemsChecked);
  };

  const toggleItem = (i: number) => {
    if (!quest) return;
    setItemsChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      persist(quest.name, phase, stepIdx, next);
      return next;
    });
  };

  const startSteps = () => {
    if (!quest) return;
    setPhase("steps");
    setStepInfoOpen(false);
    persist(quest.name, "steps", stepIdx, itemsChecked);
    updateRecent(quest.name, stepIdx, quest.steps.length);
  };

  const nextStep = () => {
    if (!quest) return;
    setStepInfoOpen(false);
    if (stepIdx >= quest.steps.length - 1) {
      // Quest complete: record rewards in the profile
      const reward = parseRewardStats(quest.rewards);
      setLastReward(reward);
      setProgress((prev) => {
        const next = { ...prev, [quest.name]: reward };
        saveStored("qh-progress", next);
        return next;
      });
      setCompleted((prev) => {
        const next = new Set(prev);
        next.add(quest.name);
        saveStored("qh-completed", Array.from(next));
        return next;
      });
      setPhase("done");
      removeFromRecent(quest.name);
      removeStored(storageKey(quest.name));
      return;
    }
    const n = stepIdx + 1;
    setStepIdx(n);
    persist(quest.name, "steps", n, itemsChecked);
    updateRecent(quest.name, n, quest.steps.length);
  };

  const jumpToStep = (i: number) => {
    if (!quest) return;
    setStepIdx(i);
    setStepInfoOpen(false);
    setStepsOpen(false);
    persist(quest.name, "steps", i, itemsChecked);
    updateRecent(quest.name, i, quest.steps.length);
  };

  const prevStep = () => {
    if (!quest || stepIdx === 0) return;
    setStepInfoOpen(false);
    const n = stepIdx - 1;
    setStepIdx(n);
    persist(quest.name, "steps", n, itemsChecked);
    updateRecent(quest.name, n, quest.steps.length);
  };

  const total = quest ? quest.steps.length : 0;
  const pct = total ? Math.round((stepIdx / total) * 100) : 0;
  const step = quest && phase === "steps" ? quest.steps[stepIdx] : null;
  const isLast = quest ? stepIdx === total - 1 : false;
  const recentNames = new Set(recent.map((r) => r.name));
  const hasReqs = quest
    ? quest.meta.skillReqs.length > 0 ||
      quest.meta.otherReqs.length > 0 ||
      quest.meta.enemies.length > 0
    : false;

  // Quest points shown in the quest-list header
  const totalQp = Object.values(progress).reduce((s, p) => s + (p.qp || 0), 0);

  // What's next: first quests from the Optimal Quest Guide not yet done
  const questByLower = new Map(allQuests.map((n) => [n.toLowerCase(), n]));
  const upNext = optimal
    .map((n) => questByLower.get(n.toLowerCase()))
    .filter((n): n is string => !!n && !completed.has(n));
  const nextQuest = upNext.length > 0 ? upNext[0] : null;
  const afterThat = upNext.slice(1, 4);

  // Quest list groups, like the in-game quest tab
  const questStatus = (name: string): "done" | "progress" | "new" =>
    completed.has(name) ? "done" : recentNames.has(name) ? "progress" : "new";
  const statusColor = (s: "done" | "progress" | "new") =>
    s === "done" ? C.qGreen : s === "progress" ? C.qYellow : C.qRed;
  const freeQuests = allQuests.filter((n) => f2p.has(n) && !miniSet.has(n));
  const memberQuests = allQuests.filter((n) => !f2p.has(n) && !miniSet.has(n));
  const miniQuests = allQuests.filter((n) => miniSet.has(n));

  const questListGroup = (title: string, names: string[]) =>
    names.length > 0 && (
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: C.goldDim,
            padding: "6px 2px",
          }}
        >
          {title}
        </div>
        <div style={{ ...card, overflow: "hidden" }}>
          {names.map((n, i) => {
            const s = questStatus(n);
            const isDone = s === "done";
            const isFetching = fetchingRewards.has(n);
            return (
              <button
                key={n}
                onClick={() => (editMode ? toggleCompleted(n) : openQuest(n))}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  background: "transparent",
                  color: statusColor(s),
                  border: "none",
                  borderBottom:
                    i < names.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {editMode && (
                  <span
                    style={{
                      flexShrink: 0,
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      background: isDone ? C.qGreen : "transparent",
                      color: isDone ? C.bg : "transparent",
                      border: isDone
                        ? `1px solid ${C.qGreen}`
                        : `2px solid ${C.border}`,
                    }}
                  >
                    {isFetching ? "⏳" : "✓"}
                  </span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>
    );

  // ── Overlay (lookup / step list / gallery) ──
  const overlay = (title: string, onClose: () => void, children: React.ReactNode) => (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.7)",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "82vh",
          overflowY: "auto",
          background: C.bg,
          borderTop: `2px solid ${C.gold}`,
          borderRadius: "16px 16px 0 0",
          padding: "14px 14px 24px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ ...goldTitle, fontSize: 17, fontWeight: 700 }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: C.panelSoft,
              color: C.parch,
              border: `1px solid ${C.border}`,
              fontSize: 14,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );

  // ── Home ──
  if (view === "home") {
    return (
      <div style={frame}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 14px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
            <Nav />
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ ...goldTitle, fontSize: 26, fontWeight: 700 }}>
                ⚔️ Quest Helper
              </div>
              <div style={{ color: C.textDim, fontSize: 13, marginTop: 2 }}>
                OSRS Wiki quick guides, right next to your game
              </div>
            </div>
            <div style={{ width: 34, flexShrink: 0 }} />
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a quest…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "14px 16px",
              fontSize: 16,
              background: C.panelSoft,
              color: C.parch,
              border: `2px solid ${C.border}`,
              borderRadius: 10,
              outline: "none",
            }}
          />

          {suggest.length > 0 && (
            <div style={{ ...card, marginTop: 8, overflow: "hidden" }}>
              {suggest.map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setQuery("");
                    openQuest(n);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "13px 16px",
                    background: "transparent",
                    color: C.parch,
                    border: "none",
                    borderBottom: `1px solid ${C.borderSoft}`,
                    fontSize: 15,
                    cursor: "pointer",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {/* RSN / stats — right under the search bar */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={rsn}
                onChange={(e) => setRsn(e.target.value)}
                placeholder="RuneScape name…"
                maxLength={12}
                style={{
                  flex: 1,
                  minWidth: 0,
                  boxSizing: "border-box",
                  padding: "11px 14px",
                  fontSize: 15,
                  background: C.panelSoft,
                  color: C.parch,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  outline: "none",
                }}
              />
              <button
                onClick={loadStats}
                disabled={statsLoading || !rsn.trim()}
                style={{
                  flexShrink: 0,
                  padding: "11px 16px",
                  fontSize: 14,
                  fontWeight: 700,
                  background: C.gold,
                  color: C.ink,
                  border: "none",
                  borderRadius: 10,
                  cursor: "pointer",
                  opacity: statsLoading || !rsn.trim() ? 0.5 : 1,
                }}
              >
                {statsLoading ? "…" : player ? "Refresh" : "Load"}
              </button>
            </div>
            {player && !statsError && (
              <div style={{ fontSize: 13, color: C.green, marginTop: 6 }}>
                ✓ Stats loaded for {player.name}
                {combatLevel !== null ? ` · Combat level ${combatLevel}` : ""}
              </div>
            )}
            {statsError && (
              <div style={{ fontSize: 13, color: C.red, marginTop: 6 }}>
                {statsError}
              </div>
            )}
            {!player && !statsError && (
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
                With your stats loaded you'll see whether you meet each quest's
                skill requirements.
              </div>
            )}
          </div>

          <Link
            href="/map"
            style={{
              ...ghostBtn,
              marginTop: 12,
              color: C.gold,
              borderColor: C.border,
              textDecoration: "none",
            }}
          >
            🗺️ World map
          </Link>

          {nextQuest && (
            <div
              onClick={() => openQuest(nextQuest)}
              style={{
                ...card,
                borderColor: C.gold,
                padding: "14px 16px",
                marginTop: 26,
                cursor: "pointer",
                boxShadow: "0 3px 12px rgba(0,0,0,.35)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: C.goldDim,
                  fontWeight: 700,
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                🎯 WHAT'S NEXT
              </div>
              <div style={{ ...goldTitle, fontSize: 19, fontWeight: 700 }}>
                {nextQuest}
              </div>
              {afterThat.length > 0 && (
                <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
                  Then: {afterThat.join(" · ")}
                </div>
              )}
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>
                Based on the wiki's Optimal Quest Guide — tap to start
              </div>
            </div>
          )}

          {recent.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <div style={{ ...goldTitle, fontSize: 15, marginBottom: 8 }}>
                Continue
              </div>
              {recent.map((r) => {
                const p = r.total ? Math.round((r.done / r.total) * 100) : 0;
                return (
                  <div
                    key={r.name}
                    onClick={() => openQuest(r.name)}
                    style={{
                      ...card,
                      padding: "12px 14px",
                      marginBottom: 8,
                      cursor: "pointer",
                      color: C.text,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          color: C.parch,
                          fontWeight: 600,
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.name}
                      </span>
                      <span style={{ color: C.gold, fontSize: 13 }}>{p}%</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteRecent(r.name);
                        }}
                        style={{
                          flexShrink: 0,
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: "transparent",
                          color: C.textDim,
                          border: `1px solid ${C.borderSoft}`,
                          fontSize: 13,
                          cursor: "pointer",
                          lineHeight: 1,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    <div
                      style={{
                        height: 5,
                        marginTop: 8,
                        background: C.bg,
                        borderRadius: 3,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: p + "%",
                          height: "100%",
                          background: C.gold,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quest List — styled like the in-game quest tab */}
          <div style={{ marginTop: 26 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div style={{ ...goldTitle, fontSize: 15 }}>Quest List</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 13, color: C.textDim }}>
                  Quest Points: <b style={{ color: C.gold }}>{totalQp}</b>
                </div>
                <button
                  onClick={() => setEditMode(!editMode)}
                  style={{
                    padding: "6px 11px",
                    fontSize: 12,
                    fontWeight: 700,
                    background: editMode ? C.gold : "transparent",
                    color: editMode ? C.ink : C.gold,
                    border: `1px solid ${editMode ? C.gold : C.borderSoft}`,
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  {editMode ? "Done" : "✏️ Mark done"}
                </button>
              </div>
            </div>
            {editMode && (
              <div style={{ fontSize: 12, color: C.gold, marginBottom: 8 }}>
                Tap quests you've already completed to mark them ✓ — tap again to
                undo. Press Done when finished. Rewards (QP + XP) are looked up
                from the wiki automatically.
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 12,
                fontSize: 11,
                color: C.textDim,
                marginBottom: 10,
              }}
            >
              <span>
                <span style={{ color: C.qRed }}>●</span> Not started
              </span>
              <span>
                <span style={{ color: C.qYellow }}>●</span> In progress
              </span>
              <span>
                <span style={{ color: C.qGreen }}>●</span> Completed
              </span>
            </div>
            {questListGroup("Free Quests", freeQuests)}
            {questListGroup("Members' Quests", memberQuests)}
            {questListGroup("Miniquests", miniQuests)}
          </div>
        </div>
      </div>
    );
  }

  // ── Quest view ──
  return (
    <div style={{ ...frame, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          background: C.bg,
          borderBottom: `2px solid ${C.border}`,
          padding: "10px 14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView("home")} style={headBtn}>
            ←
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                ...goldTitle,
                fontSize: 17,
                fontWeight: 700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {quest ? quest.name : "Loading…"}
            </div>
            {quest && phase === "info" && (
              <div style={{ fontSize: 12, color: C.textDim }}>Quest info</div>
            )}
            {quest && phase === "steps" && (
              <div style={{ fontSize: 12, color: C.textDim }}>
                Step {stepIdx + 1} of {total} · {pct}%
              </div>
            )}
            {quest && phase === "items" && (
              <div style={{ fontSize: 12, color: C.textDim }}>
                Required items · {itemsChecked.size}/{quest.items.length}
              </div>
            )}
          </div>
          <Nav />
        </div>
        {quest && phase === "steps" && (
          <div
            style={{
              height: 5,
              marginTop: 8,
              background: C.panel,
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: pct + "%",
                height: "100%",
                background: C.gold,
                transition: "width .3s",
              }}
            />
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          maxWidth: 560,
          width: "100%",
          margin: "0 auto",
          padding: "16px 14px 30px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: C.textDim }}>
            Fetching the quick guide from the wiki…
          </div>
        )}

        {error && (
          <div style={{ ...card, borderColor: C.red, padding: 16, color: C.parch }}>
            <div style={{ color: C.red, fontWeight: 700, marginBottom: 4 }}>
              Couldn't load the guide
            </div>
            {error}
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => setView("home")}
                style={{
                  background: C.panelSoft,
                  border: `1px solid ${C.border}`,
                  color: C.gold,
                  borderRadius: 8,
                  padding: "9px 14px",
                  cursor: "pointer",
                }}
              >
                Back to search
              </button>
            </div>
          </div>
        )}

        {/* Phase 0: quest info & requirements */}
        {quest && phase === "info" && (
          <>
            <div style={{ flex: 1 }}>
              {(quest.meta.difficulty || quest.meta.length) && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                  {quest.meta.difficulty && (
                    <span style={chip}>🏁 {quest.meta.difficulty}</span>
                  )}
                  {quest.meta.length && (
                    <span style={chip}>⏱️ {quest.meta.length}</span>
                  )}
                </div>
              )}

              {quest.meta.start && (
                <div
                  onClick={() => {
                    if (quest.meta.startCoords) {
                      goToMap({
                        x: quest.meta.startCoords.x,
                        y: quest.meta.startCoords.y,
                        title: "Start point",
                        marker: true,
                        plane: quest.meta.startCoords.plane,
                        mapId: quest.meta.startCoords.mapId,
                      });
                    }
                  }}
                  style={{
                    ...card,
                    padding: "11px 14px",
                    marginBottom: 14,
                    cursor: quest.meta.startCoords ? "pointer" : "default",
                    borderColor: quest.meta.startCoords ? C.gold : C.borderSoft,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 3,
                    }}
                  >
                    <span style={{ fontSize: 12, color: C.goldDim, fontWeight: 700 }}>
                      📍 START POINT
                    </span>
                    {quest.meta.startCoords && (
                      <span style={{ fontSize: 12, color: C.gold, fontWeight: 600 }}>
                        🗺️ Show on map
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, color: C.parch }}>{quest.meta.start}</div>
                </div>
              )}

              <div style={{ ...goldTitle, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                Requirements
              </div>

              {!hasReqs && (
                <div style={{ color: C.textDim, fontSize: 14 }}>
                  No requirements — you can start right away! 🎉
                </div>
              )}

              {quest.meta.skillReqs.map((req, i) => {
                const ok = checkReq(req);
                return (
                  <div
                    key={i}
                    style={{
                      ...card,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      marginBottom: 6,
                      borderColor:
                        ok === true ? C.green : ok === false ? C.red : C.borderSoft,
                    }}
                  >
                    <span style={{ fontSize: 15 }}>
                      {ok === true ? "✅" : ok === false ? "❌" : "▫️"}
                    </span>
                    <span style={{ color: C.parch, fontSize: 15, flex: 1 }}>
                      Level {req.level} {req.skill}
                      {req.note && (
                        <span style={{ color: C.textDim, fontSize: 13 }}> {req.note}</span>
                      )}
                    </span>
                    {player && (
                      <span
                        style={{
                          fontSize: 13,
                          color: ok ? C.green : C.red,
                          fontWeight: 700,
                        }}
                      >
                        {player.skills[normalizeSkill(req.skill)] ?? 1}
                      </span>
                    )}
                  </div>
                );
              })}

              {quest.meta.skillReqs.length > 0 && !player && (
                <div style={{ fontSize: 12, color: C.textDim, margin: "4px 0 10px" }}>
                  Tip: enter your RSN on the home screen and I'll check your levels
                  automatically.
                </div>
              )}

              {quest.meta.otherReqs.map((t, i) => {
                const qName = matchQuest(t);
                if (!qName) {
                  return (
                    <div
                      key={i}
                      style={{
                        ...card,
                        padding: "10px 14px",
                        marginBottom: 6,
                        fontSize: 14,
                        color: C.text,
                      }}
                    >
                      📜 {t}
                    </div>
                  );
                }
                const isDone = completed.has(qName);
                return (
                  <div
                    key={i}
                    onClick={() => {
                      if (!isDone) openQuest(qName);
                    }}
                    style={{
                      ...card,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      marginBottom: 6,
                      cursor: isDone ? "default" : "pointer",
                      borderColor: isDone ? C.green : C.gold,
                    }}
                  >
                    <span style={{ fontSize: 15 }}>{isDone ? "✅" : "📜"}</span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 15,
                        color: isDone ? C.textDim : C.gold,
                        textDecoration: isDone ? "line-through" : "underline",
                        fontWeight: 600,
                      }}
                    >
                      {qName}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCompleted(qName);
                      }}
                      style={{
                        flexShrink: 0,
                        width: 26,
                        height: 26,
                        borderRadius: 7,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        background: isDone ? C.green : "transparent",
                        color: isDone ? C.bg : "transparent",
                        border: isDone
                          ? `1px solid ${C.green}`
                          : `2px solid ${C.border}`,
                        cursor: "pointer",
                      }}
                    >
                      ✓
                    </button>
                  </div>
                );
              })}

              {quest.meta.otherReqs.some((t) => matchQuest(t) && !completed.has(matchQuest(t) as string)) && (
                <div style={{ fontSize: 12, color: C.textDim, margin: "4px 0 10px" }}>
                  Tap a quest to open it, or tap the box if you've already
                  completed it.
                </div>
              )}

              {quest.meta.enemies.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ ...goldTitle, fontSize: 14, fontWeight: 700 }}>
                      ⚔️ Enemies to defeat
                    </div>
                    {combatLevel !== null && (
                      <span style={{ fontSize: 12, color: C.textDim }}>
                        Your combat: <b style={{ color: C.gold }}>{combatLevel}</b>
                      </span>
                    )}
                  </div>
                  {quest.meta.enemies.map((e, i) => {
                    const lvl = enemyLevel(e);
                    const ok =
                      combatLevel !== null && lvl !== null
                        ? combatLevel >= lvl
                        : null;
                    return (
                      <div
                        key={i}
                        style={{
                          ...card,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 14px",
                          marginBottom: 6,
                          borderColor:
                            ok === true
                              ? C.green
                              : ok === false
                              ? C.red
                              : C.borderSoft,
                        }}
                      >
                        <span style={{ fontSize: 15 }}>
                          {ok === true ? "✅" : ok === false ? "⚠️" : "⚔️"}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            fontSize: 14,
                            color: ok === true ? C.green : ok === false ? C.parch : C.text,
                          }}
                        >
                          {e}
                        </span>
                        {ok === false && (
                          <span style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>
                            above your level
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {combatLevel !== null && (
                    <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
                      Based on combat level only — gear and tactics matter too.
                    </div>
                  )}
                </div>
              )}
            </div>
            <button onClick={afterInfo} style={{ ...bigBtn, marginTop: 16 }}>
              {quest.items.length ? "To required items →" : "Start quest →"}
            </button>
          </>
        )}

        {/* Phase 1: item checklist */}
        {quest && phase === "items" && (
          <>
            <div style={{ ...goldTitle, fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
              🎒 Gather these items
            </div>
            <div style={{ flex: 1 }}>
              {quest.items.map((it, i) => {
                const isDone = itemsChecked.has(i);
                const infoOpen = openInfo === i;
                return (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: isDone ? C.panel : C.panelSoft,
                        border: `1px solid ${C.borderSoft}`,
                        borderRadius: 10,
                        padding: "4px 6px 4px 4px",
                      }}
                    >
                      <button
                        onClick={() => toggleItem(i)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flex: 1,
                          minWidth: 0,
                          textAlign: "left",
                          background: "transparent",
                          border: "none",
                          padding: "9px 6px",
                          cursor: "pointer",
                          color: isDone ? C.textDim : C.parch,
                          textDecoration: isDone ? "line-through" : "none",
                          fontSize: 15,
                        }}
                      >
                        <span
                          style={{
                            flexShrink: 0,
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 14,
                            background: isDone ? C.green : "transparent",
                            color: isDone ? C.bg : "transparent",
                            border: isDone
                              ? `1px solid ${C.green}`
                              : `2px solid ${C.border}`,
                          }}
                        >
                          ✓
                        </span>
                        <span>{it.name}</span>
                      </button>
                      {it.info && (
                        <button
                          onClick={() => setOpenInfo(infoOpen ? null : i)}
                          style={{
                            flexShrink: 0,
                            width: 30,
                            height: 30,
                            borderRadius: "50%",
                            background: infoOpen ? C.gold : "transparent",
                            color: infoOpen ? C.ink : C.gold,
                            border: `1px solid ${infoOpen ? C.gold : C.goldDim}`,
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "Georgia, serif",
                          }}
                        >
                          i
                        </button>
                      )}
                    </div>
                    {it.info && infoOpen && (
                      <div
                        style={{
                          margin: "4px 0 8px 36px",
                          padding: "9px 12px",
                          background: C.panel,
                          border: `1px solid ${C.goldDim}`,
                          borderRadius: 8,
                          fontSize: 13,
                          color: C.text,
                        }}
                      >
                        {it.info}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button onClick={startSteps} style={{ ...bigBtn, marginTop: 16 }}>
              Start quest →
            </button>
          </>
        )}

        {/* Phase 2: step wizard, each step on its own screen */}
        {quest && phase === "steps" && step && (
          <>
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: C.goldDim,
                  marginBottom: 10,
                }}
              >
                {step.section}
              </div>
              <div
                style={{
                  flex: 1,
                  background: C.parch,
                  color: C.ink,
                  border: `2px solid ${C.gold}`,
                  borderRadius: 14,
                  padding: "22px 18px",
                  fontSize: 18,
                  lineHeight: 1.55,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  boxShadow: "0 4px 16px rgba(0,0,0,.4)",
                  overflowY: "auto",
                }}
              >
                <span>{renderRich(step.text)}</span>

                {step.images.map((src) => (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    style={{
                      maxWidth: "100%",
                      maxHeight: 260,
                      objectFit: "contain",
                      borderRadius: 10,
                      marginTop: 14,
                      border: `1px solid ${C.goldDim}`,
                      alignSelf: "center",
                    }}
                  />
                ))}

                {/* Toolbar: permanent dashed divider with all step actions */}
                <div style={dashed} />
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 12,
                  }}
                >
                  {step.links.map((l) => (
                    <button
                      key={l.page}
                      onClick={() => lookupPage(l.page, l.label)}
                      style={toolChip}
                    >
                      🔍 {l.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setStepsOpen(true)}
                    style={toolIcon}
                    title="All steps"
                  >
                    📋
                  </button>
                  {gallery.length > 0 && (
                    <button
                      onClick={() => setGalleryOpen(true)}
                      style={toolIcon}
                      title="Maps & images"
                    >
                      🖼️
                    </button>
                  )}
                  <button
                    onClick={() => setPhase("info")}
                    style={toolIcon}
                    title="Quest info"
                  >
                    ℹ️
                  </button>
                  {quest.items.length > 0 && (
                    <button
                      onClick={() => setPhase("items")}
                      style={toolIcon}
                      title="Required items"
                    >
                      🎒
                    </button>
                  )}
                  {step.info.length > 0 && (
                    <button
                      onClick={() => setStepInfoOpen(!stepInfoOpen)}
                      style={{
                        ...toolIcon,
                        fontFamily: "Georgia, serif",
                        fontWeight: 700,
                        background: stepInfoOpen ? C.ink : "rgba(58,46,25,.08)",
                        color: stepInfoOpen ? C.parch : C.ink,
                      }}
                    >
                      i
                    </button>
                  )}
                </div>

                {stepInfoOpen && step.info.length > 0 && (
                  <>
                    <div style={dashed} />
                    <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5 }}>
                      {step.info.map((inf, i) => (
                        <div key={i} style={{ padding: "3px 0" }}>
                          ℹ️ {renderRich(inf)}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button
                onClick={nextStep}
                style={{
                  ...bigBtn,
                  background: isLast ? C.green : C.gold,
                }}
              >
                {isLast ? "Quest complete 🏆" : "Next ✓"}
              </button>
              <button
                onClick={prevStep}
                disabled={stepIdx === 0}
                style={{
                  ...ghostBtn,
                  marginTop: 8,
                  opacity: stepIdx === 0 ? 0.35 : 1,
                }}
              >
                ← Previous
              </button>
            </div>
          </>
        )}

        {/* Phase 3: complete */}
        {quest && phase === "done" && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 60 }}>🏆</div>
            <div
              style={{
                ...goldTitle,
                fontSize: 24,
                fontWeight: 700,
                marginTop: 10,
              }}
            >
              Quest complete!
            </div>
            <div style={{ color: C.textDim, marginTop: 6 }}>
              {quest.name} has been completed and removed from your list.
            </div>
            {lastReward && (lastReward.qp > 0 || Object.keys(lastReward.xp).length > 0) && (
              <div style={{ ...card, padding: "12px 18px", marginTop: 16 }}>
                {lastReward.qp > 0 && (
                  <div style={{ color: C.gold, fontWeight: 700, fontSize: 15 }}>
                    ⭐ +{lastReward.qp} Quest point{lastReward.qp > 1 ? "s" : ""}
                  </div>
                )}
                {Object.entries(lastReward.xp).map(([sk, amt]) => (
                  <div key={sk} style={{ fontSize: 14, color: C.text, marginTop: 3 }}>
                    📈 +{fmtNum(amt)} {capitalize(sk)} xp
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setView("home")}
              style={{ ...bigBtn, marginTop: 26, maxWidth: 300 }}
            >
              Back to home
            </button>
          </div>
        )}
      </div>

      {/* Overlay: NPC/location lookup */}
      {lookup &&
        overlay(`🔍 ${lookup.title}`, () => setLookup(null), (
          <>
            {lookup.loading && (
              <div style={{ color: C.textDim, padding: "20px 0", textAlign: "center" }}>
                Searching the wiki…
              </div>
            )}
            {lookup.error && !lookup.loading && (
              <div style={{ color: C.textDim, fontSize: 14, marginBottom: 12 }}>
                {lookup.error}
              </div>
            )}
            {!lookup.loading && !lookup.coords && (
              <div style={{ color: C.textDim, fontSize: 13, marginBottom: 10 }}>
                📍 Coordinates couldn't be found for this page.
              </div>
            )}
            {!lookup.loading && (
              <button
                onClick={() => {
                  const c = lookup.coords;
                  const title = lookup.title;
                  setLookup(null);
                  goToMap(
                    c
                      ? {
                          x: c.x,
                          y: c.y,
                          title,
                          marker: true,
                          plane: c.plane,
                          mapId: c.mapId,
                        }
                      : { x: 3222, y: 3218, title: "Gielinor", marker: false }
                  );
                }}
                style={{ ...bigBtn, marginBottom: 12 }}
              >
                {lookup.coords ? "🗺️ Show on world map" : "🗺️ Open world map"}
              </button>
            )}
            {lookup.images.map((src) => (
              <img
                key={src}
                src={src}
                alt=""
                style={{
                  width: "100%",
                  borderRadius: 10,
                  marginBottom: 10,
                  border: `1px solid ${C.borderSoft}`,
                }}
              />
            ))}
            <a
              href={wikiUrl(lookup.page)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                textAlign: "center",
                padding: "12px",
                background: C.panelSoft,
                color: C.gold,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Open on wiki ↗
            </a>
          </>
        ))}

      {/* Overlay: step overview with jump list */}
      {stepsOpen &&
        quest &&
        overlay(`📋 All steps (${total})`, () => setStepsOpen(false), (
          <>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 10 }}>
              Tap a step to jump there — handy if you're further along in game.
            </div>
            {quest.steps.map((st, i) => {
              const isCur = i === stepIdx;
              const isPast = i < stepIdx;
              return (
                <button
                  key={i}
                  onClick={() => jumpToStep(i)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    marginBottom: 6,
                    background: isCur ? C.panelSoft : C.panel,
                    border: `1px solid ${isCur ? C.gold : C.borderSoft}`,
                    borderRadius: 10,
                    cursor: "pointer",
                    color: isPast ? C.textDim : C.parch,
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      minWidth: 26,
                      fontWeight: 700,
                      fontSize: 13,
                      color: isCur ? C.gold : isPast ? C.green : C.textDim,
                    }}
                  >
                    {isPast ? "✓" : i + 1}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 13,
                      lineHeight: 1.4,
                      textDecoration: isPast ? "line-through" : "none",
                    }}
                  >
                    {(st.text.length > 90 ? st.text.slice(0, 90) + "…" : st.text).replace(/[]/g, "")}
                  </span>
                </button>
              );
            })}
          </>
        ))}

      {/* Overlay: gallery from the full guide */}
      {galleryOpen &&
        overlay("🖼️ Maps & images", () => setGalleryOpen(false), (
          <>
            {gallery.map((g) => (
              <div key={g.src} style={{ marginBottom: 16 }}>
                <img
                  src={g.src}
                  alt=""
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: `1px solid ${C.borderSoft}`,
                  }}
                />
                {g.caption && (
                  <div style={{ fontSize: 13, color: C.textDim, marginTop: 4 }}>
                    {g.caption}
                  </div>
                )}
              </div>
            ))}
          </>
        ))}
    </div>
  );
}
