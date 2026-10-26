"use client";

import type { MatchMode } from "@/lib/types";
import { modeLabel } from "@/lib/modes";
import { RefreshIcon } from "./Icons";

export type SearchStats = {
  high: number;
  medium: number;
  low: number;
  none: number;
  error: number;
  done: number;
};

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export default function ProgressPanel({
  settled,
  total,
  percent,
  eta,
  running,
  pending,
  stats,
  mode,
  concurrency,
  onConcurrency,
  onStop,
  onResume,
  onRetryFailed,
}: {
  settled: number;
  total: number;
  percent: number;
  eta: number;
  running: boolean;
  pending: number;
  stats: SearchStats;
  mode: MatchMode;
  concurrency: number;
  onConcurrency: (value: number) => void;
  onStop: () => void;
  onResume: () => void;
  onRetryFailed: () => void;
}) {
  const finished = settled >= total && total > 0;
  const version = modeLabel(mode).toLowerCase();

  return (
    <section className="progress" aria-label="Search progress">
      <div className="progress-top">
        <div className="progress-copy">
          <span className="eyebrow">
            {finished
              ? `${modeLabel(mode)} search complete`
              : running
                ? `Searching ${version} versions`
                : `${modeLabel(mode)} search paused`}
          </span>
          <strong className="progress-count">
            {settled}
            <span className="progress-total"> / {total}</span>
          </strong>
        </div>

        <div className="progress-actions">
          <label
            className="conc"
            title="Parallel searches — takes effect when you resume"
          >
            <span>Parallel</span>
            <select
              value={concurrency}
              onChange={(event) => onConcurrency(Number(event.target.value))}
              disabled={running}
              aria-label="Parallel searches"
            >
              {[2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          {running ? (
            <>
              <span className="progress-eta">
                {eta ? `~${formatEta(eta)} left` : "finishing…"}
              </span>
              <button type="button" className="btn btn-quiet" onClick={onStop}>
                Stop
              </button>
            </>
          ) : pending > 0 ? (
            <>
              <span className="progress-eta">{pending} left</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={onResume}>
                <RefreshIcon size={14} />
                Resume
              </button>
            </>
          ) : stats.error > 0 ? (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={onRetryFailed}
            >
              <RefreshIcon size={14} />
              Retry failed
            </button>
          ) : null}
        </div>
      </div>

      <div
        className={`progress-bar${running ? " live" : ""}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={settled}
        aria-label="Tracks checked"
      >
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="progress-stats">
        <span className="stat good">
          <i aria-hidden="true" /> {stats.high} matched
        </span>
        <span className="stat likely">
          <i aria-hidden="true" /> {stats.medium} likely
        </span>
        <span className="stat review">
          <i aria-hidden="true" /> {stats.low} to review
        </span>
        <span className="stat none">
          <i aria-hidden="true" /> {stats.none} none
        </span>
        {stats.error > 0 && (
          <span className="stat err">
            <i aria-hidden="true" /> {stats.error} failed
          </span>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {settled} of {total} tracks checked
        {finished ? ". Search complete." : ""}
      </p>
    </section>
  );
}
