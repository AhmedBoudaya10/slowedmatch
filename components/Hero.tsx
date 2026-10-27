"use client";

import ImportCard from "./ImportCard";

export default function Hero({
  compact,
  url,
  onUrlChange,
  onSubmit,
  onDemo,
  busy,
  resolving,
  running,
}: {
  compact: boolean;
  url: string;
  onUrlChange: (value: string) => void;
  onSubmit: () => void;
  onDemo: () => void;
  busy: boolean;
  resolving: boolean;
  running: boolean;
}) {
  return (
    <section className={`hero${compact ? " compact" : ""}`}>
      {!compact ? (
        <div className="hero-copy">
          <span className="badge">
            <span className="badge-dot" aria-hidden="true" />
            Slowed · instrumental · sped up — free, no login
          </span>
          <h1>
            Your playlist,
            <br />
            <span className="grad">every version.</span>
          </h1>
          <p className="lede">
            Paste a public Spotify link. AltMatch finds slowed + reverb, instrumental
            and sped-up versions of every track on YouTube — scored on title, artist,
            length and treatment, so you can trust what you hear.
          </p>
        </div>
      ) : (
        <div className="hero-mini">
          <h1>
            New <span className="grad">search</span>
          </h1>
        </div>
      )}

      <ImportCard
        url={url}
        onUrlChange={onUrlChange}
        onSubmit={onSubmit}
        onDemo={onDemo}
        busy={busy}
        resolving={resolving}
        running={running}
      />
    </section>
  );
}
