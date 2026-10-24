"use client";

/* eslint-disable @next/next/no-img-element */

import type { TrackRowState, VideoCandidate } from "@/lib/types";
import { formatClock, formatDuration, formatViews, searchUrl, watchUrl } from "@/lib/client";
import { ExternalIcon, PauseIcon, PlayIcon } from "./Icons";

const CONF_LABEL = {
  high: "Good match",
  medium: "Likely",
  low: "Weak",
} as const;

function coverTone(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

function MatchCard({
  video,
  playing,
  compact,
  onPlay,
}: {
  video: VideoCandidate;
  playing: boolean;
  compact?: boolean;
  onPlay: () => void;
}) {
  return (
    <div className={`matchcard${compact ? " compact" : ""}`}>
      <button
        type="button"
        className="thumb"
        onClick={onPlay}
        aria-label={`${playing ? "Pause" : "Play"} ${video.title}`}
      >
        <img src={video.thumbnail} alt="" loading="lazy" width={96} height={54} />
        <span className="thumb-play" aria-hidden="true">
          {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
        </span>
      </button>

      <div className="mc-body">
        <div className="mc-row">
          <span className={`pill ${video.confidence}`}>{CONF_LABEL[video.confidence]}</span>
          <span className="mc-stat">
            {formatClock(video.durationSec)}
            {video.views ? ` · ${formatViews(video.views)}` : ""}
          </span>
        </div>

        <a
          className="mc-title"
          href={watchUrl(video.videoId)}
          target="_blank"
          rel="noreferrer noopener"
          title={`${video.title} — ${video.reasons.join(" · ")}`}
        >
          {video.title}
        </a>

        <div className="mc-foot">
          <span className="mc-chan" title={video.reasons.join(" · ")}>
            {video.channel || "YouTube"}
          </span>
          <a
            className="mc-open"
            href={watchUrl(video.videoId)}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Open on YouTube"
          >
            <ExternalIcon />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function TrackRow({
  row,
  index,
  expanded,
  playingId,
  onToggle,
  onPlay,
  onRetry,
}: {
  row: TrackRowState;
  index: number;
  expanded: boolean;
  playingId?: string;
  onToggle: () => void;
  onPlay: (video: VideoCandidate) => void;
  onRetry: () => void;
}) {
  const { track } = row;
  const best = row.candidates?.[0];

  return (
    <li className={`track ${row.status}`}>
      <div className="track-main">
        <span className="track-index" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>

        {track.cover ? (
          <img className="track-cover" src={track.cover} alt="" loading="lazy" width={48} height={48} />
        ) : (
          <span
            className="track-cover generated"
            aria-hidden="true"
            style={{ "--tone": coverTone(track.title) } as React.CSSProperties}
          >
            {track.title.trim().charAt(0)}
          </span>
        )}

        <div className="track-meta">
          {track.url ? (
            <a className="track-title" href={track.url} target="_blank" rel="noreferrer noopener">
              {track.title}
            </a>
          ) : (
            <span className="track-title">{track.title}</span>
          )}
          <span className="track-sub">
            {track.artist}
            {track.album ? ` · ${track.album}` : ""}
          </span>
        </div>

        <span className="track-dur">{formatDuration(track.durationMs)}</span>
      </div>

      <div className="match">
        {row.status === "pending" && (
          <div className="match-idle">
            <span className="dot" aria-hidden="true" />
            Queued
          </div>
        )}

        {row.status === "loading" && (
          <div className="skeleton" aria-hidden="true">
            <span className="sk-thumb" />
            <span className="sk-lines">
              <span />
              <span />
            </span>
          </div>
        )}

        {row.status === "error" && (
          <div className="match-empty">
            <div className="me-text">
              <strong>Search failed</strong>
              <span>{row.error ?? "Try again in a moment."}</span>
            </div>
            <button type="button" className="btn-mini" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}

        {row.status === "done" && !best && (
          <div className="match-empty">
            <div className="me-text">
              <strong>No slowed version found</strong>
              <span>Nothing convincing on YouTube.</span>
            </div>
            <a className="btn-mini" href={searchUrl(track)} target="_blank" rel="noreferrer noopener">
              Search <ExternalIcon size={12} />
            </a>
          </div>
        )}

        {row.status === "done" && best && (
          <>
            <MatchCard
              video={best}
              playing={playingId === best.videoId}
              onPlay={() => onPlay(best)}
            />

            {row.candidates && row.candidates.length > 1 && (
              <button
                type="button"
                className="versions-toggle"
                onClick={onToggle}
                aria-expanded={expanded}
              >
                {expanded ? "Hide" : `Show ${row.candidates.length - 1} more`}
                <span aria-hidden="true">{expanded ? "−" : "+"}</span>
              </button>
            )}

            {expanded && (
              <div className="alt-list">
                {row.candidates!.slice(1).map((video) => (
                  <MatchCard
                    key={video.videoId}
                    video={video}
                    compact
                    playing={playingId === video.videoId}
                    onPlay={() => onPlay(video)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}
