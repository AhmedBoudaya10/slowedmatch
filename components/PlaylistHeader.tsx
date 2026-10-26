"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaylistResult } from "@/lib/types";
import {
  ChevronDownIcon,
  DownloadIcon,
  EllipsisIcon,
  LinkIcon,
  PlayIcon,
  PlusIcon,
} from "./Icons";

export default function PlaylistHeader({
  playlist,
  matchedCount,
  queueParts,
  onPlayAll,
  onPlayPart,
  onExport,
  onCopyLinks,
  onNewSearch,
}: {
  playlist: PlaylistResult;
  matchedCount: number;
  queueParts: { from: number; to: number; url: string }[];
  onPlayAll: () => void;
  onPlayPart: (url: string) => void;
  onExport: (format: "csv" | "json" | "m3u") => void;
  onCopyLinks: () => void;
  onNewSearch: () => void;
}) {
  const [partsOpen, setPartsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!partsOpen && !menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPartsOpen(false);
        setMenuOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPartsOpen(false);
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [partsOpen, menuOpen]);

  const kindLabel =
    playlist.kind === "playlist"
      ? "Spotify playlist"
      : `Spotify ${playlist.kind}`;

  return (
    <section className="plhead" ref={rootRef}>
      {playlist.cover ? (
        <img
          className="plcover"
          src={playlist.cover}
          alt=""
          width={96}
          height={96}
          loading="lazy"
        />
      ) : (
        <span className="plcover placeholder" aria-hidden="true" />
      )}

      <div className="plhead-meta">
        <span className="eyebrow">{kindLabel}</span>
        <h2>{playlist.name}</h2>
        <p>
          {playlist.owner ? `${playlist.owner} · ` : ""}
          {playlist.tracks.length} tracks
          {playlist.truncated ? " · first 100 shown" : ""}
        </p>
      </div>

      <div className="plhead-actions">
        {queueParts.length > 0 && (
          <div className="split">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onPlayAll}
              title={
                queueParts.length > 1
                  ? `${matchedCount} matches · YouTube queues 50 at a time, so this starts part 1`
                  : "Play every match on YouTube"
              }
            >
              <PlayIcon size={13} />
              Play all
            </button>
            {queueParts.length > 1 && (
              <button
                type="button"
                className="btn btn-primary btn-sm split-caret"
                aria-expanded={partsOpen}
                aria-haspopup="menu"
                aria-label={`Queue parts (${queueParts.length})`}
                onClick={() => setPartsOpen((open) => !open)}
              >
                <ChevronDownIcon size={13} />
              </button>
            )}
            {partsOpen && (
              <div className="parts-menu" role="menu" aria-label="Queue parts">
                {queueParts.map((part, index) => (
                  <button
                    key={part.url}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setPartsOpen(false);
                      onPlayPart(part.url);
                    }}
                  >
                    <span>Part {index + 1}</span>
                    <small>
                      matches {part.from}–{part.to}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="menu-wrap">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Export and share"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <EllipsisIcon size={16} />
          </button>
          {menuOpen && (
            <div className="menu" role="menu" aria-label="Export and share">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onExport("csv"); }}>
                <DownloadIcon size={14} /> Export CSV
              </button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onExport("json"); }}>
                <DownloadIcon size={14} /> Export JSON
              </button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onExport("m3u"); }}>
                <DownloadIcon size={14} /> Export M3U
              </button>
              <span className="menu-sep" aria-hidden="true" />
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onCopyLinks(); }}>
                <LinkIcon size={14} /> Copy YouTube links
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onNewSearch}
          aria-label="Start a new search"
          title="New search"
        >
          <PlusIcon size={15} />
        </button>
      </div>
    </section>
  );
}
