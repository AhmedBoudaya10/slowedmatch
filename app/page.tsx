"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PlaylistResult,
  Track,
  TrackRowState,
  VideoCandidate,
} from "@/lib/types";
import {
  download,
  getCachedMatch,
  getCachedPlaylist,
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
  togglePin,
  type SavedEntity,
} from "@/lib/client";
import TrackRow from "@/components/TrackRow";
import PlayerBar from "@/components/PlayerBar";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  CloseIcon,
  PinIcon,
  PlayIcon,
  SearchIcon,
  WaveformIcon,
} from "@/components/Icons";

const MAX_TRACKS = 200;
const CONCURRENCY = 3;
const DEMO_URL = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";

type Filter = "all" | "high" | "medium" | "low" | "none" | "error";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "high", label: "Good" },
  { id: "medium", label: "Likely" },
  { id: "low", label: "Weak" },
  { id: "none", label: "None" },
  { id: "error", label: "Failed" },
];

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "playlist"
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [player, setPlayer] = useState<{ track: Track; video: VideoCandidate } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [showTop, setShowTop] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  const [library, setLibrary] = useState<SavedEntity[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    const recent = getRecentUrl();
    if (recent) setUrl(recent);
    setLibrary(getLibrary());
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

  useEffect(() => {
    if (!partsOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest(".split")) setPartsOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [partsOpen]);

  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }

  const total = rows.length;
  const settled = rows.filter((r) => r.status === "done" || r.status === "error").length;
  const pendingCount = rows.filter(
    (r) => r.status === "pending" || r.status === "error",
  ).length;
  const percent = total ? Math.round((settled / total) * 100) : 0;

  const eta = useMemo(() => {
    if (!running || !startedAt || settled === 0 || settled >= total) return 0;
    const elapsed = Math.max(1, ((nowTick || Date.now()) - startedAt) / 1000);
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
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        term &&
        !`${row.track.title} ${row.track.artist}`.toLowerCase().includes(term)
      ) {
        return false;
      }
      const confidence = row.candidates?.[0]?.confidence;
      switch (filter) {
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
  }, [rows, filter, query]);

  const indexById = useMemo(
    () => new Map(rows.map((row, index) => [row.track.id, index])),
    [rows],
  );

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
      Array.from({ length: Math.min(CONCURRENCY, tracks.length) }, worker),
    );
  }

  async function runPlaylist(input: string) {
    const target = input.trim();
    if (!target) {
      setError("Paste a Spotify playlist link first.");
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

    try {
      let result = getCachedPlaylist(target);

      if (!result) {
        const res = await fetch(
          `/api/playlist?url=${encodeURIComponent(target)}`,
          { signal: controller.signal },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Couldn't load that playlist.");
        result = data as PlaylistResult;
        setCachedPlaylist(target, result);
      }

      if (!result?.tracks?.length) {
        throw new Error("That playlist has no tracks I can read.");
      }

      setPlaylist(result);
      saveRecentUrl(target);
      const entity: SavedEntity = {
        id: "",
        url: target,
        kind: result.kind,
        name: result.name,
        owner: result.owner,
        cover: result.cover,
        trackCount: result.tracks.length,
        at: 0,
      };
      saveToLibrary(entity);
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

      if (pending.length) await runQueue(pending, controller.signal);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message || "Something went wrong.");
    } finally {
      if (abortRef.current === controller) {
        setRunning(false);
        setResolving(false);
        setStartedAt(null);
      }
    }
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setResolving(false);
    setStartedAt(null);
    setRows((prev) =>
      prev.map((row) =>
        row.status === "loading" ? { ...row, status: "pending" } : row,
      ),
    );
  }

  async function resume() {
    const pending = rows.filter(
      (row) => row.status === "pending" || row.status === "error",
    );
    if (!pending.length) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setStartedAt(Date.now());
    setNowTick(Date.now());
    setRows((prev) =>
      prev.map((row) =>
        row.status === "error"
          ? { ...row, status: "pending", error: undefined }
          : row,
      ),
    );

    await runQueue(
      pending.map((row) => row.track),
      controller.signal,
    );

    if (abortRef.current === controller) {
      setRunning(false);
      setStartedAt(null);
    }
  }

  async function retryOne(track: Track) {
    const controller = abortRef.current ?? new AbortController();
    abortRef.current = controller;
    await processTrack(track, controller.signal);
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function exportCsv() {
    if (!playlist) return;
    download(`${slug(playlist.name)}-slowedmatch.csv`, toCsv(rows), "text/csv;charset=utf-8");
    notify(`CSV exported · ${rows.length} tracks`);
  }

  async function exportJson() {
    if (!playlist) return;
    download(
      `${slug(playlist.name)}-slowedmatch.json`,
      toJson(playlist, rows),
      "application/json",
    );
    notify("JSON exported");
  }

  const filterCount: Record<Filter, number> = {
    all: rows.length,
    high: stats.high,
    medium: stats.medium,
    low: stats.low,
    none: stats.none,
    error: stats.error,
  };

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

  // YouTube's anonymous watch_videos queue caps at 50 videos, so long playlists
  // are offered in sequential parts. The button opens part 1; the caret menu
  // lists every part so the full playlist is still reachable in one place.
  const PLAY_QUEUE_SIZE = 50;
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

  const playNext = () => {
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
  };

  const sortedLibrary = useMemo(
    () =>
      [...library].sort(
        (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)),
      ),
    [library],
  );

  return (
    <>
      <a className="skip-link" href="#tracks">
        Skip to results
      </a>

      <div className="shell">
        <header className="topbar">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true">
              <WaveformIcon />
            </span>
            <span className="brand-name">SlowedMatch</span>
          </span>
          <span className="topbar-note">Spotify playlist → slowed + reverb</span>
        </header>

        <main>
          <section className={`hero${playlist ? " compact" : ""}`}>
            <span className="badge">
              <span className="badge-dot" aria-hidden="true" />
              Free · no login · nothing downloaded
            </span>

            <h1>
              Your playlist,
              <br />
              <span className="grad">slowed and reverbed.</span>
            </h1>

            <p className="lede">
              Paste a public Spotify playlist. For every track, SlowedMatch finds a
              slowed + reverb version on YouTube and lines it up next to your
              original — with a confidence score instead of blind guesses.
            </p>

            <form
              className="search"
              onSubmit={(event) => {
                event.preventDefault();
                void runPlaylist(url);
              }}
            >
              <label className="sr-only" htmlFor="playlist-url">
                Spotify playlist link
              </label>
              <input
                id="playlist-url"
                className="search-input"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://open.spotify.com/playlist/…"
                autoComplete="off"
                spellCheck={false}
                inputMode="url"
                aria-describedby="playlist-hint"
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={resolving || running}
              >
                {resolving ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <SearchIcon />
                )}
                {resolving ? "Reading playlist…" : running ? "Searching…" : "Find matches"}
              </button>
            </form>

            <div className="hero-foot" id="playlist-hint">
              <button
                type="button"
                className="linkbtn"
                onClick={() => {
                  setUrl(DEMO_URL);
                  void runPlaylist(DEMO_URL);
                }}
                disabled={resolving || running}
              >
                Try a demo playlist
              </button>
              <span className="dot-sep" aria-hidden="true">
                ·
              </span>
              <span className="muted">Playlist, album, artist or track · public · up to {MAX_TRACKS} tracks</span>
            </div>
          </section>

          {library.length > 0 && (
            <section className="library" aria-label="Your saved searches">
              <div className="library-head">
                <h2 className="library-title">Your library</h2>
                <span className="muted">
                  {library.length} saved {library.length === 1 ? "item" : "items"} · stored on this device
                </span>
              </div>
              <div className="library-grid">
                {sortedLibrary.map((entity) => (
                  <div
                    className={`lib-card${entity.pinned ? " pinned" : ""}`}
                    key={entity.id}
                  >
                    <button
                      type="button"
                      className="lib-open"
                      onClick={() => {
                        if (resolving || running) return;
                        setUrl(entity.url);
                        void runPlaylist(entity.url);
                      }}
                      disabled={resolving || running}
                      aria-label={`Find matches for ${entity.name}`}
                      title={`Find matches for ${entity.name}`}
                    >
                      {entity.pinned && (
                        <span className="lib-pin-flag" aria-hidden="true">
                          Pinned
                        </span>
                      )}
                      {entity.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entity.cover} alt="" loading="lazy" width={64} height={64} />
                      ) : (
                        <span className="lib-cover placeholder" aria-hidden="true" />
                      )}
                      <span className="lib-body">
                        <span className="lib-kind">{entity.kind}</span>
                        <span className="lib-name">{entity.name}</span>
                        <span className="lib-sub">
                          {entity.owner ? `${entity.owner} · ` : ""}
                          {entity.trackCount}{" "}
                          {entity.trackCount === 1 ? "track" : "tracks"}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`icon-btn lib-pin${entity.pinned ? " on" : ""}`}
                      onClick={() => setLibrary(togglePin(entity.id))}
                      aria-label={entity.pinned ? `Unpin ${entity.name}` : `Pin ${entity.name} to top`}
                      aria-pressed={Boolean(entity.pinned)}
                    >
                      <PinIcon size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn lib-remove"
                      onClick={() => {
                        setLibrary(removeFromLibrary(entity.id));
                        notify(`Removed “${entity.name}”`);
                      }}
                      aria-label={`Remove ${entity.name} from library`}
                    >
                      <CloseIcon size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {error && (
            <div className="alert" role="alert">
              <div className="alert-text">
                <strong>That didn&apos;t work.</strong>
                <span>{error}</span>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
              >
                <CloseIcon />
              </button>
            </div>
          )}

          {!rows.length && !error && !resolving && (
            <section className="steps" aria-label="How it works">
              <article className="step">
                <span className="step-n">01</span>
                <h2>Paste a playlist</h2>
                <p>Any public Spotify playlist link. No account, no API keys, no app.</p>
              </article>
              <article className="step">
                <span className="step-n">02</span>
                <h2>It hunts YouTube</h2>
                <p>
                  Every track gets searched for its slowed + reverb upload, then
                  scored on title, artist, length and quality.
                </p>
              </article>
              <article className="step">
                <span className="step-n">03</span>
                <h2>Play or export</h2>
                <p>
                  Stream inline, jump to YouTube, or export the whole pairing list
                  as CSV or JSON.
                </p>
              </article>
            </section>
          )}

          {resolving && !playlist && (
            <div className="resolving" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              Reading the playlist from Spotify…
            </div>
          )}

          {playlist && (
            <section className="plhead">
              {playlist.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="plcover"
                  src={playlist.cover}
                  alt={`${playlist.name} cover`}
                  width={84}
                  height={84}
                />
              ) : (
                <span className="plcover placeholder" aria-hidden="true" />
              )}

              <div className="plhead-meta">
                <span className="eyebrow">
                  {playlist.kind === "playlist" ? "Spotify playlist" : `Spotify ${playlist.kind}`}
                </span>
                <h2>{playlist.name}</h2>
                <p>
                  {playlist.owner ? `${playlist.owner} · ` : ""}
                  {playlist.tracks.length} tracks
                  {playlist.truncated ? " (Spotify shares the first 100)" : ""}
                </p>
              </div>

              <div className="plhead-actions">
                {queueParts.length > 0 && (
                  <div className="split">
                    <a
                      className="btn btn-ghost"
                      href={queueParts[0].url}
                      target="_blank"
                      rel="noreferrer noopener"
                      title={
                        queueParts.length > 1
                          ? `All ${matchedIds.length} matches · YouTube queues max 50 videos, so this opens part 1 of ${queueParts.length}`
                          : "Open all matches as one YouTube playlist"
                      }
                      onClick={() =>
                        notify(
                          queueParts.length > 1
                            ? `Opening part 1/${queueParts.length} · play from the menu for the rest`
                            : "Opening YouTube playlist…",
                        )
                      }
                    >
                      <PlayIcon size={13} />
                      Play all
                    </a>
                    {queueParts.length > 1 && (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost split-caret"
                          aria-expanded={partsOpen}
                          aria-haspopup="menu"
                          aria-label={`Playlist parts (${queueParts.length})`}
                          onClick={() => setPartsOpen((open) => !open)}
                        >
                          <ChevronDownIcon size={13} />
                        </button>
                        {partsOpen && (
                          <div className="parts-menu" role="menu" aria-label="Queue parts">
                            {queueParts.map((part, index) => (
                              <a
                                key={part.url}
                                role="menuitem"
                                href={part.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                onClick={() => setPartsOpen(false)}
                              >
                                Part {index + 1}
                                <span>matches {part.from}–{part.to}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void exportCsv()}
                  disabled={!stats.done}
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void exportJson()}
                  disabled={!stats.done}
                >
                  JSON
                </button>
              </div>
            </section>
          )}

          {rows.length > 0 && (
            <>
              <div className="progress-block">
                <div className="progress-meta">
                  <span>
                    {settled} of {total} checked
                    {eta > 0 && running ? ` · ~${eta}s left` : ""}
                  </span>
                  <span className="progress-summary">
                    <b className="good">{stats.high}</b> good
                    <span className="dot-sep" aria-hidden="true">·</span>
                    <b className="warn">{stats.medium}</b> likely
                    <span className="dot-sep" aria-hidden="true">·</span>
                    <b>{stats.none}</b> none
                  </span>
                </div>
                <div
                  className="progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={settled}
                  aria-label="Tracks checked"
                >
                  <span
                    className={running ? "bar live" : "bar"}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>

              <div className="toolbar">
                <span
                  className="toolbar-line"
                  style={{ width: `${percent}%` }}
                  aria-hidden="true"
                />

                <div className="chips" role="tablist" aria-label="Filter by match quality">
                  {FILTERS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={filter === item.id}
                      className={`chip${filter === item.id ? " active" : ""}`}
                      onClick={() => setFilter(item.id)}
                      disabled={filterCount[item.id] === 0 && item.id !== "all"}
                    >
                      {item.label}
                      <span className="chip-count">{filterCount[item.id]}</span>
                    </button>
                  ))}
                </div>

                <div className="toolbar-right">
                  <label className="mini-search">
                    <span className="sr-only">Search tracks or artists</span>
                    <SearchIcon size={14} />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search tracks or artists"
                      type="search"
                    />
                  </label>

                  {running ? (
                    <button type="button" className="btn-mini" onClick={stop}>
                      Stop
                    </button>
                  ) : (
                    pendingCount > 0 && (
                      <button type="button" className="btn-mini" onClick={() => void resume()}>
                        Resume
                      </button>
                    )
                  )}
                </div>
              </div>

              <ol className="tracks" id="tracks">
                {filteredRows.map((row) => (
                  <TrackRow
                    key={row.track.id}
                    row={row}
                    index={indexById.get(row.track.id) ?? 0}
                    expanded={expanded.has(row.track.id)}
                    playingId={player?.video.videoId}
                    onToggle={() => toggleExpanded(row.track.id)}
                    onPlay={(video) => setPlayer({ track: row.track, video })}
                    onRetry={() => void retryOne(row.track)}
                  />
                ))}
              </ol>

              {!filteredRows.length && (
                <div className="empty-filter">
                  <p>No tracks match this filter.</p>
                  <button
                    type="button"
                    className="linkbtn"
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
        </main>

        <footer className="footer">
          <span>
            SlowedMatch links out to YouTube. Nothing is downloaded, ripped or
            re-hosted.
          </span>
          <span className="footer-dim">Personal use · built for slow nights</span>
        </footer>
      </div>

      {rows.length > 3 && showTop && (
        <button
          type="button"
          className="fab"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
        >
          <ArrowUpIcon size={18} />
        </button>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {player && (
        <PlayerBar
          track={player.track}
          video={player.video}
          onClose={() => setPlayer(null)}
          onNext={playNext}
        />
      )}
    </>
  );
}
