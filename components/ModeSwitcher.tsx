"use client";

import type { MatchMode } from "@/lib/types";
import { MODES } from "@/lib/modes";

export default function ModeSwitcher({
  mode,
  running,
  onChange,
}: {
  mode: MatchMode;
  running: boolean;
  onChange: (mode: MatchMode) => void;
}) {
  return (
    <section className="modebar" aria-label="Choose a version">
      <div className="modebar-copy">
        <span className="eyebrow">Version</span>
        <p>Each version is searched and scored separately — switching is instant once cached.</p>
      </div>

      <div className="modes" role="group" aria-label="Version type">
        {MODES.map((item) => {
          const active = item.id === mode;
          return (
            <button
              key={item.id}
              type="button"
              className={`mode${active ? " active" : ""}${
                active && running ? " is-running" : ""
              }`}
              aria-pressed={active}
              onClick={() => {
                if (!active) onChange(item.id);
              }}
            >
              <span className="mode-top">
                <span className="mode-dot" aria-hidden="true" />
                {item.short}
              </span>
              <span className="mode-hint">{item.hint}</span>
              {active && running ? <span className="sr-only">Searching</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
