# Source Website Reconnaissance & Feasibility Analysis

**Target Website:** `https://tv1.nontondrama.vip/` (NontonDrama — LK21 Series Portal)  
**Companion Movie Portal (linked from Homepage & Nav):** `https://d21.team/` → `https://www.lk21.de/` → `https://tv13.lk21official.cc/` (configurable via `MOVIE_SOURCE_BASE_URL`)  
**Audit Date:** 2026-11-25  
**Feasibility Verdict:** **HIGH — Static HTML + Embedded JSON (No Browser Automation Required)**

---

## 1. Access, Compliance & `robots.txt` Audit

| Check | `https://tv1.nontondrama.vip/` | `https://tv13.lk21official.cc/` (Movies) |
|---|---|---|
| HTTP Status | `200 OK` via plain HTTP GET (Cloudflare CDN cached, no JS challenge / CAPTCHA) | `200 OK` via plain HTTP GET |
| `robots.txt` | `User-agent: *` → `Allow: /` (`Content-Signal: search=yes,ai-train=no,use=reference`). AI training crawlers explicitly disallowed. | `User-agent: *` → `Disallow:` (open), `Sitemap: https://tv13.lk21official.cc/sitemap.xml` |
| Static HTML vs JS | Core catalog, homepage, detail pages, seasons, and episodes are **100% server-rendered static HTML + embedded JSON**. Only `/search` and `/rekomendasi-film-pintar` load results via XHR/AJAX. | 100% server-rendered static HTML using identical DOM schema |
| Scope & Copyright Guardrail | Metadata, posters, taxonomy, synopsis, cast/director, season/episode metadata, and canonical source URLs **only**. Video streams/embeds/downloads are strictly excluded. | Same metadata-only policy |

---

## 2. Homepage Architecture (`https://tv1.nontondrama.vip/`)

### 2.1 `<body>` Data Attributes
The `<body>` element exposes runtime configuration used by client-side scripts:
- `data-web_type`: `"series"`
- `data-thumbnail_url`: `"https://poster.assetsy.de/wp-content/uploads/"`
- `data-search_url`: `"https://gudangvape.com/"`
- `data-yml_host`: `"https://youlike.dadadidi.de/index.php"`

### 2.2 Navigation & Taxonomy Discovery
- **Header Nav (`header nav a`)**:
  - Genre dropdown: `/genre/{slug}` (20 top genres in nav; **30 total genres** in `.form-filter select[name="genre1"]`).
  - LK21 Movies dropdown: links to `https://d21.team/` (`/top-movie-today`, `/latest`, `/populer`).
  - Series dropdown: `/populer`, `/latest`, `/series/ongoing`, `/series/complete`, `/series/west`, `/series/asian`, `/rating`, `/release`.
  - Country dropdown: `/country/{slug}` (note: Indonesia nav item points externally to `http://www.21cineplex.com` and must be skipped; **47 countries** exist in `.form-filter select[name="country"]`).
  - Year dropdown: `/year/{YYYY}` (20 recent years in nav; **107 years** from `2026` down to `1920` in `.form-filter select[name="tahun"]`).
- **Search Form (`form.form-search`)**: `GET /search?s={query}` (client-side script `search.js` calls `{data-search_url}search.php?s={query}&page={page}`).

### 2.3 Homepage Content Sections
| Section | Selector / Heading | "More" Link | Cards | Notes |
|---|---|---|---|---|
| Featured Carousel | `section.featured` | — | 12 | Top featured series slider |
| Latest Series | `.widget` (`h2` = `TERBARU`) | `/latest-series` | 12 | Latest updated series |
| Latest Movies (LK21) | `.widget` (`h2` = `LK21 TERBARU`) | `https://d21.team/latest` | 12 | Movie cards (`label-HD`, runtime `HH:MM`) |
| Popular | `.widget` (`h2` = `TOP BULAN INI`) | `/populer` | 24 | Popular series |
| Recommendations | `.widget` (`h2` = `Rekomendasi Untukmu`) | `/rekomendasi-film-pintar` | 24 | Recommended series |
| Family / Collections | `Nonton Bareng Keluarga`, `Maraton Drakor` | `/nonton-bareng-keluarga`, `/maraton-drakor` | 12 / 24 | Curated series |
| Genre & Country Carousels | `Action/Horror/Romance/Comedy/Korea/China/Thailand Terbaru` | `/genre/...`, `/country/...` | 12 each | Category highlights |
| Full Latest Grid | `.widget` (`h2` = `Daftar Lengkap Series Terbaru`) | `/release/page/2` (`a.btn`) | 24 | `.gallery-grid` layout |

