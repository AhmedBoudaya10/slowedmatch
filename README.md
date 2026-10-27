# AltMatch

Paste a public Spotify playlist, album, artist or track link and get **slowed +
reverb**, **instrumental**, or **sped-up** versions of every track on YouTube —
scored, compared, and ready to play.

Free, no login, no downloads. AltMatch only links to and embeds existing YouTube
videos.

## Features

- **Three versions per track** — slowed + reverb, instrumental and sped up.
  Pick a version after importing; each is searched and scored separately.
- **Instant switching** — results are cached per version, so moving between
  versions is immediate once a version has been searched.
- **Every Spotify link type** — playlist, album, artist and single track.
- **Transparent matching** — every candidate is scored on five weighted signals
  and labelled `Match`, `Likely` or `Review`. The numeric score and its
  breakdown are visible on hover, so confidence is never faked.
- **Inline playback** — a sticky mini player using the YouTube IFrame API, with
  auto-advance (including autoplay permission carry-over) and a skip button.
- **Queue on YouTube** — “Play all” opens an anonymous YouTube queue, split into
  50-video parts because YouTube silently truncates longer queues.
- **Favorites** — heart any match; stored locally per device and filterable with
  the `Saved` chip.
- **Library** — every opened playlist, album or artist stays in a sticky nav bar.
  Pin items to the front, remove them, or reopen one with a tap. Saved on device.
- **Export** — CSV, JSON, M3U, or copy all YouTube links to the clipboard. The
  exports record which version they contain.
- **Resumable batch search** — concurrency 2–6, per-track retry, stop/resume, and
  a persistent per-version match cache so re-opening a playlist is instant.
- **Accessible by default** — full keyboard navigation, focus-visible rings,
  live regions, reduced-motion and high-contrast support.

## Matching pipeline

`lib/match.ts` runs five explicit stages for every version type:

1. **Normalize** — strips `(feat. …)`, `(Remastered)`, `(Official Video)`,
   punctuation and marketing noise; splits multi-artist strings.
2. **Query variants** — version-specific retrieval queries:

   | Version        | Queries                                                        |
   | -------------- | -------------------------------------------------------------- |
   | Slowed + reverb| `… slowed reverb`, `… slowed + reverb`, `… slowed down`         |
   | Instrumental   | `… instrumental`, `… instrumental version`, `… no vocals`       |
   | Sped up        | `… sped up`, `… sped up version`, `… nightcore`                  |

3. **Retrieve + score** — candidates from every query are deduped and scored:

   | Signal         | Weight | What it checks                                      |
   | -------------- | ------ | --------------------------------------------------- |
   | Title          | 30%    | exact phrase first, then token overlap              |
   | Artist         | 25%    | artist in title or channel (partial credit)         |
   | Duration       | 15%    | version-specific length window                      |
   | Treatment      | 20%    | explicit evidence of the requested version          |
   | Upload quality | 10%    | views, sane length, channel type                    |

   Each version has its own evidence rules and duration window:

   | Version        | Required evidence                                             | Ideal duration |
   | -------------- | ------------------------------------------------------------- | -------------- |
   | Slowed + reverb| “slowed” and/or “reverb”; full weight only when both appear    | 0.95×–1.5×     |
   | Instrumental   | instrumental, no vocals, off vocal or backing track            | 0.88×–1.12×    |
   | Sped up        | sped up / speed up; nightcore accepted at a lower weight       | 0.60×–0.95×    |

4. **Reject** — hard blocks for karaoke, covers, reactions, mashups, medleys,
   loops, hour-long uploads, full albums, live versions, 8D and bass boosted
   audio. Version-specific rejects keep the treatments apart: the slowed search
   rejects sped up/nightcore/instrumental results, the instrumental search
   rejects slowed/sped up/nightcore results, and the sped-up search rejects
   slowed/instrumental results.
