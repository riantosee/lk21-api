# NontonDrama API

Production-grade web scraping and metadata REST API platform for NontonDrama / LK21, built with Node.js (ESM), Cheerio, Supabase PostgreSQL, Upstash Redis, and Vercel Functions.

> **Core Philosophy:** *Scrape Once, Store Permanently, Serve Efficiently.*  
> Public API endpoints strictly serve cached/persisted PostgreSQL metadata and never scrape upstream websites per user request.

## Highlights

- **Verified Static HTML + JSON Scraping**: Reconstructed directly from `https://tv1.nontondrama.vip/` (Series) and companion LK21 movie portal (`tv13.lk21official.cc`) without headless browser overhead.
- **Complete Relational Metadata**: Stores movies, series, seasons, episodes, genres, countries, scraper jobs, and sync audit logs in Supabase PostgreSQL.
- **Non-Destructive Deduplicated Sync**: Preserves rich detail metadata when catalog refreshes run; logs and recovers failed URLs without erasing existing records.
- **Serverless REST API (`/api/v1`)**: Consistent JSON envelope, Zod input validation, namespace-versioned Upstash Redis caching (with automatic DB fallback), IP rate limiting, and constant-time admin/cron authentication.
- **Automated Operations**: Bounded quick sync, resumable full catalog sync, detail enrichment queue, episode sync, pause/resume crawler controls, and Vercel Cron schedules.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run automated test suite
npm test

# 3. Verify live source parsers (no DB required)
npm run discover

# 4. Copy environment template and fill in Supabase / Upstash / Secrets
cp .env.example .env

# 5. Run quick sync or resumable full catalog sync
npm run sync:quick
npm run sync:full -- --category=latest-series --start-page=1 --max-pages=5 --details
npm run sync:retry
```

## Documentation

- [Source Website Analysis](docs/SOURCE_ANALYSIS.md) — Verified DOM selectors, pagination edge cases, and `robots.txt` audit
- [REST API Reference](docs/API.md) & [OpenAPI 3.1 Spec](docs/openapi.yaml)
- [Scraper Engine Guide](docs/SCRAPER.md)
- [Database Schema & Migrations](docs/DATABASE.md)
- [Production Deployment Guide](docs/DEPLOYMENT.md)

## Compliance & Security

- Metadata, posters, taxonomy, and canonical source page links **only** — no video streams, embeds, or copyrighted audiovisual files are scraped or distributed.
- Respects `robots.txt`, rate limits per domain, caps retries/pages, and aborts immediately on `403` or anti-bot challenges without attempting to bypass access protections.
- Secrets are loaded strictly from environment variables and redacted from structured Pino logs.