*(Note: `#you-may-wrapper` ("You May Also Like..") is empty in static HTML and populated from user watch-history in the browser; it is ignored by the static scraper.)*

---

## 3. Card HTML Structure & Selectors

Both slider cards (`li.slider > article`) and grid cards (`.gallery-grid > article`) share a unified Schema.org-annotated `<article>` structure:

```html
<article itemscope itemtype="https://schema.org/Movie">
  <meta itemprop="genre" content="Drama, Fantasy, History, Romance">
  <figure>
    <a href="/remarried-empress-2026" itemprop="url">
      <div class="poster">
        <span class="rating" itemprop="aggregateRating">
          <span itemprop="ratingValue">9.5</span>
          <meta itemprop="ratingCount" content="22495">
        </span>
        <span class="year" itemprop="datePublished">2026</span>
        <!-- Series cards: -->
        <span class="episode">EPS<strong>10</strong></span> <!-- or class="episode complete" -->
        <span class="duration">S.1</span>
        <!-- Movie cards: -->
        <!-- <span class="label label-HD">HD</span> -->
        <!-- <span class="duration">01:33</span> -->
        <picture>
          <img class="lazyload" data-src="https://poster.assetsy.de/...jpg" src="..." alt="Title (2026)" itemprop="image">
        </picture>
      </div>
      <figcaption>
        <div class="genre">Crime, Drama</div> <!-- present in gallery-grid -->
        <h3 class="poster-title" itemprop="name">The Remarried Empress</h3>
      </figcaption>
    </a>
  </figure>
</article>
```

### Extracted Card Selectors
- **Detail URL / Slug**: `a[itemprop="url"]` (fallback `figure > a`) → `href`
- **Title**: `h3.poster-title` (fallback `img[alt]`)
- **Poster URL**: `picture img[data-src]` → fallback `picture img[src]` → fallback `picture source[type="image/jpeg"]` (`data-srcset` / `srcset`)
- **Year**: `span.year` (integer, 4 digits)
- **Rating**: `span.rating [itemprop="ratingValue"]` (fallback text of `span.rating`)
- **Genres**: `meta[itemprop="genre"]@content` (comma-separated), fallback `figcaption .genre`
- **Content Type Detection**:
  - Presence of `span.episode` or `span.duration` matching `/^S\.\d+/i` → `series`
  - Presence of `span.label` (e.g., `HD`, `CAM`, `WEBDL`) or `span.duration` matching `/^\d{1,2}:\d{2}$/` or movie portal origin → `movie`
- **Status (Series)**: `span.episode.complete` → `completed`; `span.episode` without `complete` → `ongoing`
- **Latest Episode / Season badge**: `span.episode strong` (episode count), `span.duration` (`S.1` → season `1`)
- **Quality / Duration (Movies)**: `span.label` (quality), `span.duration` (runtime)

---

## 4. Catalog & Pagination Analysis

| Category | Path | Domain | Items/Page | Max Pages Observed |
|---|---|---|---|---|
| Latest Series | `/latest-series` | `tv1.nontondrama.vip` | 24 | 50 |
| Latest (Alias) | `/latest` | `tv1.nontondrama.vip` | 24 | 50 |
| Featured / Top Today | `/top-series-today` | `tv1.nontondrama.vip` | 24 | 50 |
| Popular | `/populer` | `tv1.nontondrama.vip` | 24 | 50 |
| Release Order | `/release` | `tv1.nontondrama.vip` | 24 | 50 |
| Top Rating | `/rating` | `tv1.nontondrama.vip` | 24 | 50 |
| Ongoing Series | `/series/ongoing` | `tv1.nontondrama.vip` | 24 | 45 |
| Completed Series | `/series/complete` | `tv1.nontondrama.vip` | 24 | 50 |
| Asian Series | `/series/asian` | `tv1.nontondrama.vip` | 24 | 50 |
| Western Series | `/series/west` | `tv1.nontondrama.vip` | 24 | 50 |
| Completed K-Drama | `/maraton-drakor` | `tv1.nontondrama.vip` | 24 | 41 |
| Family | `/nonton-bareng-keluarga` | `tv1.nontondrama.vip` | 24 | 12 |
| Genre Catalog | `/genre/{slug}` | `tv1.nontondrama.vip` | 24 | Variable (e.g., Action: 30) |
| Country Catalog | `/country/{slug}` | `tv1.nontondrama.vip` | 24 | Variable (e.g., South Korea: 49) |
| Year Catalog | `/year/{YYYY}` | `tv1.nontondrama.vip` | 24 | Variable (e.g., 2026: 27) |
| Recommendations | `POST /ajax/filter-recommendation` | `tv1.nontondrama.vip` | 24 | Dynamic HTML fragment |
| Movies Latest / Popular | `/latest`, `/populer`, `/top-movie-today` | `tv13.lk21official.cc` | 24 | 50 |

