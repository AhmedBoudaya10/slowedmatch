"use client";

import type { RefObject } from "react";
import { CloseIcon, SearchIcon } from "./Icons";

export type Filter = "all" | "saved" | "high" | "medium" | "low" | "none" | "error";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "saved", label: "Saved" },
  { id: "high", label: "Match" },
  { id: "medium", label: "Likely" },
  { id: "low", label: "Review" },
  { id: "none", label: "None" },
  { id: "error", label: "Failed" },
];

export default function Toolbar({
  filter,
  onFilter,
  counts,
  query,
  onQuery,
  searchRef,
  shown,
  total,
}: {
  filter: Filter;
  onFilter: (filter: Filter) => void;
  counts: Record<Filter, number>;
  query: string;
  onQuery: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  shown: number;
  total: number;
}) {
  return (
    <div className="toolbar" role="region" aria-label="Filter results">
      <div className="chips" role="group" aria-label="Filter by match quality">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chip${filter === item.id ? " active" : ""}`}
            onClick={() => onFilter(item.id)}
            aria-pressed={filter === item.id}
            disabled={item.id !== "all" && counts[item.id] === 0}
          >
            {item.label}
            <span className="chip-count">{counts[item.id]}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-search">
        <SearchIcon size={15} />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search tracks or artists"
          aria-label="Search tracks or artists"
          autoComplete="off"
          spellCheck={false}
        />
        {query ? (
          <button
            type="button"
            className="icon-btn clear-search"
            onClick={() => onQuery("")}
            aria-label="Clear search"
          >
            <CloseIcon size={13} />
          </button>
        ) : (
          <kbd className="kbd" aria-hidden="true">
            /
          </kbd>
        )}
      </div>

      <span className="toolbar-count muted" aria-live="polite">
        {shown === total ? `${total} tracks` : `${shown} of ${total}`}
      </span>
    </div>
  );
}
