"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── OSRS Quest Helper ───────────────────────────────────────────
// Haalt quick guides live van de OSRS Wiki, afvinkbare stappen,
// voortgang wordt bewaard in localStorage.

const API = "https://oldschool.runescape.wiki/api.php";

const C = {
  bg: "#26211A",
  panel: "#332C22",
  panelSoft: "#3B342A",
  border: "#57492F",
  borderSoft: "#463C2C",
  gold: "#E7B84C",
  goldDim: "#B08A3E",
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

type Step = { text: string; depth: number; idx: number };
type Section = { title: string; steps: Step[] };
type Quest = { name: string; sections: Section[]; items: string[]; total: number };
type RecentItem = { name: string; done: number; total: number };

function cleanText(s: string): string {
  return s.replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
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

const storageKey = (name: string) => "qh-quest-" + name.replace(/[\s/\\'"]+/g, "_");

// Zet wiki-HTML om naar secties met stappen + benodigde items
function parseGuide(html: string): { sections: Section[]; items: string[]; total: number } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;

  root
    .querySelectorAll(
      ".navbox, .references, .reference, #toc, .toc, .mw-editsection, .messagebox, .infobox, style, script, sup"
    )
    .forEach((el) => el.remove());

  const items: string[] = [];
  const details = root.querySelector("table.questdetails");
  if (details) {
    details.querySelectorAll("tr").forEach((tr) => {
      const th = tr.querySelector("th");
      if (th && /item/i.test(th.textContent || "")) {
        tr.querySelectorAll("li").forEach((li) => {
          const t = cleanText(li.textContent || "");
          if (t) items.push(t);
        });
      }
    });
    details.remove();
  }

  const SKIP = /reference|navigat|see also|trivia|gallery|changes|reward/i;
  const sections: Section[] = [];
  let current: { title: string; steps: { text: string; depth: number }[] } = {
    title: "Walkthrough",
    steps: [],
  };
  let skipping = false;

  const pushLis = (listEl: Element, depth: number) => {
    Array.from(listEl.children).forEach((li) => {
      if (li.tagName !== "LI") return;
      const clone = li.cloneNode(true) as Element;
      clone.querySelectorAll("ul, ol").forEach((n) => n.remove());
      const t = cleanText(clone.textContent || "");
      if (t) current.steps.push({ text: t, depth });
      li.querySelectorAll(":scope > ul, :scope > ol").forEach((sub) =>
        pushLis(sub, depth + 1)
      );
    });
  };

  const walk = (node: Element) => {
    Array.from(node.children).forEach((child) => {
      const tag = child.tagName;
      if (tag === "H2" || tag === "H3") {
        const title = cleanText(child.textContent || "");
        skipping = SKIP.test(title);
        if (!skipping) {
          if (current.steps.length) sections.push(current as Section);
          current = { title, steps: [] };
        }
        return;
      }
      if (skipping) return;
      if (tag === "UL" || tag === "OL") {
        if (!child.closest("table")) pushLis(child, 0);
        return;
      }
      if (tag === "DIV" || tag === "SECTION") walk(child);
    });
  };
  walk(root);
  if (current.steps.length) sections.push(current as Section);

  let idx = 0;
  sections.forEach((s) => s.steps.forEach((st) => (st.idx = idx++)));
  return { sections, items, total: idx };
}

export default function QuestHelper() {
  const [view, setView] = useState<"home" | "quest">("home");
  const [query, setQuery] = useState("");
  const [suggest, setSuggest] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [quest, setQuest] = useState<Quest | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<any>(null);
  const currentRef = useRef<any>(null);

  useEffect(() => {
    const r = loadStored("qh-recent");
    if (r) setRecent(r);
  }, []);

  // Wiki-zoeksuggesties + lokale lijst
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setSuggest([]);
      return;
    }
    const local = POPULAR.filter((n) => n.toLowerCase().includes(q));
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
  }, [query]);

  const saveRecent = useCallback((name: string, done: number, total: number) => {
    setRecent((prev) => {
      const next = [
        { name, done, total },
        ...prev.filter((r) => r.name !== name),
      ].slice(0, 8);
      saveStored("qh-recent", next);
      return next;
    });
  }, []);

  const openQuest = async (name: string) => {
    setLoading(true);
    setError(null);
    setView("quest");
    setQuest(null);
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
      if (!parsed.total) {
        throw new Error("Geen stappen gevonden voor deze pagina.");
      }
      const displayName = String(data.parse.title).replace("/Quick guide", "");
      const saved = loadStored(storageKey(displayName));
      const savedChecked: number[] = saved?.checked || [];
      const set = new Set(savedChecked.filter((i) => i < parsed.total));
      setQuest({ name: displayName, ...parsed });
      setChecked(set);
      saveRecent(displayName, set.size, parsed.total);
    } catch (e: any) {
      setError(e?.message || "Laden mislukt. Controleer je verbinding.");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (i: number) => {
    if (!quest) return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      saveStored(storageKey(quest.name), { checked: Array.from(next) });
      saveRecent(quest.name, next.size, quest.total);
      return next;
    });
  };

  const firstOpenIdx = (): number | null => {
    if (!quest) return null;
    for (let i = 0; i < quest.total; i++) {
      if (!checked.has(i)) return i;
    }
    return null;
  };
  const firstOpen = firstOpenIdx();

  const completeCurrent = () => {
    if (firstOpen == null) return;
    toggle(firstOpen);
    setTimeout(() => {
      if (currentRef.current) {
        currentRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 120);
  };

  const resetQuest = () => {
    if (!quest) return;
    setChecked(new Set());
    saveStored(storageKey(quest.name), { checked: [] });
    saveRecent(quest.name, 0, quest.total);
  };

  const done = checked.size;
  const pct = quest && quest.total ? Math.round((done / quest.total) * 100) : 0;

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
                  <button
                    key={r.name}
                    onClick={() => openQuest(r.name)}
                    style={{
                      ...card,
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 14px",
                      marginBottom: 8,
                      cursor: "pointer",
                      color: C.text,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.parch, fontWeight: 600 }}>{r.name}</span>
                      <span
                        style={{
                          color: p === 100 ? C.green : C.gold,
                          fontSize: 13,
                        }}
                      >
                        {p === 100 ? "Voltooid ✓" : p + "%"}
                      </span>
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
                          background: p === 100 ? C.green : C.gold,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {recent.length === 0 && !query && (
            <div style={{ marginTop: 26 }}>
              <div style={{ ...goldTitle, fontSize: 15, marginBottom: 8 }}>
                Populaire quests
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {POPULAR.slice(0, 12).map((n) => (
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
          )}
        </div>
      </div>
    );
  }

  // ── Quest-weergave ──
  return (
    <div style={frame}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
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
            {quest && (
              <div style={{ fontSize: 12, color: C.textDim }}>
                {done}/{quest.total} stappen · {pct}%
              </div>
            )}
          </div>
          {quest && (
            <button
              onClick={resetQuest}
              style={{
                background: "transparent",
                border: `1px solid ${C.borderSoft}`,
                color: C.textDim,
                borderRadius: 8,
                padding: "7px 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          )}
        </div>
        {quest && (
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
                background: pct === 100 ? C.green : C.gold,
                transition: "width .3s",
              }}
            />
          </div>
        )}
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "14px 14px 110px" }}>
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

        {quest && quest.items.length > 0 && (
          <div style={{ ...card, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ ...goldTitle, fontSize: 14, marginBottom: 6 }}>
              🎒 Benodigde items
            </div>
            {quest.items.map((it, i) => (
              <div key={i} style={{ fontSize: 14, padding: "3px 0", color: C.text }}>
                • {it}
              </div>
            ))}
          </div>
        )}

        {quest &&
          quest.sections.map((sec) => (
            <div key={sec.title} style={{ marginBottom: 18 }}>
              <div
                style={{
                  ...goldTitle,
                  fontSize: 15,
                  fontWeight: 700,
                  margin: "4px 2px 8px",
                }}
              >
                {sec.title}
              </div>
              {sec.steps.map((st) => {
                const isDone = checked.has(st.idx);
                const isCurrent = st.idx === firstOpen;
                return (
                  <button
                    key={st.idx}
                    ref={isCurrent ? currentRef : null}
                    onClick={() => toggle(st.idx)}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      width: "100%",
                      textAlign: "left",
                      boxSizing: "border-box",
                      padding: "12px 14px",
                      marginBottom: 6,
                      marginLeft: st.depth * 14,
                      maxWidth: `calc(100% - ${st.depth * 14}px)`,
                      borderRadius: 10,
                      cursor: "pointer",
                      background: isCurrent ? C.parch : isDone ? C.panel : C.panelSoft,
                      color: isCurrent ? C.ink : isDone ? C.textDim : C.parch,
                      border: isCurrent
                        ? `2px solid ${C.gold}`
                        : `1px solid ${C.borderSoft}`,
                      textDecoration: isDone ? "line-through" : "none",
                      fontSize: 15,
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: 22,
                        height: 22,
                        marginTop: 1,
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        background: isDone ? C.green : "transparent",
                        color: isDone ? C.bg : "transparent",
                        border: isDone
                          ? `1px solid ${C.green}`
                          : `2px solid ${isCurrent ? C.goldDim : C.border}`,
                      }}
                    >
                      ✓
                    </span>
                    <span>{st.text}</span>
                  </button>
                );
              })}
            </div>
          ))}

        {quest && pct === 100 && (
          <div
            style={{
              ...card,
              borderColor: C.green,
              padding: 18,
              textAlign: "center",
              color: C.green,
              fontWeight: 700,
              fontSize: 17,
            }}
          >
            🏆 Quest voltooid!
          </div>
        )}
      </div>

      {quest && firstOpen != null && !loading && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "10px 14px 16px",
            background: `linear-gradient(transparent, ${C.bg} 35%)`,
          }}
        >
          <button
            onClick={completeCurrent}
            style={{
              display: "block",
              width: "100%",
              maxWidth: 560,
              margin: "0 auto",
              padding: "15px",
              fontSize: 17,
              fontWeight: 700,
              background: C.gold,
              color: C.ink,
              border: "none",
              borderRadius: 12,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(0,0,0,.45)",
            }}
          >
            Stap klaar ✓
          </button>
        </div>
      )}
    </div>
  );
}