### Pagination Pattern & Critical Edge Case
- **URL Pattern**: `{categoryPath}/page/{pageNumber}` (e.g., `/latest-series/page/2`).
- **Selector**: `.pagination a` — the last link (`»`) points to `/page/{totalPages}`, giving exact total pages on page 1.
- **CRITICAL EDGE CASE (Out-of-Bounds Fallback)**: Requesting a page beyond `totalPages` (e.g., `/latest-series/page/51`) returns **`HTTP 200 OK` with the Homepage HTML** (`228` articles, no `.pagination` element, `<h1>` changes to `"Nonton Series Sub Indo Gratis di Lk21 Nonton Drama Official"`).
- **Mitigation**: The pagination engine MUST:
  1. Parse `totalPages` from `.pagination a` hrefs on page 1 (and subsequent pages).
  2. Stop when `page > totalPages`.
  3. Detect homepage fallback (e.g., presence of `section.featured` or missing `.gallery-grid` / missing `.pagination` on page > 1) and immediately halt pagination without ingesting fallback homepage items.

---

## 5. Detail Page Analysis (Series & Movies)

Every detail page exposes **three complementary structured sources**:

### 5.1 Embedded JSON (`<script id="watch-history-data" type="application/json">`)
- **Series example**:
  ```json
  {"id":35115,"title":"The Remarried Empress","rating":"9.5","total_eps":10,"total_season":1,"poster":"https://poster.assetsy.de/wp-content/uploads/2026/11/film-remarried-empress-2026-lk21.jpg","slug":"remarried-empress-2026","year":2026}
  ```
- **Movie example**:
  ```json
  {"id":35287,"title":"Rob Lowe: The Outsider","rating":"7.0","poster":"https://poster.assetsy.de/wp-content/uploads/2026/11/film-rob-lowe-outsider-2026-lk21.jpg","slug":"rob-lowe-outsider-2026","year":2026,"runtime":"01:33"}
  ```
Provides canonical `source_id`, clean `title`, `rating`, `poster`, `slug`, `year`, and `runtime` (movies) or `total_season`/`total_eps` (series).

### 5.2 Schema.org JSON-LD (`script[type="application/ld+json"]`)
The second JSON-LD block has `@type: "TVSeries"` (series) or `@type: "Movie"` (movies) and contains:
- `datePublished` (ISO date, e.g., `"2026-11-03"` or `"2026-11-24"`)
- `genre` (string array)
- `actor` (array of `{ "@type": "Person", "name": "..." }`)
- `director` (array of `{ "@type": "Person", "name": "..." }`)
- `image` (poster URL)

### 5.3 DOM Selectors
| Field | Selector | Series Example | Movie Example |
|---|---|---|---|
| Title (with year) | `.movie-info h1` | `The Remarried Empress (2026)` | `Rob Lowe: The Outsider (2026)` |
| Info Tags | `.movie-info .info-tag span` | `["3.11.2026", "Asian", "Ongoing"]` | `["17+", "WEBDL", "1080p", "1h 33m"]` |
| Country | `.tag-list a[href^="/country/"]` (fallback `.detail p` `"Negara:"`) | `South Korea` | `United States` |
| Genres | `.tag-list a[href^="/genre/"]` | `["Drama", "Fantasy", "History", "Romance"]` | `["Documentary", "Biography"]` |
| Synopsis | `.meta-info .synopsis` | Full Indonesian synopsis text | Full Indonesian synopsis text |
| Director | `.detail p` containing `Sutradara:` → `a` texts | `Jo Soo-won, Sim Na-yeon` | `Chris Smith` |
| Cast | `.detail p` containing `Bintang Film:` → `a` texts | `["Shin Min-a", ...]` | `["Rob Lowe", ...]` |
| Release / Updated | `.detail p` containing `Release:` / `Updated:` | Optional on series (present on episodes) | `24 Nov 2026` / `25 Nov 2026 12:17:03` |
| Related Content | `.widget` with `h2` matching `Terkait` → `article` | 12–15 related series cards | Related movie cards |
| Backdrop / Original Title | Not provided by source | `null` (never fabricated) | `null` (never fabricated) |

