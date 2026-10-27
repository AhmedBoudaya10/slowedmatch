"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SavedEntity } from "@/lib/client";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PinIcon } from "./Icons";

function kindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export default function LibraryNav({
  items,
  activeId,
  onOpen,
  onTogglePin,
  onRemove,
}: {
  items: SavedEntity[];
  activeId: string | null;
  onOpen: (entity: SavedEntity) => void;
  onTogglePin: (id: string) => void;
  onRemove: (entity: SavedEntity) => void;
}) {
  const stripRef = useRef<HTMLUListElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const max = strip.scrollWidth - strip.clientWidth;
    const left = strip.scrollLeft > 2;
    const right = max > 2 && strip.scrollLeft < max - 2;
    setEdges((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right },
    );
  }, []);

  useEffect(() => {
    measure();

    const strip = stripRef.current;
    if (!strip) return;

    strip.addEventListener("scroll", measure, { passive: true });
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(strip);
    window.addEventListener("resize", measure);

    return () => {
      strip.removeEventListener("scroll", measure);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [items, measure]);

  if (!items.length) return null;

  const sorted = [...items].sort((a, b) => {
    const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    return pinDiff !== 0 ? pinDiff : b.at - a.at;
  });
  const canScroll = edges.left || edges.right;

  function scroll(direction: -1 | 1) {
    const strip = stripRef.current;
    if (!strip) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.scrollBy({
      left: direction * Math.max(240, strip.clientWidth * 0.8),
      behavior: reduced ? "auto" : "smooth",
    });
  }

  return (
    <nav className="library-bar" aria-label="Saved Spotify library">
      <div className="library-bar-label">
        <span className="library-bar-title">Library</span>
        <span className="library-bar-count">{items.length} saved</span>
      </div>

      <ul className="library-strip" ref={stripRef}>
        {sorted.map((entity) => {
          const active = activeId === entity.id;
          const tracks = `${entity.trackCount} ${
            entity.trackCount === 1 ? "track" : "tracks"
          }`;

          return (
            <li
              className={`library-item${entity.pinned ? " is-pinned" : ""}${
                active ? " is-active" : ""
              }`}
              key={entity.id}
            >
              <button
                type="button"
                className="library-item-open"
                onClick={() => onOpen(entity)}
                aria-current={active ? "page" : undefined}
                aria-label={`${active ? "Reopen" : "Open"} ${entity.name} — ${kindLabel(
                  entity.kind,
                )}, ${tracks}`}
                title={
                  active
                    ? `Currently open: ${entity.name}`
                    : `Open ${entity.name}${
                        entity.owner ? ` by ${entity.owner}` : ""
                      } · ${kindLabel(entity.kind)} · ${tracks}`
                }
              >
                {entity.cover ? (
                  <img
                    className="library-art"
                    src={entity.cover}
                    alt=""
                    loading="lazy"
                    width={34}
                    height={34}
                  />
                ) : (
                  <span className="library-art" aria-hidden="true" />
                )}
                <span className="library-item-text">
                  <span className="library-item-name">{entity.name}</span>
                  <span className="library-item-meta">
                    {kindLabel(entity.kind)} · {tracks}
                  </span>
                </span>
              </button>

              <span className="library-item-actions">
                <button
                  type="button"
                  className={`library-action is-pin${entity.pinned ? " is-on" : ""}`}
                  onClick={() => onTogglePin(entity.id)}
                  aria-label={
                    entity.pinned
                      ? `Unpin ${entity.name}`
                      : `Pin ${entity.name} to the front`
                  }
                  aria-pressed={Boolean(entity.pinned)}
                  title={entity.pinned ? "Unpin" : "Pin to front"}
                >
                  <PinIcon size={12} />
                </button>
                <button
                  type="button"
                  className="library-action is-remove"
                  onClick={() => onRemove(entity)}
                  aria-label={`Remove ${entity.name} from the library`}
                  title="Remove from library"
                >
                  <CloseIcon size={12} />
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      {canScroll && (
        <div className="library-scroll-controls">
          <button
            type="button"
            className="library-scroll-btn"
            onClick={() => scroll(-1)}
            disabled={!edges.left}
            aria-label="Scroll saved items left"
          >
            <ChevronLeftIcon size={14} />
          </button>
          <button
            type="button"
            className="library-scroll-btn"
            onClick={() => scroll(1)}
            disabled={!edges.right}
            aria-label="Scroll saved items right"
          >
            <ChevronRightIcon size={14} />
          </button>
        </div>
      )}
    </nav>
  );
}
