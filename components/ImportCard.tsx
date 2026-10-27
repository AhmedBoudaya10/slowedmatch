"use client";

import { useRef, useState } from "react";
import { SearchIcon } from "./Icons";

const SPOTIFY_RE = /open\.spotify\.com\/(?:intl-[a-z]{2,5}\/)?(playlist|album|track|artist)\//i;

export function extractSpotifyLink(text: string): string | null {
  const match = text.match(/https?:\/\/open\.spotify\.com\/[^\s"'<>]+/i);
  return match ? match[0] : null;
}

export default function ImportCard({
  url,
  onUrlChange,
  onSubmit,
  onDemo,
  busy,
  resolving,
  running,
}: {
  url: string;
  onUrlChange: (value: string) => void;
  onSubmit: () => void;
  onDemo: () => void;
  busy: boolean;
  resolving: boolean;
  running: boolean;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const detected = SPOTIFY_RE.test(url);

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDrag(false);
    const link = extractSpotifyLink(event.dataTransfer.getData("text/uri-list")) ??
      extractSpotifyLink(event.dataTransfer.getData("text/plain"));
    if (link) {
      onUrlChange(link);
      inputRef.current?.focus();
    }
  }

  return (
    <div
      className={`import${drag ? " drag" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
    >
      <form
        className="import-row"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        role="search"
        aria-label="Import a Spotify playlist"
      >
        <span className="import-icon" aria-hidden="true">
          <SearchIcon size={18} />
        </span>
        <label className="sr-only" htmlFor="playlist-link">
          Spotify link
        </label>
        <input
          ref={inputRef}
          id="playlist-link"
          className="import-input"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          onPaste={(event) => {
            const link = extractSpotifyLink(event.clipboardData.getData("text"));
            if (link) {
              event.preventDefault();
              onUrlChange(link);
            }
          }}
          placeholder="Paste a Spotify playlist, album, artist or track link"
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          aria-describedby="import-hint"
          disabled={busy}
        />
        <button type="submit" className="btn btn-primary import-submit" disabled={busy}>
          {resolving ? <span className="spinner" aria-hidden="true" /> : null}
          {resolving ? "Reading…" : running ? "Searching…" : "Find matches"}
        </button>
      </form>

      <div className="import-foot" id="import-hint">
        <button type="button" className="linkbtn" onClick={onDemo} disabled={busy}>
          Try today’s Top Hits
        </button>
        <span className="dot-sep" aria-hidden="true">·</span>
        <span className="muted">
          {busy
            ? "Working through the list…"
            : detected
              ? "Link detected — press Enter"
              : "or drop a link here"}{" "}
          · up to 200 tracks
        </span>
      </div>

      {drag && (
        <div className="drop-overlay" aria-hidden="true">
          <span>Drop it — paste a Spotify link</span>
        </div>
      )}
    </div>
  );
}
