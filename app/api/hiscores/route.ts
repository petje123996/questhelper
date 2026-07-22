import { NextResponse } from "next/server";

// Fetches OSRS hiscores server-side, because Jagex blocks
// direct browser requests (CORS).

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const player = searchParams.get("player");

  if (!player || player.length > 12) {
    return NextResponse.json({ error: "Invalid player name" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://secure.runescape.com/m=hiscore_oldschool/index_lite.json?player=${encodeURIComponent(
        player
      )}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Hiscores unavailable" },
      { status: 502 }
    );
  }
}
