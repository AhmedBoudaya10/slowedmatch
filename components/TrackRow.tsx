"use client";

/* eslint-disable @next/next/no-img-element */

import type { MatchMode, TrackRowState, VideoCandidate } from "@/lib/types";
import { modeLabel } from "@/lib/modes";
import { formatClock, formatDuration, formatViews, searchUrl, watchUrl } from "@/lib/client";
import { ExternalIcon, HeartIcon, PauseIcon, PlayIcon } from "./Icons";

const CONF_LABEL = {
  high: "Match",
  medium: "Likely",
  low: "Review",
} as const;

function coverTone(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

function breakdownText(video: VideoCandidate): string {
  const b = video.breakdown;
  if (!b) return video.reasons.join(" · ");
  return [
    `Title ${b.title}/30`,
    `Artist ${b.artist}/25`,
    `Length ${b.duration}/15`,
    `Treatment ${b.evidence}/20`,
    `Quality ${b.quality}/10`,
  ].join(" · ");
}

function MatchCard({
  video,
  playing,
  compact,
  saved,
  deltaSec,
  onPlay,
  onFavorite,
}: {
  video: VideoCandidate;
  playing: boolean;
  compact?: boolean;
  saved: boolean;
  /** Difference between the video and the Spotify track, in seconds. */
  deltaSec?: number | null;
  onPlay: () => void;
  onFavorite: () => void;
}) {
  const delta =
    typeof deltaSec === "number" && Math.abs(deltaSec) >= 5 ? deltaSec : null;
  const compare =
    delta === null
      ? null
      : `${delta > 0 ? "+" : "−"}${formatClock(Math.abs(delta))}`;
  const compareTitle =
    delta === null
      ? undefined
      : `Runs ${formatClock(Math.abs(delta))} ${
          delta > 0 ? "longer" : "shorter"
        } than the original`;

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
          <span className="mc-stat" title={compareTitle}>
            {formatClock(video.durationSec)}
            {compare ? ` (${compare})` : ""}
            {video.views ? ` · ${formatViews(video.views)}` : ""}
          </span>
          <span
            className="mc-score"
            title={breakdownText(video)}
            aria-label={`Confidence ${Math.round(video.score)} of 100`}
          >
            {Math.round(video.score)}
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
          <span className="mc-chan" title={breakdownText(video)}>
            {video.channel || "YouTube"}
          </span>
          <div className="mc-actions">
            <button
              type="button"
              className={`icon-btn heart${saved ? " on" : ""}`}
              onClick={onFavorite}
              aria-pressed={saved}
              aria-label={saved ? "Remove from favorites" : "Save to favorites"}
              title={saved ? "Remove from favorites" : "Save to favorites"}
            >
              <HeartIcon size={15} filled={saved} />
            </button>
            <a
              className="icon-btn"
              href={watchUrl(video.videoId)}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Open on YouTube"
            >
              <ExternalIcon size={13} />
            </a>
          </div>
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
  favorites,
  mode,
  onToggle,
  onPlay,
  onRetry,
  onFavorite,
}: {
  row: TrackRowState;
  index: number;
  expanded: boolean;
  playingId?: string;
  favorites: Set<string>;
  mode: MatchMode;
  onToggle: () => void;
  onPlay: (video: VideoCandidate) => void;
  onRetry: () => void;
  onFavorite: (video: VideoCandidate) => void;
}) {
  const { track } = row;
  const best = row.candidates?.[0];
  const trackSec = track.durationMs ? Math.round(track.durationMs / 1000) : 0;
  const deltaSec =
    best?.durationSec && trackSec ? best.durationSec - trackSec : null;

  return (
    <li className={`track ${row.status}`} id={`track-${index}`} data-index={index} tabIndex={-1}>
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
              <strong>No {modeLabel(mode).toLowerCase()} version found</strong>
              <span>Nothing convincing for this version on YouTube.</span>
            </div>
            <a
              className="btn-mini"
              href={searchUrl(track, mode)}
              target="_blank"
              rel="noreferrer noopener"
            >
              Search <ExternalIcon size={12} />
            </a>
          </div>
        )}

        {row.status === "done" && best && (
          <>
            <MatchCard
              video={best}
              playing={playingId === best.videoId}
              saved={favorites.has(best.videoId)}
              deltaSec={deltaSec}
              onPlay={() => onPlay(best)}
              onFavorite={() => onFavorite(best)}
            />

            {row.candidates && row.candidates.length > 1 && (
              <button
                type="button"
                className="versions-toggle"
                onClick={onToggle}
                aria-expanded={expanded}
              >
                {expanded ? "Hide versions" : `Show ${row.candidates.length - 1} more`}
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
                    saved={favorites.has(video.videoId)}
                    deltaSec={
                      video.durationSec && trackSec
                        ? video.durationSec - trackSec
                        : null
                    }
                    onPlay={() => onPlay(video)}
                    onFavorite={() => onFavorite(video)}
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
