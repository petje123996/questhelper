import type { CSSProperties } from "react";

export const C = {
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
  qRed: "#E05C5C",
  qYellow: "#E7C84C",
  qGreen: "#7CC763",
};

export const frame: CSSProperties = {
  minHeight: "100vh",
  background: C.bg,
  color: C.text,
  fontFamily: "system-ui, sans-serif",
  fontSize: 15,
  lineHeight: 1.45,
};

export const goldTitle: CSSProperties = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  color: C.gold,
  letterSpacing: 0.5,
};

export const card: CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.borderSoft}`,
  borderRadius: 10,
};

export const bigBtn: CSSProperties = {
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

export const ghostBtn: CSSProperties = {
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
  boxSizing: "border-box",
  textAlign: "center",
};

export const chip: CSSProperties = {
  padding: "6px 12px",
  background: C.panelSoft,
  border: `1px solid ${C.border}`,
  borderRadius: 20,
  fontSize: 13,
  color: C.parch,
};

export const headBtn: CSSProperties = {
  background: "transparent",
  border: `1px solid ${C.borderSoft}`,
  color: C.gold,
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 15,
  cursor: "pointer",
};

export const dashed: CSSProperties = {
  borderTop: `1px dashed ${C.goldDim}`,
  margin: "14px 0 0",
};

export const toolChip: CSSProperties = {
  padding: "7px 12px",
  background: "rgba(58,46,25,.08)",
  color: C.ink,
  border: "1.5px solid rgba(58,46,25,.45)",
  borderRadius: 16,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

export const toolIcon: CSSProperties = {
  ...toolChip,
  width: 34,
  height: 34,
  padding: 0,
  borderRadius: "50%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 15,
};
