# SlowedMatch

Paste a public Spotify playlist, album, artist or track link and get the best
**slowed + reverb** version of every track on YouTube — scored, compared, and
ready to play.

Free, no login, no downloads. SlowedMatch only links to and embeds existing
YouTube videos.

## Features

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
- **Library** — recent playlists/albums/artists are saved on device, with
  pin-to-top and one-tap re-run.
- **Export** — CSV, JSON, M3U, or copy all YouTube links to the clipboard.
- **Resumable batch search** — concurrency 2–6, per-track retry, stop/resume, and
  a persistent match cache so re-opening a playlist is instant.
- **Accessible by default** — full keyboard navigation, focus-visible rings,
  live regions, reduced-motion and high-contrast support.

## Matching pipeline

`lib/match.ts` runs five explicit stages:

1. **Normalize** — strips `(feat. …)`, `(Remastered)`, `(Official Video)`,
   punctuation and marketing noise; splits multi-artist strings.
2. **Query variants** — e.g. `Starboy The Weeknd slowed reverb`,
   `Starboy slowed + reverb`, `Starboy The Weeknd slowed down`.
3. **Retrieve + score** — candidates from every query are deduped and scored:

   | Signal        | Weight | What it checks                                      |
   | ------------- | ------ | --------------------------------------------------- |
   | Title         | 30%    | exact phrase first, then token overlap              |
   | Artist        | 25%    | artist in title or channel (partial credit)         |
   | Duration      | 15%    | slowed uploads run ~0.95×–1.5× the original         |
   | Treatment     | 20%    | requires “slowed” and/or “reverb” evidence          |
   | Upload quality| 10%    | views, sane length, channel type                    |

4. **Reject** — hard blocks for sped up, nightcore, 8D, bass boosted, karaoke,
   instrumental, cover, reaction, mashup, loops and hour-long uploads.
5. **Confidence** — `Match` (score ≥ 78 + strong title/artist + slowed + reverb),
   `Likely` (≥ 58), `Review` (everything else), or no candidates.

Retrieval walks the query variants and stops early once a high-confidence match
is found. Search results are cached for two weeks at the edge.

## Architecture

```
app/
  page.tsx              client orchestrator: queue, cache, favorites, exports, shortcuts
  layout.tsx            metadata + viewport
  globals.css           token-based design system
  api/playlist/route.ts Spotify resolution (API → public embed fallback)
  api/search/route.ts   per-track YouTube matching
components/
  Hero / ImportCard     landing, drag-and-drop, paste detection, recents
  PlaylistHeader        artwork, metadata, play-all parts, export menu
  ProgressPanel         progress tracker, ETA, stats, concurrency
  Toolbar               filter chips + deferred search
  TrackRow              result cards, score breakdown, favorites, retry
  MiniPlayer            YouTube IFrame API player + auto-advance
  LibraryShelf, EmptyState, Toast, Icons
lib/
  spotify.ts            link parsing, anonymous token, API + embed fallbacks
  youtube.ts            innerTube → HTML scrape → Invidious → optional Data API
  match.ts              normalization, scoring, rejection, confidence
  client.ts             localStorage caches, library, favorites, exports
  http.ts, types.ts     fetch helpers and shared types
```

Design notes:

- **Client-driven fan-out** keeps each serverless request short (Vercel Hobby
  caps `maxDuration` at 30s); the client runs 2–6 searches in parallel and
  patches rows as they settle.
- **Layered surfaces** instead of flat cards: base tokens → translucent
  surfaces → inset highlights; `content-visibility` keeps 200+ rows smooth.
- **No accounts**: library, favorites, recents and the match cache live in
  `localStorage`, so the app stays free and private.

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

| Key        | Action                          |
| ---------- | ------------------------------- |
| `/`        | Focus search (or import field)  |
| `J` / `K`  | Move between tracks             |
| `Enter`    | Play the focused track’s match  |
| `Esc`      | Close player / clear search     |

## Limits

- Playlists are capped at 200 tracks per run; Spotify embeds expose 100.
- Slowed + reverb uploads don’t exist for every song — those rows show
  “No slowed version found” with a manual YouTube search link.
- Everything is per-device; there is no sync or account.
