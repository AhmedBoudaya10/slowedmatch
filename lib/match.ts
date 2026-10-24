import { searchYouTube } from "./youtube";
import type {
  Confidence,
  RawVideo,
  SearchResponse,
  Track,
  VideoCandidate,
} from "./types";

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

/** Score how much of the track title appears in a video title. */
function titleSimilarity(trackTitle: string, videoTitle: string): number {
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
    if (ratio >= 0.75) score = 0.8;
    else if (ratio >= 0.5) score = 0.45;
    else if (ratio >= 0.34) score = 0.2;

    if (score > best) best = score;
  }

  return best;
}

function artistHit(artist: string, videoTitle: string, channel: string): boolean {
  const parts = artist
    .split(/\s*(?:,|&|feat\.?|ft\.?|\bx\b|×)\s*/i)
    .map((part) => norm(part))
    .filter((part) => part.length >= 2);

  if (!parts.length) return false;

  const haystack = ` ${norm(videoTitle)} ${norm(channel)} `;
  return parts.some((part) => haystack.includes(part));
}

export function scoreVideo(track: Track, video: RawVideo): VideoCandidate | null {
  const title = norm(video.title);
  const channel = norm(video.channel);

  if (HARD_BLOCK.some((pattern) => pattern.test(title))) return null;

  const similarity = titleSimilarity(track.title, video.title);
  if (similarity < 0.34) return null;

  const slowed = /\bslow(?:ed|ing)?\b/.test(title) || /\bslowed\s*down\b/.test(title);
  const reverb = /\breverb/.test(title);
  if (!slowed && !reverb) return null;

  const reasons: string[] = [];
  let score = similarity * 4;

  reasons.push(
    similarity === 1
      ? "exact title"
      : similarity >= 0.8
        ? "strong title match"
        : "partial title match",
  );

  if (artistHit(track.artist, video.title, video.channel)) {
    score += 1.2;
    reasons.push("artist match");
  } else {
    score -= 0.3;
  }

  if (slowed) {
    score += 1.4;
    reasons.push("slowed");
  }
  if (reverb) {
    score += 1.2;
    reasons.push("reverb");
  }
  if (slowed && reverb) score += 0.6;

  const trackSeconds = track.durationMs ? track.durationMs / 1000 : 0;
  if (trackSeconds > 20 && video.durationSec) {
    const ratio = video.durationSec / trackSeconds;
    if (ratio >= 0.95 && ratio <= 1.8) {
      score += 1.4;
      reasons.push(`length fits (${ratio.toFixed(2)}×)`);
    } else if (ratio >= 0.85 && ratio <= 2.2) {
      score += 0.3;
    } else if (ratio > 2.2) {
      score -= 1.8;
    } else {
      score -= 0.6;
    }
  }

  if (video.durationSec) {
    if (video.durationSec > 600) score -= 1.5;
    if (video.durationSec < 45) score -= 1.5;
  }

  if (video.views) {
    score += Math.min(0.5, Math.log10(video.views + 1) / 14);
  }

  if (/\b(topic|vevo)\b/.test(channel)) score -= 0.5;

  const confidence: Confidence =
    score >= 6.2 && similarity >= 0.8 && slowed && reverb
      ? "high"
      : score >= 4.4 && similarity >= 0.5
        ? "medium"
        : "low";

  return {
    ...video,
    score: Math.round(score * 100) / 100,
    confidence,
    reasons,
  };
}

function queryTitle(title: string): string {
  return stripFeature(title)
    .replace(/\((?:official|lyrics?|audio|video|visualizer|hd|4k|explicit|clean|remaster(?:ed)?)[^)]*\)/gi, " ")
    .replace(/\[(?:official|lyrics?|audio|video|visualizer|hd|4k|explicit|clean|remaster(?:ed)?)[^\]]*\]/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildQueries(track: Track): string[] {
  const title = queryTitle(track.title) || track.title;
  const artist = track.artist.split(/\s*(?:,|&|feat\.?|ft\.)\s*/i)[0]?.trim() ?? "";

  const queries = [
    `${title} ${artist} slowed reverb`.replace(/\s{2,}/g, " ").trim(),
    `${title} slowed + reverb`,
    `${title} ${artist} slowed down`.replace(/\s{2,}/g, " ").trim(),
  ];

  return [...new Set(queries)];
}

export async function findMatches(track: Track): Promise<SearchResponse> {
  const queries = buildQueries(track);
  const pool = new Map<string, VideoCandidate>();
  let via = "none";

  for (let i = 0; i < queries.length; i++) {
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
    if (best && best.confidence !== "low") break;
    if (i === 1 && pool.size > 0) break;
  }

  const candidates = [...pool.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return { query: queries[0], via, candidates };
}
