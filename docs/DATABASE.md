# Database Schema & Data Model

**Engine:** PostgreSQL (Supabase)  
**Migration File:** [001_initial_schema.sql](../src/database/migrations/001_initial_schema.sql)

## Tables

1. **`contents`** — Master metadata catalog for movies and series.
   - Primary Key: `id` (`UUID`)
   - Uniqueness: `slug` (`UNIQUE`), `detail_source_url` (`UNIQUE`), `(content_type, source_slug)` (`UNIQUE`)
   - Key Indexes: `slug`, trigram GIN on `LOWER(title)`, `release_year DESC`, `content_type`, `rating DESC`, `status`, `LOWER(country)`, GIN on `genres`, `scraped_at DESC`, `detail_scraped_at ASC NULLS FIRST` (detail sync queue), `(content_type, is_featured, is_popular, is_recommended)`.
2. **`seasons`** — Relational seasons linked to `contents(id)` (`ON DELETE CASCADE`), unique on `(content_id, season_number)`.
3. **`episodes`** — Relational episodes linked to `contents(id)` and `seasons(id)` (`ON DELETE CASCADE`), unique on `(season_id, episode_number)` and `source_url`.
4. **`genres`** — Canonical genre registry (`id`, `name`, `slug` UNIQUE, `source_url`).
5. **`countries`** — Canonical country registry (`id`, `name`, `slug` UNIQUE, `source_url`).
6. **`scraper_jobs`** — Tracks job type, target URL, status (`queued`/`running`/`paused`/`completed`/`failed`), page/item counters, error messages, and resume cursor metadata (`JSONB`).
7. **`sync_logs`** — Audit history of every quick/full/detail/episode synchronization run.
8. **`scraper_settings`** — Serverless-safe key/value state storing the `crawler_control` pause/resume flag.

## Non-Destructive Upsert Strategy

- Catalog list cards contain fewer fields than detail pages (e.g., no `synopsis`, `cast`, `director`, or `release_date`).
- `upsertContents()` always loads existing rows matching `detail_source_url` or `slug` first and merges via `mergeContentRecords()`:
  - Incoming non-null values update or enrich existing columns.
  - Incoming `null` or empty array values **never** overwrite already-populated fields.
  - Boolean curation flags (`is_featured`, `is_popular`, `is_recommended`) merge monotonically.
  - Failed scraper runs never delete or truncate previously persisted records.

## Applying Migrations in Supabase

1. Open your Supabase project dashboard → **SQL Editor**.
2. Paste and execute [src/database/migrations/001_initial_schema.sql](../src/database/migrations/001_initial_schema.sql).
3. Verify extensions (`pgcrypto`, `pg_trgm`) and all 8 tables are created cleanly.
