import { NextResponse } from "next/server";
import { resolvePlaylist, SpotifyError } from "@/lib/spotify";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = (searchParams.get("url") ?? "").trim();

  if (!url) {
    return NextResponse.json(
      { error: "Paste a Spotify playlist link first." },
      { status: 400 },
    );
  }

  if (url.length > 500) {
    return NextResponse.json({ error: "That link is too long." }, { status: 400 });
  }

  try {
    const playlist = await resolvePlaylist(url);

    if (!playlist.tracks.length) {
      return NextResponse.json(
        { error: "That playlist is empty, or Spotify didn't share its tracks." },
        { status: 404 },
      );
    }

    return NextResponse.json(playlist, {
      headers: {
        "cache-control": "public, s-maxage=600, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    const status = error instanceof SpotifyError ? error.status : 502;
    const message =
      error instanceof Error ? error.message : "Couldn't load that playlist.";
    return NextResponse.json({ error: message }, { status });
  }
}
