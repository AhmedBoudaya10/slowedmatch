import { searchYouTube } from "./youtube";
import type {
  Confidence,
  RawVideo,
  SearchResponse,
  Track,
  VideoCandidate,
} from "./types";

/* ------------------------------------------------------------------ */
/* Stage 1 — normalize                                                */
/* ------------------------------------------------------------------ */

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "of", "to", "in", "on", "for", "with", "my", "me",
  "i", "you", "it", "is", "at", "by", "feat", "ft", "featuring", "prod",
  "remix", "version", "edit", "radio", "original", "official", "video",
  "audio", "lyric", "lyrics", "visualizer", "hd", "hq", "4k", "explicit",
  "clean", "album", "single", "deluxe", "bonus", "track", "from",
]);

/** Reject results that are clearly a different treatment of the song. */
const HARD_BLOCK: RegExp[] = [
  /\bsped\s*up\b/,
  /\bspeed\s*up\b/,
  /\bnightcore\b/,
  /\bdaycore\b/,
  /\b8\s*d\b/,
  /\bbass\s*boost(ed)?\b/,
  /\bkaraoke\b/,
  /\binstrumental\b/,
  /\bcover\b/,
  /\breaction\b/,
  /\bmashup\b/,
  /\bmedley\b/,
  /\bloop(ed)?\b/,
  /\b1\s*hour\b/,
  /\bone\s*hour\b/,
  /\blive\s+(at|from|in)\b/,
  /\bfull\s+album\b/,
];