---

## 6. Season & Episode Analysis

On every series detail page, the complete season and episode manifest is embedded directly inside `<script id="season-data" type="application/json">`:

```json
{
  "1": [
    {
      "s": 1,
      "episode_no": 1,
      "title": "The Remarried Empress - Season 1 Episode 1 (2026)",
      "slug": "remarried-empress-season-1-episode-1-2026"
    }
  ]
}
```

- Verified across single-season ongoing (`/remarried-empress-2026`), single-season completed (`/defected-2019`, 30 episodes), multi-season ongoing (`/marshals-2026`, 2 seasons), and massive multi-season series (`/the-simpsons-1989`, 38 seasons, 98 KB JSON).
- **Episode Detail Pages** (`/{episode_slug}`) additionally contain:
  - `script[type="application/ld+json"]` (`@type: "TVEpisode"`): `episodeNumber`, `seasonNumber`, `datePublished`, `image`, `url`.
  - `.info-tag span`: quality badge (e.g., `WEBDL`), region, status.
  - `.detail p`: `Release:` and `Updated:` timestamps.
  - Because `season-data` already gives every season number, episode number, episode title, and episode slug/URL in a single detail fetch, bulk episode metadata is captured in **1 HTTP request per series**, with optional deep per-episode enrichment (`scrapeEpisodeDetail`) when release date/thumbnail enrichment is requested.

---

## 7. Search Endpoint Analysis

- Static `/search?s={query}` renders an empty shell (`#results`).
- `assets/js/page/search.js` calls `{data-search_url}search.php?s={query}&page={page}` (`https://gudangvape.com/search.php`).
- Returns JSON:
  ```json
  {
    "totalPages": 39,
    "data": [
      {
        "id": "5818c130...",
        "slug": "bangkok-love-stories-innocence-2018",
        "title": "Bangkok Love Stories: Innocence (2018) - Series",
        "type": "series",
        "year": 2018,
        "rating": 5.8,
        "quality": "",
        "runtime": "",
        "season": 1,
        "episode": 13,
        "is_complete": 1,
        "poster": "2026/11/film-bangkok-love-stories-innocence-2018-lk21.jpg"
      }
    ]
  }
  ```
- Poster path resolves against `data-thumbnail_url` (`https://poster.assetsy.de/wp-content/uploads/`).
- In accordance with the Core Philosophy (*Scrape Once, Store Permanently, Serve Efficiently*), our public `/api/v1/search` endpoint queries Supabase PostgreSQL (never scraping upstream per user request), while `src/scraper/search.js` provides a source search parser for discovery/sync tooling.

---

## 8. Risks & Mitigations

1. **Mirror Domain Rotation**: LK21/NontonDrama occasionally rotates subdomains (`tv1`, `tv13`). Mitigation: `SOURCE_BASE_URL` and `MOVIE_SOURCE_BASE_URL` are environment-configured; all relative links normalize cleanly against the active base URL.
2. **Homepage Fallback on Invalid/Out-of-Bounds Pages**: Detected explicitly via `section.featured` / missing pagination guard.
3. **Rate Limiting / Cloudflare Politeness**: Enforce configurable per-domain request delay (`SCRAPER_DELAY_MS`, default 500 ms), low concurrency (`SCRAPER_CONCURRENCY`, default 2), exponential backoff on 429/5xx, and strict max-page / max-retry caps.
4. **Missing Optional Fields**: `original_title`, `backdrop_url`, `episode.description`, `duration` (on series), and `quality` (on series cards) are legitimately absent on the source and stored as `null`.
