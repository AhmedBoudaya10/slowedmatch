import type { PlaylistResult, Track, VideoCandidate } from "./types";

const NS = "slowedmatch:v1";
const MATCH_TTL = 14 * 24 * 60 * 60 * 1000;
const PLAYLIST_TTL = 6 * 60 * 60 * 1000;

export function normKey(input: string): string {
  return (
    input
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim() || input.trim().toLowerCase()
  );
}

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or disabled — caching is optional.
  }
}

type CachedMatch = {
  at: number;
  candidates: VideoCandidate[];
  query: string;
  via: string;
};

function matchKey(track: Track): string {
  return `${NS}:match:${normKey(track.title)}|${normKey(track.artist)}`;
}

export function getCachedMatch(track: Track): CachedMatch | null {
  const data = read<CachedMatch>(matchKey(track));
  if (!data?.at || Date.now() - data.at > MATCH_TTL) return null;
  return data;
}

export function setCachedMatch(
  track: Track,
  value: { candidates: VideoCandidate[]; query: string; via: string },
): void {
  write(matchKey(track), { at: Date.now(), ...value });
}

export function getCachedPlaylist(url: string): PlaylistResult | null {
  const data = read<{ at: number; playlist: PlaylistResult }>(
    `${NS}:playlist:${normKey(url)}`,
  );
  if (!data?.at || Date.now() - data.at > PLAYLIST_TTL) return null;
  return data.playlist;
}

export function setCachedPlaylist(url: string, playlist: PlaylistResult): void {
  write(`${NS}:playlist:${normKey(url)}`, { at: Date.now(), playlist });
}

export function saveRecentUrl(url: string): void {
  write(`${NS}:recent`, url);
}

export function getRecentUrl(): string {
  return read<string>(`${NS}:recent`) ?? "";
}

/* ------------------------------------------------------------------ */

export function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return "";
  const total = Math.round(ms / 1000);
  return formatClock(total);
}

export function formatClock(seconds?: number | null): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "";
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${m}:${String(rest).padStart(2, "0")}`;
}

export function formatViews(views?: number | null): string {
  if (!views || views < 1) return "";
  if (views >= 1e9) return `${(views / 1e9).toFixed(1)}B views`;
  if (views >= 1e6) return `${(views / 1e6).toFixed(1)}M views`;
  if (views >= 1e3) return `${(views / 1e3).toFixed(1)}K views`;
  return `${views} views`;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** One-shot anonymous YouTube playlist (no API needed). Watch_videos caps at ~50. */
export function playAllUrl(videoIds: string[], max = 50): string {
  return `https://www.youtube.com/watch_videos?video_ids=${videoIds.slice(0, max).join(",")}`;
}

export function searchUrl(track: Track): string {
  const query = `${track.title} ${track.artist} slowed reverb`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

/* ------------------------------------------------------------------ */

export function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function toCsv(rows: { track: Track; candidates?: VideoCandidate[] }[]): string {
  const header = [
    "Track",
    "Artist",
    "Album",
    "Match confidence",
    "Video title",
    "Channel",
    "Length",
    "YouTube URL",
  ];

  const lines = rows.map(({ track, candidates }) => {
    const best = candidates?.[0];
    return [
      track.title,
      track.artist,
      track.album ?? "",
      best?.confidence ?? "none",
      best?.title ?? "",
      best?.channel ?? "",
      best?.durationSec ? formatClock(best.durationSec) : "",
      best ? watchUrl(best.videoId) : "",
    ]
      .map(csvCell)
      .join(",");
  });

  return [header.map(csvCell).join(","), ...lines].join("\r\n");
}

export function toJson(
  playlist: PlaylistResult,
  rows: { track: Track; candidates?: VideoCandidate[] }[],
): string {
  return JSON.stringify(
    {
      playlist: {
        name: playlist.name,
        owner: playlist.owner,
        url: `https://open.spotify.com/playlist/${playlist.id}`,
        total: playlist.total,
      },
      exportedAt: new Date().toISOString(),
      tracks: rows.map(({ track, candidates }) => ({
        track,
        best: candidates?.[0] ?? null,
        alternatives: candidates?.slice(1) ?? [],
      })),
    },
    null,
    2,
  );
}
