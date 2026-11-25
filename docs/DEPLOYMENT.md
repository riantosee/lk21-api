# Deployment Guide (Supabase + Upstash + Vercel)

## 1. Prerequisites

- Node.js `>= 20.0.0`
- A [Supabase](https://supabase.com/) PostgreSQL project
- An [Upstash Redis](https://upstash.com/) database *(optional; API falls back to Supabase automatically if omitted)*
- A [Vercel](https://vercel.com/) account & Vercel CLI (`npm i -g vercel`)

## 2. Database Setup (Supabase)

1. Create a new Supabase project.
2. Open **SQL Editor** and run [src/database/migrations/001_initial_schema.sql](../src/database/migrations/001_initial_schema.sql).
3. From **Project Settings → API**, copy:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` *(server-side only — never expose in client bundles)*

## 3. Cache Setup (Upstash Redis — Optional)

1. Create a serverless Redis database in Upstash.
2. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

## 4. Environment Variables

Configure these variables in Vercel (**Project Settings → Environment Variables**) and locally in `.env` (never commit `.env`):

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `ADMIN_API_SECRET` | Yes | High-entropy secret protecting `/api/v1/admin/*` |
| `CRON_SECRET` | Yes | Secret automatically attached by Vercel Cron to `/api/v1/cron/*` |
| `UPSTASH_REDIS_REST_URL` | Optional | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Upstash Redis REST token |
| `SOURCE_BASE_URL` | Optional | Defaults to `https://tv1.nontondrama.vip` |
| `MOVIE_SOURCE_BASE_URL` | Optional | Defaults to `https://tv13.lk21official.cc` |
| `SEARCH_API_BASE_URL` | Optional | Defaults to `https://gudangvape.com` |
| `CORS_ORIGIN` | Optional | Defaults to `*` (restrict to your frontend origin in production) |

Generate strong secrets with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 5. Deploy to Vercel

```bash
npm install
npm test
vercel --prod
```

Vercel automatically picks up [vercel.json](../vercel.json), configures serverless function timeouts, security headers, and registers the scheduled cron jobs:
- `/api/v1/cron/quick-sync` — every 45 minutes (`*/45 * * * *`)
- `/api/v1/cron/detail-sync` — every 2 hours (`0 */2 * * *`)
- `/api/v1/cron/episode-sync` — every 4 hours (`30 */4 * * *`)

## 6. Initial Catalog Bootstrap & Production Smoke Test

1. Verify health:
   ```bash
   curl -s https://<your-domain>/api/v1/health | jq
   ```
2. Trigger initial quick sync (or run `npm run sync:quick` / `npm run sync:full` from a worker/CLI with `.env` configured):
   ```bash
   curl -X POST https://<your-domain>/api/v1/admin/sync \
     -H "Authorization: Bearer $ADMIN_API_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"type":"quick","maxPages":2}'
   ```
3. Trigger detail enrichment batch:
   ```bash
   curl -X POST https://<your-domain>/api/v1/admin/sync \
     -H "Authorization: Bearer $ADMIN_API_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"type":"detail","batchSize":15}'
   ```
4. Verify public endpoints:
   ```bash
   curl -s https://<your-domain>/api/v1/home
   curl -s "https://<your-domain>/api/v1/series?page=1&limit=10"
   curl -s "https://<your-domain>/api/v1/search?q=empress"
   ```
