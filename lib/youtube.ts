import { HttpError, httpJson, httpText } from "./http";
import type { RawVideo } from "./types";

const CLIENT_VERSION = "2.20250925.01.00";

/**
 * YouTube search with three free fallbacks and an optional keyed API.
 * Order: innerTube JSON → results HTML → Invidious → Data API (if key set).
 */

export function parseDuration(input: string | null | undefined): number | null {
  if (!input) return null;
  const parts = input.trim().split(":").map((p) => Number(p));
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function parseViews(input: string | null | undefined): number | null {
  if (!input) return null;
  const match = input.replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  const mult = match[2]
    ? ({ K: 1e3, M: 1e6, B: 1e9 } as Record<string, number>)[match[2].toUpperCase()] ?? 1
    : 1;
  return Math.round(value * mult);
}

function textOf(node: any): string {
  if (!node || typeof node !== "object") return "";
  if (typeof node.simpleText === "string") return node.simpleText;
  if (Array.isArray(node.runs)) {
    return node.runs.map((run: any) => (typeof run?.text === "string" ? run.text : "")).join("");
  }
  return "";
}

function toRawVideo(vr: any): RawVideo | null {
  const videoId = typeof vr?.videoId === "string" ? vr.videoId : "";
  const title = textOf(vr?.title).trim();
  if (!videoId || !title) return null;

  const durationSec = parseDuration(textOf(vr?.lengthText));
  // No length means live, upcoming, or a shelf item — skip it.
  if (durationSec === null) return null;

  return {
    videoId,
    title,
    channel: textOf(vr?.ownerText) || textOf(vr?.longBylineText),
    durationSec,
    views: parseViews(textOf(vr?.viewCountText)),
    published: textOf(vr?.publishedTimeText) || undefined,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  };
}

function collectVideos(root: any): RawVideo[] {
  const out: RawVideo[] = [];
  const seen = new Set<string>();
  const stack: any[] = [root];

  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;

    const vr = node.videoRenderer;
    if (vr?.videoId && !seen.has(vr.videoId)) {
      seen.add(vr.videoId);
      const video = toRawVideo(vr);
      if (video) out.push(video);
    }

    for (const key in node) {
      const child = node[key];
      if (child && typeof child === "object") stack.push(child);
    }
  }

  return out;
}

function looksLikeShort(video: RawVideo): boolean {
  return video.durationSec !== null && video.durationSec < 30;
}

async function innertube(query: string): Promise<RawVideo[]> {
  const body = JSON.stringify({
    context: {
      client: {
        clientName: "WEB",
        clientVersion: CLIENT_VERSION,
        hl: "en",
        gl: "US",
      },
    },
    query,
  });

  const raw = await httpText(
    "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
    {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "accept-language": "en-US,en;q=0.9",
        origin: "https://www.youtube.com",
        referer: "https://www.youtube.com/",
        "x-youtube-client-name": "1",
        "x-youtube-client-version": CLIENT_VERSION,
      },
      timeoutMs: 10_000,
    },
  );

  return collectVideos(JSON.parse(raw)).filter((v) => !looksLikeShort(v));
}

function extractJsonObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

async function htmlSearch(query: string): Promise<RawVideo[]> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&gl=US`;
  const html = await httpText(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
      cookie: "CONSENT=YES+cb; SOCS=CAI",
    },
    timeoutMs: 15_000,
  });

  const markers = [
    "var ytInitialData = ",
    'window["ytInitialData"] = ',
    "window['ytInitialData'] = ",
    '"ytInitialData"] = ',
  ];

  for (const marker of markers) {
    const at = html.indexOf(marker);
    if (at === -1) continue;
    const brace = html.indexOf("{", at + marker.length);
    if (brace === -1) continue;
    const json = extractJsonObject(html, brace);
    if (!json) continue;
    try {
      return collectVideos(JSON.parse(json)).filter((v) => !looksLikeShort(v));
    } catch {
      // try the next marker
    }
  }

  throw new HttpError("YouTube returned a page we couldn't read.", 502);
}

const INVIDIOUS_INSTANCES = [
  "https://yewtu.be",
  "https://invidious.nerdvpn.de",
  "https://inv.nadeko.net",
  "https://invidious.f5.si",
  "https://iv.melmac.space",
];

async function invidious(query: string): Promise<RawVideo[]> {
  const attempts = INVIDIOUS_INSTANCES.map(async (base) => {
    const list = await httpJson<any[]>(
      `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video&region=US`,
      { timeoutMs: 7000 },
    );
    if (!Array.isArray(list) || !list.length) return [];

    return list
      .map((v): RawVideo | null => {
        if (!v?.videoId || !v?.title) return null;
        return {
          videoId: String(v.videoId),
          title: String(v.title),
          channel: String(v.author ?? ""),
          durationSec: Number(v.lengthSeconds) || null,
          views: Number(v.viewCount) || null,
          published: v.publishedText || undefined,
          thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
        };
      })
      .filter((v): v is RawVideo => Boolean(v && v.durationSec && v.durationSec >= 30));
  });

  const settled = await Promise.allSettled(attempts);
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value.length) return result.value;
  }
  return [];
}

async function dataApi(query: string): Promise<RawVideo[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const search = await httpJson<any>(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(
      query,
    )}&key=${key}`,
    { timeoutMs: 9000 },
  );

  const ids: string[] = (search.items ?? [])
    .map((item: any) => item?.id?.videoId)
    .filter((id: unknown): id is string => typeof id === "string");

  if (!ids.length) return [];

  const details = await httpJson<any>(
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet,statistics&id=${ids.join(
      ",",
    )}&key=${key}`,
    { timeoutMs: 9000 },
  );

  return ((details.items ?? []) as any[])
    .map((v: any): RawVideo | null => {
      if (!v?.id) return null;
      const durationSec = parseDuration(
        String(v.contentDetails?.duration ?? "")
          .replace(/^PT/, "")
          .replace(/(\d+)H/, "$1:")
          .replace(/(\d+)M/, "$1:")
          .replace(/(\d+)S/, "$1"),
      );
      return {
        videoId: v.id,
        title: v.snippet?.title ?? "",
        channel: v.snippet?.channelTitle ?? "",
        durationSec,
        views: Number(v.statistics?.viewCount) || null,
        published: v.snippet?.publishedAt,
        thumbnail: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
      };
    })
    .filter((v): v is RawVideo => Boolean(v?.title));
}

export type SearchOutcome = {
  videos: RawVideo[];
  via: string;
};

export async function searchYouTube(query: string): Promise<SearchOutcome> {
  const providers: { name: string; run: () => Promise<RawVideo[]> }[] = [
    { name: "youtube", run: () => innertube(query) },
    { name: "youtube-html", run: () => htmlSearch(query) },
    { name: "invidious", run: () => invidious(query) },
  ];

  if (process.env.YOUTUBE_API_KEY) {
    providers.push({ name: "youtube-api", run: () => dataApi(query) });
  }

  let lastError: unknown = null;

  for (const provider of providers) {
    try {
      const videos = await provider.run();
      if (videos.length) return { videos, via: provider.name };
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError instanceof HttpError && lastError.status === 429) {
    throw new HttpError(
      "YouTube is rate-limiting this server right now. Wait a minute and retry these tracks.",
      429,
    );
  }

  return { videos: [], via: "none" };
}