5. **Confidence** — `Match` (score ≥ 78 + strong title/artist + full treatment
   evidence), `Likely` (≥ 58), `Review` (everything else), or no candidates.
   Nightcore-only uploads are accepted as sped up but capped at `Likely`;
   titles that explicitly say “sped up” can reach `Match`.

Retrieval walks the query variants and stops early once a high-confidence match
is found. Results are cached per track **and version** for two weeks at the edge
and in `localStorage`.

## Architecture

```
app/
  page.tsx              client orchestrator: queue, per-version cache, favorites, exports, shortcuts
  layout.tsx            metadata + viewport
  globals.css           token-based design system
  api/playlist/route.ts Spotify resolution (API → public embed fallback)
  api/search/route.ts   per-track YouTube matching (?mode=slowed|instrumental|spedup)
components/
  Hero / ImportCard     landing, drag-and-drop, paste detection
  PlaylistHeader        artwork, metadata, play-all parts, export menu
  ModeSwitcher          slowed / instrumental / sped-up selector
  ProgressPanel         progress tracker, ETA, stats, concurrency
  Toolbar               filter chips + deferred search
  TrackRow              result cards, score breakdown, favorites, retry
  MiniPlayer            YouTube IFrame API player + auto-advance
  LibraryNav            sticky saved-library bar with pin, remove and reopen
  EmptyState, Toast, Icons
lib/
  spotify.ts            link parsing, anonymous token, API + embed fallbacks
  youtube.ts            innerTube → HTML scrape → Invidious → optional Data API
  match.ts              normalization, version-aware scoring, rejection, confidence
  modes.ts              version labels, hints and defaults
  client.ts             localStorage caches, library, favorites, exports
  http.ts, types.ts     fetch helpers and shared types
```

Design notes:

- **Client-driven fan-out** keeps each serverless request short (Vercel Hobby
  caps `maxDuration` at 30s); the client runs 2–6 searches in parallel and
  patches rows as they settle.
- **Race-safe version switching** aborts the previous batch and ignores late
  responses, so results never leak between versions.
- **Layered surfaces** instead of flat cards: base tokens → translucent
  surfaces → inset highlights; `content-visibility` keeps 200+ rows smooth.
- **No accounts**: library, favorites, recents and the per-version match cache
  live in `localStorage`, so the app stays free and private.
- Storage keys keep their original `slowedmatch:v1` prefix so libraries and
  favorites saved before the rename are preserved.

## Local development

Requires Node 20+.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

> Spotify’s anonymous web-player token endpoint may return `403` from some
> residential IPs. Playlists/albums/tracks still work through the public embed
> fallback (first 100 tracks); artist links need the API and are best tested on
> the deployed site.

### Optional: YouTube Data API key

The free search chain (`innerTube` → results HTML → Invidious) needs no key. If
you have a Google API key with YouTube Data API v3 enabled, it is used as a
final fallback:

```bash
# .env.local
YOUTUBE_API_KEY=your_key_here
```

## Deploy

The project is Vercel-ready; pushing to `main` deploys automatically.

```bash
git push origin main
```

No environment variables are required. For a custom domain or OG image, add
`NEXT_PUBLIC_SITE_URL` and point it at the production URL.

## Keyboard shortcuts

| Key       | Action                         |
| --------- | ------------------------------ |
| `/`       | Focus search (or import field) |
| `J` / `K` | Move between tracks            |
| `Enter`   | Play the focused track’s match |
| `Esc`     | Close player / clear search    |

## Limits

- Playlists are capped at 200 tracks per run; Spotify embeds expose 100.
- Version coverage varies by song. A row with no convincing candidate shows
  “No instrumental version found” (or the relevant version) plus a manual
  YouTube search link.
- Instrumental matching requires explicit evidence in the title, so unofficial
  “no vocals” uploads only appear when they say so.
- Nightcore is treated as a sped-up variant and labelled honestly.
- Everything is per-device; there is no sync or account.
