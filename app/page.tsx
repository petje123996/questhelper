"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── OSRS Quest Helper ───────────────────────────────────────────
// Flow: quest-info & vereisten → items afvinken → stappen-wizard.
// Vereiste quests zijn klikbaar; voltooide worden doorgestreept.

const API = "https://oldschool.runescape.wiki/api.php";
const WIKI = "https://oldschool.runescape.wiki";

const C = {
  bg: "#26211A",
  panel: "#332C22",
  panelSoft: "#3B342A",
  border: "#57492F",
  goldDim: "#B08A3E",
  borderSoft: "#463C2C",
  gold: "#E7B84C",
  parch: "#E9DDBE",
  ink: "#3A2E19",
  text: "#D8CDB4",
  textDim: "#9A8E74",
  green: "#7CB363",
  red: "#C96A5B",
};

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

const SKILLS = new Set([
  "attack", "strength", "defence", "ranged", "prayer", "magic",
  "runecraft", "runecrafting", "hitpoints", "crafting", "mining",
  "smithing", "fishing", "cooking", "firemaking", "woodcutting",
  "agility", "herblore", "thieving", "fletching", "slayer",
  "farming", "construction", "hunter",
]);

type SkillReq = { level: number; skill: string; note: string };
type Meta = {
  difficulty: string | null;
  length: string | null;
  start: string | null;
  skillReqs: SkillReq[];
  otherReqs: string[];
  enemies: string[];
};
type Step = { text: string; info: string[]; images: string[]; section: string };
type Item = { name: string; info: string | null };
type Quest = { name: string; steps: Step[]; items: Item[]; meta: Meta };
type RecentItem = { name: string; done: number; total: number };
type Player = { name: string; skills: Record<string, number> };

function cleanText(s: string): string {
  return s
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function normalizeSkill(s: string): string {
  const t = s.toLowerCase().trim();
  return t === "runecrafting" ? "runecraft" : t;
}

// Splitst "Bucket of milk (can be bought at...)" in naam + extra info
function splitItem(raw: string): Item {
  const m = raw.match(/^(.*?)\s*\((.+)\)\s*$/);
  if (m && m[1].trim()) {
    return { name: cleanText(m[1]), info: cleanText(m[2]) };
  }
  return { name: cleanText(raw), info: null };
}

// Haalt lange (tussen haakjes) teksten uit een stap en zet ze apart.
// Korte haakjes zoals "(north)" blijven in de zin staan.
function splitStep(raw: string, section: string, images: string[]): Step {
  const infos: string[] = [];
  const stripped = raw.replace(/\s*\(([^()]+)\)/g, (match, inner) => {
    const t = cleanText(inner);
    if (t.length >= 12) {
      infos.push(t);
      return "";
    }
    return match;
  });
  return { text: cleanText(stripped), info: infos, images, section };
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Wiki gaf status " + res.status);
  return res.json();
}

function loadStored(key: string): any {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function saveStored(key: string, val: any): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* opslag niet beschikbaar */
  }
}

function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* opslag niet beschikbaar */
  }
}

