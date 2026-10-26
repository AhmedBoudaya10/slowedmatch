"use client";

const STEPS = [
  {
    n: "01",
    title: "Paste a link",
    body: "Any public Spotify playlist, album, artist or track. No account, no API key, no app.",
  },
  {
    n: "02",
    title: "Pick a version",
    body: "Slowed + reverb, instrumental or sped up. AltMatch searches each one separately and scores every candidate on five signals.",
  },
  {
    n: "03",
    title: "Listen and take it with you",
    body: "Stream inline, queue the whole thing on YouTube, save favorites, or export CSV, JSON or M3U.",
  },
];

export default function EmptyState() {
  return (
    <section className="steps" aria-label="How AltMatch works">
      <div className="steps-head">
        <h2>How it works</h2>
        <p className="muted">Three steps, about ten seconds per playlist.</p>
      </div>

      <div className="steps-grid">
        {STEPS.map((step) => (
          <article className="step" key={step.n}>
            <span className="step-n">{step.n}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </article>
        ))}
      </div>

      <p className="steps-note">
        <kbd className="kbd">/</kbd> search tracks
        <span className="dot-sep" aria-hidden="true">·</span>
        <kbd className="kbd">J</kbd>
        <kbd className="kbd">K</kbd> move between songs
        <span className="dot-sep" aria-hidden="true">·</span>
        <kbd className="kbd">Enter</kbd> play
        <span className="dot-sep" aria-hidden="true">·</span>
        <kbd className="kbd">Esc</kbd> close player
      </p>
    </section>
  );
}
