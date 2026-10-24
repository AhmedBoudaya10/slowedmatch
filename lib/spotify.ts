import { HttpError, httpJson, httpText } from "./http";
import type { PlaylistResult, Track } from "./types";

const ID_RE = /(playlist|album|track)[/:]([A-Za-z0-9]{22})/i;
const BARE_ID_RE = /^[A-Za-z0-9]{22}$/;
const MAX_TRACKS = 500;

export class SpotifyError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SpotifyError";
    this.status = status;
  }
}

export type SpotifyLink = {
  kind: "playlist" | "album" | "track";
  id: string;
};

export function parseSpotifyLink(input: string): SpotifyLink | null {
  const raw = input.trim();
  if (!raw) return null;

  const match = raw.match(ID_RE);
  if (match) {
    return {
      kind: match[1].toLowerCase() as SpotifyLink["kind"],
      id: match[2],
    };
  }

  if (BARE_ID_RE.test(raw)) return { kind: "playlist", id: raw };
  return null;
}

/* ------------------------------------------------------------------ */
/* Anonymous web-player token (works on some networks, fails on others) */
/* ------------------------------------------------------------------ */

let tokenCache: { value: string; expires: number } | null = null;

async function anonToken(): Promise<string> {
  if (tokenCache && tokenCache.expires > Date.now() + 30_000) {
    return tokenCache.value;
  }

  const data = await httpJson<{
    accessToken?: string;
    accessTokenExpirationTimestampMs?: number;
  }>("https://open.spotify.com/get_access_token?reason=transport&productType=web_player", {
    headers: {
      accept: "application/json",
      referer: "https://open.spotify.com/",
      "app-platform": "WebPlayer",
    },
    timeoutMs: 6000,
  });

  if (!data.accessToken) throw new HttpError("No Spotify token returned.", 401);

  const expires = Number(data.accessTokenExpirationTimestampMs);
  tokenCache = {
    value: data.accessToken,
    expires: Number.isFinite(expires) && expires > Date.now() ? expires : Date.now() + 30 * 60_000,
  };
  return tokenCache.value;
}

/* ------------------------------------------------------------------ */
/* API path                                                           */
/* ------------------------------------------------------------------ */

function mapApiTrack(input: unknown): Track | null {
  if (!input || typeof input !== "object") return null;
  const t = input as Record<string, any>;

  if (t.type && t.type !== "track") return null;
  if (t.is_local) return null;

  const title = typeof t.name === "string" ? t.name.trim() : "";
  const artists = Array.isArray(t.artists)
    ? t.artists.map((a: any) => (typeof a?.name === "string" ? a.name : "")).filter(Boolean)
    : [];
  if (!title || !artists.length) return null;

  const images = t.album?.images;
  return {
    id: typeof t.id === "string" ? t.id : "",
    title,
    artist: artists.join(", "),
    album: typeof t.album?.name === "string" ? t.album.name : undefined,
    durationMs: typeof t.duration_ms === "number" ? t.duration_ms : undefined,
    cover: Array.isArray(images) && images[0]?.url ? images[0].url : undefined,
    url: t.external_urls?.spotify,
  };
}

