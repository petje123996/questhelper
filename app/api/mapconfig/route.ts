import { NextResponse } from "next/server";

// Fetches the current tile version of the wiki world map.
// It changes with game updates, so we read it live.

export const revalidate = 86400; // refresh once a day

export async function GET() {
  try {
    const res = await fetch(
      "https://maps.runescape.wiki/osrs/data/dataloader.json",
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) throw new Error("dataloader unreachable");

    const text = await res.text();
    // Versions look like YYYY-MM-DD_1; pick the newest
    const versions = Array.from(text.matchAll(/\d{4}-\d{2}-\d{2}_\d+/g)).map(
      (m) => m[0]
    );
    if (!versions.length) throw new Error("no version found");
    versions.sort();

    return NextResponse.json({ cacheVersion: versions[versions.length - 1] });
  } catch {
    return NextResponse.json(
      { error: "Map configuration unavailable" },
      { status: 502 }
    );
  }
}
