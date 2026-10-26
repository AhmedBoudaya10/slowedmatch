"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type {
  PlaylistResult,
  Track,
  TrackRowState,
  VideoCandidate,
} from "@/lib/types";
import {
  copyText,
  download,
  getCachedMatch,
  getCachedPlaylist,
  getFavorites,
  getLibrary,
  getRecentUrl,
  playAllUrl,
  removeFromLibrary,
  saveRecentUrl,
  saveToLibrary,
  setCachedMatch,
  setCachedPlaylist,
  toCsv,
  toJson,
  toM3u,
  toggleFavorite,
  togglePin,
  watchUrl,
  type SavedEntity,
} from "@/lib/client";
import TrackRow from "@/components/TrackRow";
import MiniPlayer from "@/components/MiniPlayer";
import Hero from "@/components/Hero";
import LibraryShelf from "@/components/LibraryShelf";
import ProgressPanel from "@/components/ProgressPanel";
import PlaylistHeader from "@/components/PlaylistHeader";
import Toolbar, { type Filter } from "@/components/Toolbar";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import {
  AlertIcon,
  ArrowUpIcon,
  CloseIcon,
  WaveformIcon,
} from "@/components/Icons";

const MAX_TRACKS = 200;
const DEFAULT_CONCURRENCY = 3;
const CONCURRENCY_KEY = "slowedmatch:v1:concurrency";
const DEMO_URL = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";
const PLAY_QUEUE_SIZE = 50;

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "slowedmatch"
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [playlist, setPlaylist] = useState<PlaylistResult | null>(null);
  const [rows, setRows] = useState<TrackRowState[]>([]);
  const [resolving, setResolving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [player, setPlayer] = useState<{ track: Track; video: VideoCandidate } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [showTop, setShowTop] = useState(false);
  const [library, setLibrary] = useState<SavedEntity[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [concurrency, setConcurrency] = useState(DEFAULT_CONCURRENCY);

  const abortRef = useRef<AbortController | null>(null);
  const toastTimer = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const recent = getRecentUrl();
    if (recent) setUrl(recent);
    setLibrary(getLibrary());
    setFavorites(getFavorites());

    const savedConcurrency = Number(window.localStorage.getItem(CONCURRENCY_KEY));
    if (
      Number.isFinite(savedConcurrency) &&
      savedConcurrency >= 2 &&
      savedConcurrency <= 6
    ) {
      setConcurrency(savedConcurrency);
    }
    return () => {
      abortRef.current?.abort();
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 900);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const total = rows.length;
  const settled = rows.filter((r) => r.status === "done" || r.status === "error").length;
  const pendingCount = rows.filter(
    (r) => r.status === "pending" || r.status === "error",
  ).length;
  const percent = total ? Math.round((settled / total) * 100) : 0;

  const eta = useMemo(() => {
    if (!running || !startedAt || settled === 0 || settled >= total) return 0;
    const elapsed = Math.max(1, (nowTick || Date.now()) - startedAt) / 1000;
    return Math.max(1, Math.round((elapsed / settled) * (total - settled)));
  }, [running, startedAt, settled, total, nowTick]);

  const stats = useMemo(() => {
    const next = { high: 0, medium: 0, low: 0, none: 0, error: 0, done: 0 };
    for (const row of rows) {
      if (row.status === "error") {
        next.error++;
        continue;
      }
      if (row.status !== "done") continue;
      next.done++;
      const confidence = row.candidates?.[0]?.confidence;
      if (confidence === "high") next.high++;
      else if (confidence === "medium") next.medium++;
      else if (confidence === "low") next.low++;
      else next.none++;
    }
    return next;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = deferredQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        term &&
        !`${row.track.title} ${row.track.artist}`.toLowerCase().includes(term)
      ) {
        return false;
      }
      const confidence = row.candidates?.[0]?.confidence;
      switch (filter) {
        case "saved":
          return Boolean(row.candidates?.some((video) => favoriteSet.has(video.videoId)));
        case "high":
          return confidence === "high";
        case "medium":
          return confidence === "medium";
        case "low":
          return confidence === "low";
        case "none":
          return row.status === "done" && !confidence;
        case "error":
          return row.status === "error";
        default:
          return true;
      }
    });
  }, [rows, filter, deferredQuery, favoriteSet]);

  const filterCounts: Record<Filter, number> = useMemo(
    () => ({
      all: rows.length,
      saved: rows.filter((row) =>
        row.candidates?.some((video) => favoriteSet.has(video.videoId)),
      ).length,
      high: stats.high,
      medium: stats.medium,
      low: stats.low,
      none: stats.none,
      error: stats.error,
    }),
    [rows, stats, favoriteSet],
  );

  const matchedIds = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of rows) {
      const id = row.status === "done" ? row.candidates?.[0]?.videoId : undefined;
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  }, [rows]);

  // YouTube's anonymous queue caps at 50 videos — expose the rest as parts.
  const queueParts = useMemo(() => {
    const parts: { from: number; to: number; url: string }[] = [];
    for (let i = 0; i < matchedIds.length; i += PLAY_QUEUE_SIZE) {
      const slice = matchedIds.slice(i, i + PLAY_QUEUE_SIZE);
      parts.push({
        from: i + 1,
        to: i + slice.length,
        url: playAllUrl(slice, PLAY_QUEUE_SIZE),
      });
    }
    return parts;
  }, [matchedIds]);

  const recentItems = useMemo(() => library.slice(0, 5), [library]);

  function resetResults() {
    abortRef.current?.abort();
    setPlaylist(null);
    setRows([]);
    setPlayer(null);
    setFilter("all");
    setQuery("");
    setExpanded(new Set());
    setError(null);
    setResolving(false);
    setRunning(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function newSearch() {
    resetResults();
    window.setTimeout(() => searchRef.current?.focus(), 350);
  }

  function patchById(id: string, patch: Partial<TrackRowState>) {
    setRows((prev) =>
      prev.map((row) => (row.track.id === id ? { ...row, ...patch } : row)),
    );
  }

  async function processTrack(track: Track, signal: AbortSignal) {
    patchById(track.id, { status: "loading", error: undefined });

    try {
      const params = new URLSearchParams({
        song: track.title,
        artist: track.artist,
        dur: String(Math.round((track.durationMs ?? 0) / 1000)),
      });

      const res = await fetch(`/api/search?${params.toString()}`, { signal });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data?.error || "Search failed.");

      const candidates: VideoCandidate[] = Array.isArray(data.candidates)
        ? data.candidates
        : [];

      setCachedMatch(track, {
        candidates,
        query: data.query ?? "",
        via: data.via ?? "",
      });

      patchById(track.id, {
        status: "done",
        candidates,
        query: data.query,
        via: data.via,
        error: undefined,
      });
    } catch (err) {
      if (signal.aborted) return;
      patchById(track.id, {
        status: "error",
        error: (err as Error).message || "Search failed.",
      });
    }
  }

  async function runQueue(tracks: Track[], signal: AbortSignal) {
    let cursor = 0;

    const worker = async () => {
      while (cursor < tracks.length) {
        if (signal.aborted) return;
        const track = tracks[cursor++];
        await processTrack(track, signal);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, tracks.length) }, worker),
    );

    if (!signal.aborted) setRunning(false);
  }

  async function runPlaylist(input: string) {
    const target = input.trim();
    if (!target) {
      setError("Paste a Spotify link first.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setPlaylist(null);
    setRows([]);
    setPlayer(null);
    setFilter("all");
    setQuery("");
    setExpanded(new Set());
    setResolving(true);
    setRunning(true);
    setStartedAt(Date.now());
    setNowTick(Date.now());
    setUrl(target);

    try {
      let result = getCachedPlaylist(target);

      if (!result) {
        const res = await fetch(`/api/playlist?url=${encodeURIComponent(target)}`, {
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Couldn't load that playlist.");
        result = data as PlaylistResult;
        setCachedPlaylist(target, result);
      }

      if (!result?.tracks?.length) {
        throw new Error("That link has no tracks I can read.");
      }

      setPlaylist(result);
      saveRecentUrl(target);

      saveToLibrary({
        id: "",
        url: target,
        kind: result.kind,
        name: result.name,
        owner: result.owner,
        cover: result.cover,
        trackCount: result.tracks.length,
      });
      setLibrary(getLibrary());

      const capped = result.tracks.slice(0, MAX_TRACKS);
      const initial: TrackRowState[] = capped.map((track) => {
        const cached = getCachedMatch(track);
        if (!cached) return { track, status: "pending" };
        return {
          track,
          status: "done",
          candidates: cached.candidates,
          query: cached.query,
          via: cached.via,
          cached: true,
        };
      });

      setRows(initial);
      setResolving(false);

      const pending = initial
        .filter((row) => row.status === "pending")
        .map((row) => row.track);

      if (!pending.length) {
        setRunning(false);
        notify("Loaded from cache");
        return;
      }

      await runQueue(pending, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError((err as Error).message || "Something went wrong.");
      setResolving(false);
      setRunning(false);
    }
  }

  function changeConcurrency(value: number) {
    setConcurrency(value);
    try {
      window.localStorage.setItem(CONCURRENCY_KEY, String(value));
    } catch {
      /* storage may be unavailable in private mode */
    }
  }

  function stopSearch() {
    abortRef.current?.abort();
    // Aborted requests never resolve — put them back in the queue so Resume retries them.
    setRows((prev) =>
      prev.map((row) =>
        row.status === "loading" ? { ...row, status: "pending" } : row,
      ),
    );
    setRunning(false);
    notify("Search stopped — resume any time");
  }

  function resumeSearch() {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setStartedAt(Date.now());
    setNowTick(Date.now());

    const pending = rows
      .filter((row) => row.status === "pending" || row.status === "error")
      .map((row) => row.track);

    void runQueue(pending, controller.signal);
  }

  function retryTrack(track: Track) {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    void runQueue([track], controller.signal);
  }

  const playNext = useCallback(() => {
    if (!player) return;
    const currentIndex = rows.findIndex((row) => row.track.id === player.track.id);
    for (let i = currentIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const video = row.status === "done" ? row.candidates?.[0] : undefined;
      if (video) {
        setPlayer({ track: row.track, video });
        notify(`Next: ${row.track.title}`);
        return;
      }
    }
    notify("End of playlist");
    setPlayer(null);
  }, [player, rows, notify]);

  const playRow = useCallback(
    (track: Track, video: VideoCandidate) => setPlayer({ track, video }),
    [],
  );

  const retryRow = useCallback(
    (track: Track) => retryTrack(track),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const toggleRow = useCallback((trackId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }, []);

  const favoriteVideo = useCallback(
    (video: VideoCandidate) => {
      const next = toggleFavorite(video.videoId);
      setFavorites(next);
      notify(next.includes(video.videoId) ? "Saved to favorites" : "Removed from favorites");
    },
    [notify],
  );

  function exportCsv() {
    if (!playlist) return;
    download(`${slug(playlist.name)}-slowedmatch.csv`, toCsv(rows), "text/csv;charset=utf-8");
    notify(`CSV exported · ${rows.length} tracks`);
  }

  function exportJson() {
    if (!playlist) return;
    download(
      `${slug(playlist.name)}-slowedmatch.json`,
      toJson(playlist, rows),
      "application/json",
    );
    notify("JSON exported");
  }

  function exportM3u() {
    if (!playlist) return;
    download(`${slug(playlist.name)}.m3u`, toM3u(rows), "audio/x-mpegurl");
    notify("M3U playlist exported");
  }

  async function copyLinks() {
    const links = rows
      .map((row) => row.candidates?.[0])
      .filter((video): video is VideoCandidate => Boolean(video))
      .map((video) => watchUrl(video.videoId));
    if (!links.length) {
      notify("No matches to copy yet");
      return;
    }
    const ok = await copyText(links.join("\n"));
    notify(ok ? `${links.length} YouTube links copied` : "Couldn't copy links");
  }

  /* Keyboard shortcuts: / search, J/K navigate, Enter play, Esc close */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (event.key === "/" && !typing) {
        event.preventDefault();
        if (searchRef.current) searchRef.current.focus();
        else document.getElementById("playlist-link")?.focus();
        return;
      }

      if (event.key === "Escape") {
        if (player) setPlayer(null);
        else if (typing) (target as HTMLElement).blur();
        else if (query) setQuery("");
        return;
      }

      if (typing) return;

      if (event.key === "j" || event.key === "k") {
        const items = Array.from(document.querySelectorAll<HTMLElement>(".track"));
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next =
          index === -1
            ? 0
            : Math.min(items.length - 1, Math.max(0, index + (event.key === "j" ? 1 : -1)));
        items[next]?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [player, query]);

  function onRowKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "Enter") return;
    const item = (event.target as HTMLElement).closest<HTMLElement>(".track");
    if (!item) return;
    const index = Number(item.dataset.index);
    const row = rows[index];
    const video = row?.candidates?.[0];
    if (row && video) {
      event.preventDefault();
      setPlayer({ track: row.track, video });
    }
  }

  return (
    <>
      {playlist && rows.length > 0 && (
        <a className="skip-link" href="#results">
          Skip to results
        </a>
      )}

      <div
        className="shell"
        onDragOver={(event) => event.preventDefault()}
      >
        <header className="topbar">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true">
              <WaveformIcon />
            </span>
            <span className="brand-name">SlowedMatch</span>
          </span>
          <span className="topbar-note">Spotify → slowed + reverb</span>
        </header>

        <main>
          <Hero
            compact={Boolean(playlist) || resolving}
            url={url}
            onUrlChange={setUrl}
            onSubmit={() => void runPlaylist(url)}
            onDemo={() => void runPlaylist(DEMO_URL)}
            busy={resolving || running}
            resolving={resolving}
            running={running}
            recents={recentItems}
            onPickRecent={(entity) => void runPlaylist(entity.url)}
          />

          {!playlist && !resolving && (
            <LibraryShelf
              items={library}
              disabled={resolving || running}
              onOpen={(entity) => void runPlaylist(entity.url)}
              onTogglePin={(id) => setLibrary(togglePin(id))}
              onRemove={(entity) => {
                setLibrary(removeFromLibrary(entity.id));
                notify(`Removed “${entity.name}”`);
              }}
            />
          )}

          {error && (
            <div className="alert" role="alert">
              <span className="alert-icon" aria-hidden="true">
                <AlertIcon />
              </span>
              <div className="alert-text">
                <strong>That didn’t work</strong>
                <span>{error}</span>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setError(null)}
                aria-label="Dismiss"
              >
                <CloseIcon size={15} />
              </button>
            </div>
          )}

          {resolving && !playlist && (
            <div className="resolving" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              Reading your Spotify link…
            </div>
          )}

          {playlist && (
            <>
              <PlaylistHeader
                playlist={playlist}
                matchedCount={matchedIds.length}
                queueParts={queueParts}
                onPlayAll={() => {
                  window.open(queueParts[0]?.url, "_blank", "noopener,noreferrer");
                  notify(
                    queueParts.length > 1
                      ? `Part 1/${queueParts.length} — play the rest from the menu`
                      : "Opening YouTube queue",
                  );
                }}
                onPlayPart={(partUrl) => {
                  window.open(partUrl, "_blank", "noopener,noreferrer");
                  notify("Opening YouTube queue");
                }}
                onExport={(format) => {
                  if (format === "csv") exportCsv();
                  else if (format === "json") exportJson();
                  else exportM3u();
                }}
                onCopyLinks={() => void copyLinks()}
                onNewSearch={newSearch}
              />

              {rows.length > 0 && (
                <ProgressPanel
                  settled={settled}
                  total={total}
                  percent={percent}
                  eta={eta}
                  running={running}
                  pending={pendingCount}
                  stats={stats}
                  concurrency={concurrency}
                  onConcurrency={changeConcurrency}
                  onStop={stopSearch}
                  onResume={resumeSearch}
                  onRetryFailed={() => {
                    const failed = rows
                      .filter((row) => row.status === "error")
                      .map((row) => row.track);
                    if (!failed.length) return;
                    const controller = new AbortController();
                    abortRef.current = controller;
                    setRunning(true);
                    void runQueue(failed, controller.signal);
                  }}
                />
              )}

              <Toolbar
                filter={filter}
                onFilter={setFilter}
                counts={filterCounts}
                query={query}
                onQuery={setQuery}
                searchRef={searchRef}
                shown={filteredRows.length}
                total={total}
              />

              <ul className="tracks" id="results" onKeyDown={onRowKeyDown}>
                {filteredRows.map((row) => {
                  const index = rows.indexOf(row);
                  return (
                    <TrackRow
                      key={row.track.id || index}
                      row={row}
                      index={index}
                      expanded={expanded.has(row.track.id)}
                      playingId={player?.video.videoId}
                      favorites={favoriteSet}
                      onToggle={() => toggleRow(row.track.id)}
                      onPlay={(video) => playRow(row.track, video)}
                      onRetry={() => retryRow(row.track)}
                      onFavorite={favoriteVideo}
                    />
                  );
                })}
              </ul>

              {!filteredRows.length && (
                <div className="empty-filter">
                  <p>Nothing here matches that filter.</p>
                  <button
                    type="button"
                    className="btn-mini"
                    onClick={() => {
                      setFilter("all");
                      setQuery("");
                    }}
                  >
                    Show all tracks
                  </button>
                </div>
              )}
            </>
          )}

          {!playlist && !resolving && <EmptyState />}
        </main>

        <footer className="footer">
          <span>SlowedMatch links out to YouTube. Nothing is downloaded or re-hosted.</span>
          <span className="footer-dim">Personal use · built for slow nights</span>
        </footer>
      </div>

      {rows.length > 4 && showTop && (
        <button
          type="button"
          className="fab"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
        >
          <ArrowUpIcon size={17} />
        </button>
      )}

      <Toast message={toast} />

      {player && (
        <MiniPlayer
          track={player.track}
          video={player.video}
          saved={favoriteSet.has(player.video.videoId)}
          onClose={() => setPlayer(null)}
          onNext={playNext}
          onFavorite={() => favoriteVideo(player.video)}
          onExpand={() =>
            window.open(watchUrl(player.video.videoId), "_blank", "noopener,noreferrer")
          }
        />
      )}
    </>
  );
}
