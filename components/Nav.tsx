"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { C } from "@/lib/theme";

const LINKS: { href: string; label: string; icon: string }[] = [
  { href: "/", label: "Quests", icon: "⚔️" },
  { href: "/map", label: "World map", icon: "🗺️" },
  { href: "/prices", label: "GE Prices", icon: "💰" },
  { href: "/diaries", label: "Achievement Diaries", icon: "📔" },
  { href: "/profile", label: "Profile", icon: "👤" },
];

export default function Nav({ buttonStyle }: { buttonStyle?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Menu"
        style={{
          background: "transparent",
          border: `1px solid ${C.borderSoft}`,
          color: C.gold,
          borderRadius: 8,
          padding: "7px 10px",
          fontSize: 15,
          cursor: "pointer",
          lineHeight: 1,
          flexShrink: 0,
          ...buttonStyle,
        }}
      >
        ☰
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.7)",
            zIndex: 300,
            display: "flex",
            alignItems: "stretch",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(78vw, 300px)",
              background: C.bg,
              borderRight: `2px solid ${C.gold}`,
              padding: "18px 14px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                color: C.gold,
                fontSize: 18,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              ⚔️ Quest Helper
            </div>
            {LINKS.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 14px",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 600,
                    textDecoration: "none",
                    background: active ? C.panelSoft : "transparent",
                    color: active ? C.gold : C.text,
                    border: `1px solid ${active ? C.border : "transparent"}`,
                  }}
                >
                  <span>{l.icon}</span>
                  <span>{l.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
