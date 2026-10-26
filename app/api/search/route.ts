import { NextResponse } from "next/server";
import { findMatches } from "@/lib/match";
import { MODES } from "@/lib/modes";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const song = (searchParams.get("song") ?? "").trim();
  const artist = (searchParams.get("artist") ?? "").trim();
  const durationParam = Number(searchParams.get("dur") ?? 0);
  // Unknown modes fall back to the default so old links keep working.
  const mode = MODES.find((item) => item.id === searchParams.get("mode"))?.id ?? "slowed";

  if (!song) {
    return NextResponse.json({ error: "Missing song title." }, { status: 400 });
  }
  if (song.length > 200 || artist.length > 200) {
    return NextResponse.json({ error: "Track name is too long." }, { status: 400 });
  }

  const durationSec =
    Number.isFinite(durationParam) && durationParam > 0 ? durationParam : undefined;

  try {
    const result = await findMatches(
      {
        id: "",
        title: song,
        artist,
        durationMs: durationSec ? durationSec * 1000 : undefined,
      },
      mode,
    );

    return NextResponse.json(result, {
      headers: {
        "cache-control": "public, s-maxage=1209600, stale-while-revalidate=2592000",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
