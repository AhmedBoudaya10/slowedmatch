import { searchYouTube } from "./youtube";
import type {
  Confidence,
  MatchMode,
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

/** Reject results that are a different kind of upload in every mode. */
const COMMON_BLOCK: RegExp[] = [
  /\b8\s*d\b/,
  /\bbass\s*boost(ed)?\b/,
  /\bkaraoke\b/,
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

/** Treatments that are valid in one mode but wrong for another. */
const MODE_BLOCK: Record<MatchMode, RegExp[]> = {
  slowed: [
    /\bsped\s*up\b/,
    /\bspeed\s*up\b/,
    /\bspedup\b/,
    /\bspeedup\b/,
    /\bnightcore\b/,
    /\bdaycore\b/,
    /\binstrumental\b/,
  ],
  instrumental: [
    /\bsped\s*up\b/,
    /\bspeed\s*up\b/,
    /\bspedup\b/,
    /\bspeedup\b/,
    /\bnightcore\b/,
    /\bdaycore\b/,
    /\bslowed\b/,
  ],
  spedup: [
    /\bslowed\b/,
    /\bdaycore\b/,
    /\binstrumental\b/,
  ],
};

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
/* Stage 2 — query variants, per version type                         */
/* ------------------------------------------------------------------ */

export function buildQueries(track: Track, mode: MatchMode = "slowed"): string[] {
  const { coreTitle, primaryArtist } = normalizeTrack(track);
  const title = coreTitle || track.title;
  const artist = primaryArtist ? ` ${primaryArtist}` : "";

  const variants =
    mode === "slowed"
      ? [
          `${title}${artist} slowed reverb`,
          `${title} slowed + reverb`,
          `${title}${artist} slowed down`,
        ]
      : mode === "instrumental"
        ? [
            `${title}${artist} instrumental`,
            `${title} instrumental version`,
            `${title}${artist} no vocals`,
          ]
        : [
            `${title}${artist} sped up`,
            `${title} sped up version`,
            `${title}${artist} nightcore`,
          ];

  return [
    ...new Set(
      variants.map((q) => q.replace(/\s{2,}/g, " ").trim()).filter(Boolean),
    ),
  ];
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

function durationSignal(
  trackSeconds: number,
  videoSeconds: number | null,
  mode: MatchMode,
): number {
  if (!trackSeconds || !videoSeconds) return 0.5;

  const ratio = videoSeconds / trackSeconds;

  if (mode === "slowed") {
    // Slowed versions run longer than the original: 0.95×–1.5× is ideal.
    if (ratio >= 0.95 && ratio <= 1.5) return 1;
    if (ratio >= 0.85 && ratio <= 1.8) return 0.7;
    if (ratio >= 0.7 && ratio <= 2.2) return 0.35;
    if (ratio > 2.2) return 0;
    return 0.15;
  }

  if (mode === "instrumental") {
    // Instrumentals keep the arrangement length.
    if (ratio >= 0.88 && ratio <= 1.12) return 1;
    if (ratio >= 0.75 && ratio <= 1.3) return 0.7;
    if (ratio >= 0.55 && ratio <= 1.5) return 0.3;
    return 0;
  }

  // Sped up versions run ~0.6×–0.95× of the original.
  if (ratio >= 0.6 && ratio <= 0.95) return 1;
  if (ratio >= 0.5 && ratio <= 1.03) return 0.7;
  if (ratio >= 0.4 && ratio <= 1.15) return 0.3;
  return 0;
}

type Evidence = { value: number; tags: string[] };

function evidenceSignal(videoTitle: string, mode: MatchMode): Evidence {
  const title = norm(videoTitle);

  if (mode === "slowed") {
    const slowed = /\bslowed\b/.test(title);
    const reverb = /\breverb/.test(title);

    if (slowed && reverb) return { value: 1, tags: ["slowed", "reverb"] };
    if (slowed) return { value: 0.55, tags: ["slowed"] };
    if (reverb) return { value: 0.4, tags: ["reverb"] };
    return { value: 0, tags: [] };
  }

  if (mode === "instrumental") {
    if (
      /\bno\s+vocals?\b|\boff\s*vocal\b|\bwithout\s+vocals?\b|\bbacking\s+track\b/.test(
        title,
      )
    ) {
      return { value: 1, tags: ["no vocals"] };
    }
    if (/\binstrumental\b/.test(title)) {
      return { value: 1, tags: ["instrumental"] };
    }
    if (/\binst\b/.test(title)) return { value: 0.8, tags: ["instrumental"] };
    return { value: 0, tags: [] };
  }

  if (
    /\bsped\s*up\b|\bspeed\s*up\b|\bspedup\b|\bspeedup\b|\baccelerated\b/.test(title)
  ) {
    return { value: 1, tags: ["sped up"] };
  }
  if (/\bnightcore\b/.test(title)) {
    return { value: 0.7, tags: ["nightcore"] };
  }
  return { value: 0, tags: [] };
}

const CHANNEL_BOOST: Record<MatchMode, RegExp> = {
  slowed: /\bslowed\b|\breverb\b|\baesthetic\b/,
  instrumental: /\binstrumental\b|\bbacking\s*track\b|\bkaraoke\b/,
  spedup: /\bsped\s*up\b|\bspedup\b|\bspeed\s*up\b|\bnightcore\b/,
};

function qualitySignal(video: RawVideo, channel: string, mode: MatchMode): number {
  let value = 0.4;

  if (video.views) value += Math.min(0.4, Math.log10(video.views + 1) / 16);
  if (video.durationSec) {
    if (video.durationSec >= 45) value += 0.1;
    if (video.durationSec > 720) value -= 0.35;
  }

  const channelNorm = norm(channel);
  // Official "Topic" channels are a negative signal for edits, but a positive
  // one for instrumentals — those uploads are usually the cleanest source.
  if (mode !== "instrumental" && /\btopic\b|\bvevo\b/.test(channelNorm)) {
    value -= 0.2;
  }
  if (CHANNEL_BOOST[mode].test(channelNorm)) value += 0.1;

  return Math.max(0, Math.min(1, value));
}

export function scoreVideo(
  track: Track,
  video: RawVideo,
  mode: MatchMode = "slowed",
): VideoCandidate | null {
  const normalized = normalizeTrack(track);
  const videoTitle = norm(video.title);

  if (
    COMMON_BLOCK.some((pattern) => pattern.test(videoTitle)) ||
    MODE_BLOCK[mode].some((pattern) => pattern.test(videoTitle))
  ) {
    return null;
  }

  const evidence = evidenceSignal(video.title, mode);
  const signals: Signals = {
    title: titleSignal(normalized.title, video.title),
    artist: artistSignal(normalized, video.title, video.channel),
    duration: durationSignal(normalized.durationSec, video.durationSec, mode),
    evidence: evidence.value,
    quality: qualitySignal(video, video.channel, mode),
  };

  // A candidate must mention the song and carry evidence of the chosen version.
  if (signals.title < 0.34) return null;
  if (signals.evidence === 0) return null;

  const weighted =
    signals.title * SIGNAL_WEIGHTS.title +
    signals.artist * SIGNAL_WEIGHTS.artist +
    signals.duration * SIGNAL_WEIGHTS.duration +
    signals.evidence * SIGNAL_WEIGHTS.evidence +
    signals.quality * SIGNAL_WEIGHTS.quality;

  const score = Math.round(weighted * 1000) / 10; // 0–100, one decimal

  const reasons: string[] = [];
  if (signals.title === 1) reasons.push("exact title");
  else if (signals.title >= 0.7) reasons.push("strong title");
  else reasons.push("partial title");
  if (signals.artist >= 0.9) reasons.push("artist match");
  else if (signals.artist >= 0.5) reasons.push("artist in channel");
  reasons.push(...evidence.tags);

  if (normalized.durationSec && video.durationSec) {
    const ratio = video.durationSec / normalized.durationSec;
    const ideal =
      mode === "slowed"
        ? ratio >= 0.95 && ratio <= 1.5
        : mode === "instrumental"
          ? ratio >= 0.88 && ratio <= 1.12
          : ratio >= 0.6 && ratio <= 0.95;
    if (ideal) reasons.push(`length fits ${ratio.toFixed(2)}×`);
  }

  // Nightcore is accepted as sped up, but flagged "Likely" rather than "Match".
  const highEvidence = mode === "spedup" ? 0.85 : 1;
  const confidence: Confidence =
    score >= 78 &&
    signals.title >= 0.85 &&
    signals.artist >= 0.5 &&
    signals.evidence >= highEvidence
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
/* Stages 4 + 5 — retrieval, rejection, confidence                     */
/* ------------------------------------------------------------------ */

const MAX_QUERIES = 3;
const HIGH_CONFIDENCE_STOP = 80;

export async function findMatches(
  track: Track,
  mode: MatchMode = "slowed",
): Promise<SearchResponse> {
  const queries = buildQueries(track, mode);
  const pool = new Map<string, VideoCandidate>();
  let via = "none";

  for (let i = 0; i < Math.min(queries.length, MAX_QUERIES); i++) {
    const outcome = await searchYouTube(queries[i]);
    if (outcome.videos.length) via = outcome.via;

    for (const video of outcome.videos) {
      const candidate = scoreVideo(track, video, mode);
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

  return { query: queries[0], via, mode, candidates };
}