export function norm(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokenize(input: string): string[] {
  return norm(input)
    .split(" ")
    .filter(
      (token) =>
        (token.length > 1 || /[^\u0000-\u007f]/.test(token)) &&
        !STOP_WORDS.has(token),
    );
}

function stripFeature(input: string): string {
  return input
    .replace(/\((?:feat\.?|ft\.?|with|prod\.?)[^)]*\)/gi, " ")
    .replace(/\[(?:feat\.?|ft\.?|with|prod\.?)[^\]]*\]/gi, " ")
    .replace(/\s+-\s+(?:remaster(?:ed)?|radio edit|single version|explicit).*$/i, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Remove marketing cruft Spotify sometimes carries in titles. */
function stripNoise(input: string): string {
  return input
    .replace(
      /[([{](?:official|lyrics?|audio|video|visualizer|hd|4k|explicit|clean|remaster(?:ed)?|mono|stereo|deluxe|anniversary|bonus)[^)\]}]*[)\]}]]/gi,
      " ",
    )
    .replace(/\s*[-–—]\s*(?:remaster(?:ed)?(?:\s*\d{4})?|radio edit|single version|album version)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type NormalizedTrack = {
  title: string;
  coreTitle: string;
  artists: string[];
  primaryArtist: string;
  durationSec: number;
};

export function normalizeTrack(track: Track): NormalizedTrack {
  const title = stripNoise(stripFeature(track.title)) || track.title;
  const artists = track.artist
    .split(/\s*(?:,|&|feat\.?|ft\.?|\bx\b|×)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    title,
    coreTitle: title,
    artists,
    primaryArtist: artists[0] ?? "",
    durationSec: track.durationMs ? Math.round(track.durationMs / 1000) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Query variants                                                     */
/* ------------------------------------------------------------------ */

export function buildQueries(track: Track): string[] {
  const { coreTitle, primaryArtist } = normalizeTrack(track);
  const title = coreTitle || track.title;

  const queries = [
    `${title} ${primaryArtist} slowed reverb`,
    `${title} slowed + reverb`,
    `${title} ${primaryArtist} slowed down`,
  ];

  return [...new Set(queries.map((q) => q.replace(/\s{2,}/g, " ").trim()).filter(Boolean))];
}

/* ------------------------------------------------------------------ */
/* Stage 3 — weighted scoring                                         */
/* ------------------------------------------------------------------ */

export const SIGNAL_WEIGHTS = {
  title: 0.3,
  artist: 0.25,
  duration: 0.15,
  evidence: 0.2,
  quality: 0.1,
} as const;

type Signals = {
  title: number;
  artist: number;
  duration: number;
  evidence: number;
  quality: number;
};

function titleSignal(trackTitle: string, videoTitle: string): number {
  const variants = [trackTitle, stripFeature(trackTitle), trackTitle.split(" - ")[0]];
  const video = ` ${norm(videoTitle)} `;

  let best = 0;

  for (const variant of variants) {
    const phrase = norm(variant);
    if (!phrase) continue;

    if (video.includes(` ${phrase} `)) return 1;

    const wanted = tokenize(variant);
    if (!wanted.length) continue;

    const haystack = new Set(tokenize(videoTitle));
    const hits = wanted.filter((token) => haystack.has(token)).length;
    const ratio = hits / wanted.length;

    let score = 0;
    if (ratio >= 0.85) score = 0.9;
    else if (ratio >= 0.6) score = 0.7;
    else if (ratio >= 0.4) score = 0.4;

    if (score > best) best = score;
  }

  return best;
}

function artistSignal(normalized: NormalizedTrack, videoTitle: string, channel: string): number {
  const { artists } = normalized;
  if (!artists.length) return 0.5;

  const title = ` ${norm(videoTitle)} `;
  const chan = ` ${norm(channel)} `;
  const parts = artists
    .map((part) => norm(part))
    .filter((part) => part.length >= 2);

  if (!parts.length) return 0.5;

  let best = 0;
  for (const part of parts) {
    if (title.includes(part) || chan.includes(part)) best = Math.max(best, 1);
    else {
      const words = part.split(" ").filter((w) => w.length > 3);
      if (words.some((w) => title.includes(w) || chan.includes(w))) {
        best = Math.max(best, 0.55);
      }
    }
  }

  return best;
}

function durationSignal(trackSeconds: number, videoSeconds: number | null): number {
  if (!trackSeconds || !videoSeconds) return 0.5;

  const ratio = videoSeconds / trackSeconds;

  // Slowed versions run longer than the original: 0.95×–1.5× is ideal.
  if (ratio >= 0.95 && ratio <= 1.5) return 1;
  if (ratio >= 0.85 && ratio <= 1.8) return 0.7;
  if (ratio >= 0.7 && ratio <= 2.2) return 0.35;
  if (ratio > 2.2) return 0;
  return 0.15;
}

function evidenceSignal(videoTitle: string): { value: number; slowed: boolean; reverb: boolean } {
  const title = norm(videoTitle);
  const slowed = /\bslow(?:ed|ing)?\b/.test(title) || /\bslowed\s*down\b/.test(title);
  const reverb = /\breverb/.test(title);

  if (slowed && reverb) return { value: 1, slowed, reverb };
  if (slowed) return { value: 0.55, slowed, reverb };
  if (reverb) return { value: 0.4, slowed, reverb };
  return { value: 0, slowed, reverb };
}

function qualitySignal(video: RawVideo, channel: string): number {
  let value = 0.4;

  if (video.views) value += Math.min(0.4, Math.log10(video.views + 1) / 16);
  if (video.durationSec) {
    if (video.durationSec >= 45) value += 0.1;
    if (video.durationSec > 720) value -= 0.35;
  }

  const channelNorm = norm(channel);
  if (/\btopic\b|\bvevo\b/.test(channelNorm)) value -= 0.2;
  if (/\bslowed\b|\breverb\b|\baesthetic\b/.test(channelNorm)) value += 0.1;

  return Math.max(0, Math.min(1, value));
}

export function scoreVideo(track: Track, video: RawVideo): VideoCandidate | null {
  const normalized = normalizeTrack(track);
  const videoTitle = norm(video.title);

  if (HARD_BLOCK.some((pattern) => pattern.test(videoTitle))) return null;

  const signals: Signals = {
    title: titleSignal(normalized.title, video.title),
    artist: artistSignal(normalized, video.title, video.channel),
    duration: durationSignal(normalized.durationSec, video.durationSec),
    evidence: evidenceSignal(video.title).value,
    quality: qualitySignal(video, video.channel),
  };

  // A candidate must at least mention the song and a slowed/reverb treatment.
  if (signals.title < 0.34) return null;
  if (signals.evidence === 0) return null;

  const weighted =
    signals.title * SIGNAL_WEIGHTS.title +
    signals.artist * SIGNAL_WEIGHTS.artist +
    signals.duration * SIGNAL_WEIGHTS.duration +
    signals.evidence * SIGNAL_WEIGHTS.evidence +
    signals.quality * SIGNAL_WEIGHTS.quality;

  const score = Math.round(weighted * 1000) / 10; // 0–100, one decimal

  const { slowed, reverb } = evidenceSignal(video.title);
  const reasons: string[] = [];
  if (signals.title === 1) reasons.push("exact title");
  else if (signals.title >= 0.7) reasons.push("strong title");
  else reasons.push("partial title");
  if (signals.artist >= 0.9) reasons.push("artist match");
  else if (signals.artist >= 0.5) reasons.push("artist in channel");
  if (slowed) reasons.push("slowed");
  if (reverb) reasons.push("reverb");
  if (normalized.durationSec && video.durationSec) {
    const ratio = video.durationSec / normalized.durationSec;
    if (ratio >= 0.95 && ratio <= 1.5) reasons.push(`length fits ${ratio.toFixed(2)}×`);
  }

  const confidence: Confidence =
    score >= 78 && signals.title >= 0.85 && slowed && reverb && signals.artist >= 0.5
      ? "high"
      : score >= 58 && signals.title >= 0.6
        ? "medium"
        : "low";

  return {
    ...video,
    score,
    confidence,
    reasons,
    breakdown: {
      title: Math.round(signals.title * SIGNAL_WEIGHTS.title * 100),
      artist: Math.round(signals.artist * SIGNAL_WEIGHTS.artist * 100),
      duration: Math.round(signals.duration * SIGNAL_WEIGHTS.duration * 100),
      evidence: Math.round(signals.evidence * SIGNAL_WEIGHTS.evidence * 100),
      quality: Math.round(signals.quality * SIGNAL_WEIGHTS.quality * 100),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Stages 2 + 4 + 5 — retrieval, rejection, confidence                 */
/* ------------------------------------------------------------------ */

const MAX_QUERIES = 3;
const HIGH_CONFIDENCE_STOP = 80;

export async function findMatches(track: Track): Promise<SearchResponse> {
  const queries = buildQueries(track);
  const pool = new Map<string, VideoCandidate>();
  let via = "none";

  for (let i = 0; i < Math.min(queries.length, MAX_QUERIES); i++) {
    const outcome = await searchYouTube(queries[i]);
    if (outcome.videos.length) via = outcome.via;

    for (const video of outcome.videos) {
      const candidate = scoreVideo(track, video);
      if (!candidate) continue;
      const existing = pool.get(candidate.videoId);
      if (!existing || candidate.score > existing.score) {
        pool.set(candidate.videoId, candidate);
      }
    }

    const best = [...pool.values()].sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= HIGH_CONFIDENCE_STOP) break;
    if (i === 1 && pool.size > 0) break;
  }

  const candidates = [...pool.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return { query: queries[0], via, candidates };
}
