import { NextResponse } from "next/server";

// Haalt de actuele tile-versie van de wiki-wereldkaart op.
// Die versie verandert bij game-updates, dus we lezen hem live uit.

export const revalidate = 86400; // 1x per dag verversen

export async function GET() {
  try {
    const res = await fetch(
      "https://maps.runescape.wiki/osrs/data/dataloader.json",
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) throw new Error("dataloader niet bereikbaar");

    const text = await res.text();
    // Versies hebben het formaat YYYY-MM-DD_1; pak de nieuwste
    const versions = Array.from(text.matchAll(/\d{4}-\d{2}-\d{2}_\d+/g)).map(
      (m) => m[0]
    );
    if (!versions.length) throw new Error("geen versie gevonden");
    versions.sort();

    return NextResponse.json({ cacheVersion: versions[versions.length - 1] });
  } catch {
    return NextResponse.json(
      { error: "Kaartconfiguratie niet beschikbaar" },
      { status: 502 }
    );
  }
}
