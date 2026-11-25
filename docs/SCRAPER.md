# Scraper Engine Documentation

## Architecture & Module Separation

Every scraping responsibility is isolated inside `src/scraper/`:

| Module | Responsibility |
|---|---|
| `client.js` | Rate-limited Axios client with per-domain delay, concurrency semaphore, exponential backoff, timeouts, and strict anti-bot/403 abort (never bypasses challenges) |
| `card-parser.js` | Unified Schema.org `<article>` card parser distinguishing movies vs series, ongoing vs completed badges, ratings, years, posters, and normalizing `d21.team` links |
| `pagination.js` | `/page/{n}` discovery, manual `startPage`/`maxPages` caps, duplicate URL filtering, out-of-bounds homepage fallback guard, and page failure tracking |
| `homepage.js` | Parses featured, latest series, latest movies, popular, recommendations, collections, and full taxonomy filters |
| `catalog.js` | Generic paginated catalog crawler + `POST /ajax/filter-recommendation` parser |
| `series.js` | Series catalog entrypoints (latest, featured, popular, ongoing, completed, asian, west, recommendations) |
| `movies.js` | LK21 movie catalog entrypoints (latest, featured, popular) against `MOVIE_SOURCE_BASE_URL` |
| `taxonomy.js` | Genre, country, and year list extractors + per-taxonomy catalog crawlers |
| `detail.js` | Combines `script#watch-history-data`, JSON-LD (`TVSeries`/`Movie`), `.info-tag`, `.tag-list`, `.synopsis`, `.detail`, `Series Terkait`, and `script#season-data` |
| `episodes.js` | Parses `script#season-data` manifests and optional `TVEpisode` detail metadata (strictly excluding video/stream embeds) |
| `search.js` | Source search API parser (`SEARCH_API_BASE_URL/search.php`) |

## Synchronization Modes

1. **Quick Sync (`npm run sync:quick`)**: Refreshes homepage, taxonomies, latest series, latest movies, popular, ongoing, and recommendations.
2. **Full Catalog Sync (`npm run sync:full -- --category=latest-series --start-page=1 --max-pages=10 --details`)**: Resumable batch crawl across catalog categories with per-page non-destructive database persistence.
3. **Detail Sync (`POST /api/v1/admin/sync` with `type: "detail"`)**: Pulls oldest/unscraped rows from `contents` (`detail_scraped_at ASC NULLS FIRST`), enriches metadata + seasons + episodes, and logs any failed URLs in `scraper_jobs`.
4. **Episode Sync (`POST /api/v1/admin/sync` with `type: "episode"`)**: Prioritizes ongoing series to keep seasons and episode lists fresh.
5. **Retry Failed Jobs (`npm run sync:retry`)**: Replays failed `scraper_jobs` rows safely.
6. **Discovery Dry-Run (`npm run discover`)**: Verifies live source parsing without requiring database credentials.

## Compliance & Politeness Controls

- Default per-domain delay: `500 ms` (`SCRAPER_DELAY_MS`).
- Default concurrency: `2` (`SCRAPER_CONCURRENCY`, capped at 5).
- Bounded retries: `3` (`SCRAPER_MAX_RETRIES`) with exponential backoff only on network timeouts, `429`, or `5xx`.
- Zero CAPTCHA/challenge bypass: HTTP `403` or Cloudflare/CAPTCHA markers raise `ACCESS_PROTECTED` and halt immediately.
- Metadata-only scope: never scrapes or stores video streams, embed players, or download links.
