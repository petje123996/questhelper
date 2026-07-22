"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── OSRS Quest Helper ───────────────────────────────────────────
// Wizard-versie: eerst items afvinken, daarna elke stap in een
// eigen scherm. Volledige questlijst van de wiki op de startpagina.

const API = "https://oldschool.runescape.wiki/api.php";

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

type Step = { text: string; info: string[]; section: string };
type Item = { name: string; info: string | null };
type Quest = { name: string; steps: Step[]; items: Item[] };
type RecentItem = { name: string; done: number; total: number };

function cleanText(s: string): string {
  return s
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
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
function splitStep(raw: string, section: string): Step {
  const infos: string[] = [];
  const stripped = raw.replace(/\s*\(([^()]+)\)/g, (match, inner) => {
    const t = cleanText(inner);
    if (t.length >= 12) {
      infos.push(t);
      return "";
    }
    return match;
  });
  return { text: cleanText(stripped), info: infos, section };
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

// Zet wiki-HTML om naar een platte stappenlijst + benodigde items
function parseGuide(html: string): { steps: Step[]; items: Item[] } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;

  root
    .querySelectorAll(
      ".navbox, .references, .reference, #toc, .toc, .mw-editsection, .messagebox, .infobox, style, script, sup"
    )
    .forEach((el) => el.remove());

  const items: Item[] = [];
  const details = root.querySelector("table.questdetails");
  if (details) {
    details.querySelectorAll("tr").forEach((tr) => {
      const th = tr.querySelector("th");
      if (th && /item/i.test(th.textContent || "")) {
        tr.querySelectorAll("li").forEach((li) => {
          const t = cleanText(li.textContent || "");
          if (t) items.push(splitItem(t));
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
      const t = cleanText(clone.textContent || "");
      if (t) steps.push(splitStep(t, sectionTitle));
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

  return { steps, items };
}

export default function QuestHelper() {
  const [view, setView] = useState<"home" | "quest">("home");
  const [phase, setPhase] = useState<"items" | "steps" | "done">("items");
  const [query, setQuery] = useState("");
  const [suggest, setSuggest] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [allQuests, setAllQuests] = useState<string[]>(POPULAR);
  const [quest, setQuest] = useState<Quest | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [itemsChecked, setItemsChecked] = useState<Set<number>>(new Set());
  const [openInfo, setOpenInfo] = useState<number | null>(null);
  const [stepInfoOpen, setStepInfoOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    const r = loadStored("qh-recent");
    if (Array.isArray(r)) {
      // Voltooide quests (ook uit oudere versies) uit de lijst filteren
      const active = r.filter(
        (x: RecentItem) => x && x.total > 0 && x.done < x.total
      );
      setRecent(active);
      if (active.length !== r.length) saveStored("qh-recent", active);
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
      let p: "items" | "steps" = "items";
      let step = 0;
      let items = new Set<number>();
      if (saved && saved.phase !== "done") {
        if (saved.phase === "steps") p = "steps";
        step = Math.min(saved.step || 0, q.steps.length - 1);
        items = new Set<number>(
          (saved.items || []).filter((i: number) => i < q.items.length)
        );
      }
      if (!q.items.length) p = "steps";

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
      // Quest voltooid
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

          <div style={{ marginTop: 26 }}>
            <div style={{ ...goldTitle, fontSize: 15, marginBottom: 8 }}>
              Alle quests
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {allQuests
                .filter((n) => !recentNames.has(n))
                .map((n) => (
                  <button
                    key={n}
                    onClick={() => openQuest(n)}
                    style={{
                      padding: "9px 13px",
                      background: C.panelSoft,
                      color: C.parch,
                      border: `1px solid ${C.border}`,
                      borderRadius: 20,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {n}
                  </button>
                ))}
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
