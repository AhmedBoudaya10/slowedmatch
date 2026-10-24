export type Track = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  cover?: string;
  url?: string;
};

export type PlaylistResult = {
  provider: "spotify";
  kind: "playlist" | "album" | "track" | "artist";
  id: string;
  name: string;
  owner?: string;
  cover?: string;
  tracks: Track[];
  total: number;
  truncated: boolean;
  source: "api" | "embed";
  note?: string;
};

export type RawVideo = {
  videoId: string;
  title: string;
  channel: string;
  durationSec: number | null;
  views: number | null;
  published?: string;
  thumbnail: string;
};

export type Confidence = "high" | "medium" | "low";

export type VideoCandidate = RawVideo & {
  score: number;
  confidence: Confidence;
  reasons: string[];
};

export type SearchResponse = {
  query: string;
  via: string;
  candidates: VideoCandidate[];
};

export type RowStatus = "pending" | "loading" | "done" | "error";

export type TrackRowState = {
  track: Track;
  status: RowStatus;
  candidates?: VideoCandidate[];
  error?: string;
  query?: string;
  via?: string;
  cached?: boolean;
};