async function apiPage(
  id: string,
  offset: number,
  headers: Record<string, string>,
): Promise<any> {
  let lastError: unknown = null;

  for (const segment of ["items", "tracks"]) {
    try {
      return await httpJson<any>(
        `https://api.spotify.com/v1/playlists/${id}/${segment}?limit=100&offset=${offset}`,
        { headers, timeoutMs: 9000 },
      );
    } catch (err) {
      lastError = err;
      if (err instanceof HttpError && (err.status === 404 || err.status === 400)) continue;
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Playlist page failed.");
}

async function playlistViaApi(id: string): Promise<PlaylistResult> {
  const token = await anonToken();
  const headers = { authorization: `Bearer ${token}`, accept: "application/json" };

  const meta = await httpJson<any>(`https://api.spotify.com/v1/playlists/${id}?limit=100`, {
    headers,
    timeoutMs: 9000,
  });

  const first: any[] = meta.items ?? meta.tracks?.items ?? [];
  const total = Number(meta.items?.total ?? meta.tracks?.total ?? first.length);

  const tracks: Track[] = [];
  const seen = new Set<string>();

  const push = (items: any[]) => {
    for (const item of items) {
      const track = mapApiTrack(item?.track ?? item?.item ?? item);
      if (!track) continue;
      const key = track.id || `${track.title}|${track.artist}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tracks.push(track);
    }
  };

  push(first);

  let offset = first.length;
  while (first.length > 0 && offset < Math.min(total, MAX_TRACKS)) {
    const page = await apiPage(id, offset, headers);
    const items: any[] = page?.items ?? [];
    if (!items.length) break;
    push(items);
    offset += items.length;
  }

  return {
    provider: "spotify",
    kind: "playlist",
    id,
    name: typeof meta.name === "string" ? meta.name : "Spotify playlist",
    owner: meta.owner?.display_name,
    cover: Array.isArray(meta.images) && meta.images[0]?.url ? meta.images[0].url : undefined,
    tracks,
    total,
    truncated: tracks.length < total,
    source: "api",
  };
}

/* ------------------------------------------------------------------ */
/* Embed fallback (public page, no auth, 100 track ceiling)           */
/* ------------------------------------------------------------------ */

type EmbedEntity = {
  type?: string;
  uri?: string;
  name?: string;
  title?: string;
  subtitle?: string;
  duration?: number;
  artists?: { name?: string }[];
  coverArt?: { sources?: { url?: string }[] };
  visualIdentity?: { image?: { url?: string }[] };
  trackList?: {
    uri?: string;
    uid?: string;
    title?: string;
    subtitle?: string;
    duration?: number;
  }[];
};

async function viaEmbed(kind: SpotifyLink["kind"], id: string): Promise<PlaylistResult> {
  const html = await httpText(`https://open.spotify.com/embed/${kind}/${id}`, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
      referer: "https://open.spotify.com/",
    },
    timeoutMs: 12000,
  });

  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) {
    throw new SpotifyError(
      "Couldn't read that Spotify page. Make sure the link is public and points at a playlist.",
      404,
    );
  }

  let data: any;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new SpotifyError("Couldn't read that Spotify page.", 502);
  }

  const entity: EmbedEntity | undefined =
    data?.props?.pageProps?.state?.data?.entity;
  if (!entity) {
    throw new SpotifyError(
      "Spotify didn't return this playlist. It may be private, region-locked, or deleted.",
      404,
    );
  }

  const name = entity.name || entity.title || "Spotify playlist";
  const cover =
    entity.coverArt?.sources?.[0]?.url || entity.visualIdentity?.image?.[0]?.url;

  if (kind === "track" || entity.type === "track") {
    const trackId = String(entity.uri || `spotify:track:${id}`).split(":").pop() || id;
    const track: Track = {
      id: trackId,
      title: entity.title || entity.name || "Unknown track",
      artist:
        entity.subtitle ||
        entity.artists?.map((a) => a.name).filter(Boolean).join(", ") ||
        "Unknown artist",
      durationMs: entity.duration,
      cover,
      url: `https://open.spotify.com/track/${trackId}`,
    };
    return {
      provider: "spotify",
      kind: "track",
      id,
      name: track.title,
      owner: track.artist,
      cover,
      tracks: [track],
      total: 1,
      truncated: false,
      source: "embed",
    };
  }

  const list = Array.isArray(entity.trackList) ? entity.trackList : [];
  const tracks: Track[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    const title = (item.title || "").trim();
    if (!title) continue;

    const trackId =
      String(item.uri || "").split(":").pop() || item.uid || `track-${tracks.length}`;
    const key = trackId || `${title}|${item.subtitle || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    tracks.push({
      id: trackId,
      title,
      artist: (item.subtitle || "Unknown artist").trim(),
      durationMs: typeof item.duration === "number" ? item.duration : undefined,
      cover: kind === "album" ? cover : undefined,
      url: trackId ? `https://open.spotify.com/track/${trackId}` : undefined,
    });
  }

  const truncated = kind === "playlist" && tracks.length >= 100;

  return {
    provider: "spotify",
    kind,
    id,
    name,
    owner: entity.subtitle,
    cover,
    tracks,
    total: tracks.length,
    truncated,
    source: "embed",
    note: truncated
      ? "Spotify's public player only exposes the first 100 tracks of a playlist."
      : undefined,
  };
}

/* ------------------------------------------------------------------ */

export async function resolvePlaylist(input: string): Promise<PlaylistResult> {
  const parsed = parseSpotifyLink(input);
  if (!parsed) {
    throw new SpotifyError(
      "That doesn't look like a Spotify link. In Spotify use Share → Copy link to playlist.",
      400,
    );
  }

  if (parsed.kind === "playlist") {
    try {
      const viaApi = await playlistViaApi(parsed.id);
      if (viaApi.tracks.length > 0) return viaApi;
    } catch {
      // Token endpoint is often blocked from datacenter IPs — fall through.
    }
  }

  return viaEmbed(parsed.kind, parsed.id);
}