const storageKey = (name: string) => "qh-quest-" + name.replace(/[\s/\\'"]+/g, "_");

// Eigen tekst van elk li-element, zonder geneste lijsten
function ownLiTexts(container: Element): string[] {
  const out: string[] = [];
  container.querySelectorAll("li").forEach((li) => {
    const clone = li.cloneNode(true) as Element;
    clone.querySelectorAll("ul, ol").forEach((n) => n.remove());
    const t = cleanText(clone.textContent || "");
    if (t) out.push(t);
  });
  return out;
}

// Zet wiki-HTML om naar stappen + items + quest-info
function parseGuide(html: string): { steps: Step[]; items: Item[]; meta: Meta } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;

  root
    .querySelectorAll(
      ".navbox, .references, .reference, #toc, .toc, .mw-editsection, .messagebox, .infobox, style, script, sup"
    )
    .forEach((el) => el.remove());

  const items: Item[] = [];
  const meta: Meta = {
    difficulty: null,
    length: null,
    start: null,
    skillReqs: [],
    otherReqs: [],
    enemies: [],
  };

  const details = root.querySelector("table.questdetails");
  if (details) {
    details.querySelectorAll("tr").forEach((tr) => {
      const th = tr.querySelector("th");
      const td = tr.querySelector("td");
      if (!th || !td) return;
      const label = (th.textContent || "").toLowerCase();

      if (/item/.test(label)) {
        ownLiTexts(td).forEach((t) => items.push(splitItem(t)));
      } else if (/difficulty/.test(label)) {
        meta.difficulty = cleanText(td.textContent || "") || null;
      } else if (/length/.test(label)) {
        meta.length = cleanText(td.textContent || "") || null;
      } else if (/start/.test(label)) {
        meta.start = cleanText(td.textContent || "") || null;
      } else if (/enem|defeat/.test(label)) {
        const lis = ownLiTexts(td);
        meta.enemies = lis.length
          ? lis
          : cleanText(td.textContent || "")
          ? [cleanText(td.textContent || "")]
          : [];
      } else if (/requirement/.test(label)) {
        ownLiTexts(td).forEach((t) => {
          if (t.endsWith(":")) return; // kopregels zoals "Completion of..."
          const m = t.match(/^(\d+)\s+([A-Za-z]+)(.*)$/);
          if (m && SKILLS.has(m[2].toLowerCase())) {
            meta.skillReqs.push({
              level: parseInt(m[1], 10),
              skill: m[2],
              note: cleanText(m[3] || ""),
            });
          } else {
            meta.otherReqs.push(t);
          }
        });
      }
    });
    details.remove();
  }

  const SKIP = /reference|navigat|see also|trivia|gallery|changes|reward/i;
  const steps: Step[] = [];
  let sectionTitle = "Walkthrough";
  let skipping = false;

  const pushLis = (listEl: Element) => {
    Array.from(listEl.children).forEach((li) => {
      if (li.tagName !== "LI") return;
      const clone = li.cloneNode(true) as Element;
      clone.querySelectorAll("ul, ol").forEach((n) => n.remove());

      // Afbeeldingen (kaartjes e.d.) bij deze stap; kleine icoontjes overslaan
      const images: string[] = [];
      clone.querySelectorAll("img").forEach((img) => {
        if (images.length >= 2) return;
        const w = parseInt(img.getAttribute("width") || "0", 10);
        if (w < 80) return;
        let src = img.getAttribute("src") || "";
        if (!src) return;
        if (src.startsWith("//")) src = "https:" + src;
        else if (src.startsWith("/")) src = WIKI + src;
        images.push(src);
      });

      const t = cleanText(clone.textContent || "");
      if (t) steps.push(splitStep(t, sectionTitle, images));
      li.querySelectorAll(":scope > ul, :scope > ol").forEach((sub) => pushLis(sub));
    });
  };

  const walk = (node: Element) => {
    Array.from(node.children).forEach((child) => {
      const tag = child.tagName;
      if (tag === "H2" || tag === "H3") {
        const title = cleanText(child.textContent || "");
        skipping = SKIP.test(title);
        if (!skipping && title) sectionTitle = title;
        return;
      }
      if (skipping) return;
      if (tag === "UL" || tag === "OL") {
        if (!child.closest("table")) pushLis(child);
        return;
      }
      if (tag === "DIV" || tag === "SECTION") walk(child);
    });
  };
  walk(root);

  return { steps, items, meta };
}

export default function QuestHelper() {
  const [view, setView] = useState<"home" | "quest">("home");
  const [phase, setPhase] = useState<"info" | "items" | "steps" | "done">("info");
  const [query, setQuery] = useState("");
  const [suggest, setSuggest] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [allQuests, setAllQuests] = useState<string[]>(POPULAR);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [quest, setQuest] = useState<Quest | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [itemsChecked, setItemsChecked] = useState<Set<number>>(new Set());
  const [openInfo, setOpenInfo] = useState<number | null>(null);
  const [stepInfoOpen, setStepInfoOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rsn, setRsn] = useState("");
  const [player, setPlayer] = useState<Player | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const debounceRef = useRef<any>(null);

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

    const savedPlayer = loadStored("qh-rsn");
    if (savedPlayer && savedPlayer.name && savedPlayer.skills) {
      setPlayer(savedPlayer);
      setRsn(savedPlayer.name);
    }

    // Volledige questlijst van de wiki (max 1x per week verversen)
    const cached = loadStored("qh-questlist");
    if (cached && Array.isArray(cached.names) && cached.names.length > 0) {
      setAllQuests(cached.names);
      if (Date.now() - (cached.ts || 0) < 7 * 24 * 60 * 60 * 1000) return;
    }
    (async () => {
      try {
        const names: string[] = [];
        let cont: string | null = null;
        for (let i = 0; i < 3; i++) {
          const url =
            `${API}?action=query&format=json&origin=*&list=categorymembers` +
            `&cmtitle=Category%3AQuests&cmtype=page&cmlimit=500` +
            (cont ? `&cmcontinue=${encodeURIComponent(cont)}` : "");
          const data: any = await fetchJson(url);
          (data.query?.categorymembers || []).forEach((m: any) => {
            const t = String(m.title || "");
            if (
              t &&
              !t.includes("/") &&
              !t.includes(":") &&
              !/^(Quests|Quest points|Quest List)$/i.test(t)
            ) {
              names.push(t);
            }
          });
          cont = data.continue?.cmcontinue || null;
          if (!cont) break;
        }
        if (names.length > 10) {
          names.sort((a, b) => a.localeCompare(b));
          setAllQuests(names);
          saveStored("qh-questlist", { ts: Date.now(), names });
        }
      } catch {
        /* POPULAR blijft als fallback */
      }
    })();
  }, []);

  // Wiki-zoeksuggesties + lokale lijst
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
        /* lokale lijst blijft staan */
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
        throw new Error(data.error || "Speler niet gevonden");
      }
      const skills: Record<string, number> = {};
      data.skills.forEach((s: any) => {
        if (s && s.name) skills[normalizeSkill(String(s.name))] = Number(s.level) || 1;
      });
      const p: Player = { name, skills };
      setPlayer(p);
      saveStored("qh-rsn", p);
    } catch (e: any) {
      setStatsError(e?.message || "Stats laden mislukt");
    } finally {
      setStatsLoading(false);
    }
  };

  const checkReq = (req: SkillReq): boolean | null => {
    if (!player) return null;
    return (player.skills[normalizeSkill(req.skill)] ?? 1) >= req.level;
  };

  const markCompleted = useCallback((name: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.add(name);
      saveStored("qh-completed", Array.from(next));
      return next;
    });
  }, []);

  const toggleCompleted = (name: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      saveStored("qh-completed", Array.from(next));
      return next;
    });
  };

  // Zoekt of een vereiste-regel een questnaam is
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

  const openQuest = async (name: string) => {
    setLoading(true);
    setError(null);
    setView("quest");
    setQuest(null);
    setOpenInfo(null);
    setStepInfoOpen(false);
    try {
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
      }
      if (data.error) throw new Error("Quest niet gevonden op de wiki.");
      const parsed = parseGuide(data.parse.text["*"]);
      if (!parsed.steps.length) {
        throw new Error("Geen stappen gevonden voor deze pagina.");
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
    } catch (e: any) {
      setError(e?.message || "Laden mislukt. Controleer je verbinding.");
    } finally {
      setLoading(false);
    }
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
      setPhase("done");
      markCompleted(quest.name);
      removeFromRecent(quest.name);
      removeStored(storageKey(quest.name));
      return;
    }
    const n = stepIdx + 1;
    setStepIdx(n);
    persist(quest.name, "steps", n, itemsChecked);
    updateRecent(quest.name, n, quest.steps.length);
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

  // ── Stijlen ──
  const frame: React.CSSProperties = {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    fontFamily: "system-ui, sans-serif",
    fontSize: 15,
    lineHeight: 1.45,
  };
  const goldTitle: React.CSSProperties = {
    fontFamily: "Georgia, 'Times New Roman', serif",
    color: C.gold,
    letterSpacing: 0.5,
  };
  const card: React.CSSProperties = {
    background: C.panel,
    border: `1px solid ${C.borderSoft}`,
    borderRadius: 10,
  };
  const bigBtn: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "15px",
    fontSize: 17,
    fontWeight: 700,
    background: C.gold,
    color: C.ink,
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,.45)",
  };
  const ghostBtn: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "13px",
    fontSize: 15,
    fontWeight: 600,
    background: "transparent",
    color: C.textDim,
    border: `1px solid ${C.borderSoft}`,
    borderRadius: 12,
    cursor: "pointer",
  };
  const chip: React.CSSProperties = {
    padding: "6px 12px",
    background: C.panelSoft,
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    fontSize: 13,
    color: C.parch,
  };

  // ── Home ──
  if (view === "home") {
    return (
      <div style={frame}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 14px 40px" }}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ ...goldTitle, fontSize: 26, fontWeight: 700 }}>
              ⚔️ Quest Helper
            </div>
            <div style={{ color: C.textDim, fontSize: 13, marginTop: 2 }}>
              Quick guides van de OSRS Wiki, naast je spel
            </div>
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek een quest…"
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

          {recent.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <div style={{ ...goldTitle, fontSize: 15, marginBottom: 8 }}>
                Verder gaan
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

          {/* RSN / stats */}
          <div style={{ marginTop: 26 }}>
            <div style={{ ...goldTitle, fontSize: 15, marginBottom: 8 }}>
              👤 Jouw stats
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={rsn}
                onChange={(e) => setRsn(e.target.value)}
                placeholder="RuneScape-naam…"
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
                {statsLoading ? "…" : player ? "Ververs" : "Laden"}
              </button>
            </div>
            {player && !statsError && (
              <div style={{ fontSize: 13, color: C.green, marginTop: 6 }}>
                ✓ Stats geladen voor {player.name}
              </div>
            )}
            {statsError && (
              <div style={{ fontSize: 13, color: C.red, marginTop: 6 }}>
                {statsError}
              </div>
            )}
            {!player && !statsError && (
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
                Met je stats zie je per quest of je de skill-vereisten haalt.
              </div>
            )}
          </div>

          <div style={{ marginTop: 26 }}>
            <div style={{ ...goldTitle, fontSize: 15, marginBottom: 8 }}>
              Alle quests
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {allQuests
                .filter((n) => !recentNames.has(n))
                .map((n) => {
                  const isDone = completed.has(n);
                  return (
                    <button
                      key={n}
                      onClick={() => openQuest(n)}
                      style={{
                        ...chip,
                        padding: "9px 13px",
                        cursor: "pointer",
                        textDecoration: isDone ? "line-through" : "none",
                        color: isDone ? C.textDim : C.parch,
                        borderColor: isDone ? C.green : C.border,
                      }}
                    >
                      {isDone ? "✓ " : ""}
                      {n}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Quest-weergave ──
  return (
    <div style={{ ...frame, display: "flex", flexDirection: "column" }}>
      {/* Kopregel */}
      <div
        style={{
          background: C.bg,
          borderBottom: `2px solid ${C.border}`,
          padding: "10px 14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setView("home")}
            style={{
              background: C.panelSoft,
              border: `1px solid ${C.border}`,
              color: C.gold,
              borderRadius: 8,
              padding: "7px 12px",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
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
              {quest ? quest.name : "Laden…"}
            </div>
            {quest && phase === "info" && (
              <div style={{ fontSize: 12, color: C.textDim }}>Quest-info</div>
            )}
            {quest && phase === "steps" && (
              <div style={{ fontSize: 12, color: C.textDim }}>
                Stap {stepIdx + 1} van {total} · {pct}%
              </div>
            )}
            {quest && phase === "items" && (
              <div style={{ fontSize: 12, color: C.textDim }}>
                Benodigde items · {itemsChecked.size}/{quest.items.length}
              </div>
            )}
          </div>
          {quest && phase !== "info" && phase !== "done" && (
            <button
              onClick={() => setPhase("info")}
              style={{
                background: "transparent",
                border: `1px solid ${C.borderSoft}`,
                color: C.gold,
                borderRadius: 8,
                padding: "7px 10px",
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              ℹ️
            </button>
          )}
          {quest && phase === "steps" && quest.items.length > 0 && (
            <button
              onClick={() => setPhase("items")}
              style={{
                background: "transparent",
                border: `1px solid ${C.borderSoft}`,
                color: C.gold,
                borderRadius: 8,
                padding: "7px 10px",
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              🎒
            </button>
          )}
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
            Quick guide ophalen van de wiki…
          </div>
        )}

        {error && (
          <div style={{ ...card, borderColor: C.red, padding: 16, color: C.parch }}>
            <div style={{ color: C.red, fontWeight: 700, marginBottom: 4 }}>
              Kon de gids niet laden
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
                Terug naar zoeken
              </button>
            </div>
          </div>
        )}

        {/* Fase 0: quest-info & vereisten */}
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
                <div style={{ ...card, padding: "11px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: C.goldDim, fontWeight: 700, marginBottom: 3 }}>
                    📍 STARTPUNT
                  </div>
                  <div style={{ fontSize: 14, color: C.parch }}>{quest.meta.start}</div>
                </div>
              )}

              <div style={{ ...goldTitle, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                Vereisten
              </div>

              {!hasReqs && (
                <div style={{ color: C.textDim, fontSize: 14 }}>
                  Geen vereisten — je kunt meteen beginnen! 🎉
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
                  Tip: vul je RSN in op de startpagina, dan check ik je levels automatisch.
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
                  Tik op een quest om hem te openen, of op het vakje als je hem al gedaan hebt.
                </div>
              )}

              {quest.meta.enemies.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ ...goldTitle, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                    ⚔️ Te verslaan
                  </div>
                  {quest.meta.enemies.map((e, i) => (
                    <div key={i} style={{ fontSize: 14, color: C.text, padding: "2px 0" }}>
                      • {e}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={afterInfo} style={{ ...bigBtn, marginTop: 16 }}>
              {quest.items.length ? "Naar benodigde items →" : "Start quest →"}
            </button>
          </>
        )}

        {/* Fase 1: items afvinken */}
        {quest && phase === "items" && (
          <>
            <div style={{ ...goldTitle, fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
              🎒 Verzamel deze items
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

        {/* Fase 2: stappen-wizard, elke stap eigen scherm */}
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
                <span>
                  {step.text}
                  {step.info.length > 0 && (
                    <button
                      onClick={() => setStepInfoOpen(!stepInfoOpen)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        verticalAlign: "middle",
                        marginLeft: 10,
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: stepInfoOpen ? C.ink : "transparent",
                        color: stepInfoOpen ? C.parch : C.ink,
                        border: `2px solid ${C.ink}`,
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "Georgia, serif",
                        lineHeight: 1,
                      }}
                    >
                      i
                    </button>
                  )}
                </span>
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
                {stepInfoOpen && step.info.length > 0 && (
                  <div
                    style={{
                      marginTop: 16,
                      paddingTop: 14,
                      borderTop: `1px dashed ${C.goldDim}`,
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    {step.info.map((inf, i) => (
                      <div key={i} style={{ padding: "3px 0" }}>
                        ℹ️ {inf}
                      </div>
                    ))}
                  </div>
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
                {isLast ? "Quest voltooid 🏆" : "Volgende ✓"}
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
                ← Vorige
              </button>
            </div>
          </>
        )}

        {/* Fase 3: voltooid */}
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
              Quest voltooid!
            </div>
            <div style={{ color: C.textDim, marginTop: 6 }}>
              {quest.name} is afgerond en uit je lijst gehaald.
            </div>
            <button
              onClick={() => setView("home")}
              style={{ ...bigBtn, marginTop: 26, maxWidth: 300 }}
            >
              Terug naar start
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
