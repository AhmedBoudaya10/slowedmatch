"use client";

import type { SavedEntity } from "@/lib/client";
import { CloseIcon, PinIcon } from "./Icons";

function kindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export default function LibraryShelf({
  items,
  disabled,
  onOpen,
  onTogglePin,
  onRemove,
}: {
  items: SavedEntity[];
  disabled: boolean;
  onOpen: (entity: SavedEntity) => void;
  onTogglePin: (id: string) => void;
  onRemove: (entity: SavedEntity) => void;
}) {
  if (!items.length) return null;

  const sorted = [...items].sort(
    (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)),
  );

  return (
    <section className="library" aria-label="Your library">
      <div className="library-head">
        <h2>Your library</h2>
        <span className="muted">
          {items.length} saved · on this device
        </span>
      </div>

      <div className="library-grid">
        {sorted.map((entity) => (
          <div className={`lib-card${entity.pinned ? " pinned" : ""}`} key={entity.id}>
            <button
              type="button"
              className="lib-open"
              onClick={() => onOpen(entity)}
              disabled={disabled}
              title={`Find matches for ${entity.name}`}
              aria-label={`Find matches for ${entity.name}`}
            >
              {entity.cover ? (
                <img src={entity.cover} alt="" loading="lazy" width={56} height={56} />
              ) : (
                <span className="lib-cover" aria-hidden="true" />
              )}
              <span className="lib-body">
                <span className="lib-kind">
                  {kindLabel(entity.kind)}
                  {entity.pinned && <span className="lib-pin-flag">Pinned</span>}
                </span>
                <span className="lib-name">{entity.name}</span>
                <span className="lib-sub">
                  {entity.owner ? `${entity.owner} · ` : ""}
                  {entity.trackCount} {entity.trackCount === 1 ? "track" : "tracks"}
                </span>
              </span>
            </button>

            <button
              type="button"
              className={`icon-btn lib-pin${entity.pinned ? " on" : ""}`}
              onClick={() => onTogglePin(entity.id)}
              aria-label={entity.pinned ? `Unpin ${entity.name}` : `Pin ${entity.name} to top`}
              aria-pressed={Boolean(entity.pinned)}
            >
              <PinIcon size={13} />
            </button>
            <button
              type="button"
              className="icon-btn lib-remove"
              onClick={() => onRemove(entity)}
              aria-label={`Remove ${entity.name} from library`}
            >
              <CloseIcon size={13} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
