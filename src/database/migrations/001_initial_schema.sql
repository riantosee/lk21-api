-- NontonDrama API — Initial PostgreSQL Schema (Supabase Compatible)
-- Safe, idempotent migration preserving existing records across re-runs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Automatic updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. contents
CREATE TABLE IF NOT EXISTS contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT,
  source_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT,
  alternative_titles JSONB NOT NULL DEFAULT '[]'::jsonb,
  slug TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('movie', 'series')),
  poster_url TEXT,
  backdrop_url TEXT,
  synopsis TEXT,
  release_year INTEGER CHECK (release_year IS NULL OR (release_year >= 1888 AND release_year <= 2100)),
  release_date DATE,
  rating NUMERIC(3, 1) CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10)),
  duration TEXT,
  quality TEXT,
  status TEXT CHECK (status IS NULL OR status IN ('ongoing', 'completed', 'released', 'unknown')),
  region TEXT,
  country TEXT,
  director TEXT,
  "cast" JSONB NOT NULL DEFAULT '[]'::jsonb,
  genres JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_slugs JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_popular BOOLEAN NOT NULL DEFAULT FALSE,
  is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  total_seasons INTEGER,
  total_episodes INTEGER,
  detail_source_url TEXT NOT NULL UNIQUE,
  source_updated_at TIMESTAMPTZ,
  detail_scraped_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_contents_type_source_slug UNIQUE (content_type, source_slug)
);

CREATE INDEX IF NOT EXISTS idx_contents_slug ON contents (slug);
CREATE INDEX IF NOT EXISTS idx_contents_title_trgm ON contents USING GIN (LOWER(title) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contents_release_year ON contents (release_year DESC);
CREATE INDEX IF NOT EXISTS idx_contents_content_type ON contents (content_type);
CREATE INDEX IF NOT EXISTS idx_contents_rating ON contents (rating DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_contents_status ON contents (status);
CREATE INDEX IF NOT EXISTS idx_contents_country ON contents (LOWER(country));
CREATE INDEX IF NOT EXISTS idx_contents_genres_gin ON contents USING GIN (genres);
CREATE INDEX IF NOT EXISTS idx_contents_scraped_at ON contents (scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_contents_detail_queue ON contents (detail_scraped_at ASC NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_contents_flags ON contents (content_type, is_featured, is_popular, is_recommended);

DROP TRIGGER IF EXISTS trg_contents_updated_at ON contents;
CREATE TRIGGER trg_contents_updated_at
  BEFORE UPDATE ON contents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. seasons
CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES contents (id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL CHECK (season_number >= 0),
  season_title TEXT,
  description TEXT,
  episode_count INTEGER NOT NULL DEFAULT 0 CHECK (episode_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_seasons_content_number UNIQUE (content_id, season_number)
);

CREATE INDEX IF NOT EXISTS idx_seasons_content_id ON seasons (content_id, season_number);

DROP TRIGGER IF EXISTS trg_seasons_updated_at ON seasons;
CREATE TRIGGER trg_seasons_updated_at
  BEFORE UPDATE ON seasons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. episodes
CREATE TABLE IF NOT EXISTS episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES contents (id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES seasons (id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL CHECK (episode_number >= 0),
  episode_title TEXT,
  episode_slug TEXT NOT NULL,
  thumbnail_url TEXT,
  description TEXT,
  release_date DATE,
  source_url TEXT NOT NULL UNIQUE,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_episodes_season_number UNIQUE (season_id, episode_number)
);

CREATE INDEX IF NOT EXISTS idx_episodes_content_id ON episodes (content_id);
CREATE INDEX IF NOT EXISTS idx_episodes_season_id ON episodes (season_id, episode_number);
CREATE INDEX IF NOT EXISTS idx_episodes_slug ON episodes (episode_slug);

DROP TRIGGER IF EXISTS trg_episodes_updated_at ON episodes;
CREATE TRIGGER trg_episodes_updated_at
  BEFORE UPDATE ON episodes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. genres
CREATE TABLE IF NOT EXISTS genres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_genres_slug ON genres (slug);

DROP TRIGGER IF EXISTS trg_genres_updated_at ON genres;
CREATE TRIGGER trg_genres_updated_at
  BEFORE UPDATE ON genres
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. countries
CREATE TABLE IF NOT EXISTS countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_countries_slug ON countries (slug);

DROP TRIGGER IF EXISTS trg_countries_updated_at ON countries;
CREATE TRIGGER trg_countries_updated_at
  BEFORE UPDATE ON countries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. scraper_jobs
CREATE TABLE IF NOT EXISTS scraper_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  target_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'paused', 'completed', 'failed')),
  pages_processed INTEGER NOT NULL DEFAULT 0,
  items_discovered INTEGER NOT NULL DEFAULT 0,
  items_processed INTEGER NOT NULL DEFAULT 0,
  items_failed INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraper_jobs_status ON scraper_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_jobs_type ON scraper_jobs (job_type, created_at DESC);

DROP TRIGGER IF EXISTS trg_scraper_jobs_updated_at ON scraper_jobs;
CREATE TRIGGER trg_scraper_jobs_updated_at
  BEFORE UPDATE ON scraper_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7. sync_logs
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'partial', 'failed', 'paused')),
  total_discovered INTEGER NOT NULL DEFAULT 0,
  total_inserted INTEGER NOT NULL DEFAULT 0,
  total_updated INTEGER NOT NULL DEFAULT 0,
  total_skipped INTEGER NOT NULL DEFAULT 0,
  total_failed INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON sync_logs (started_at DESC);

-- 8. scraper_settings (serverless-safe runtime state e.g., pause/resume flag)
CREATE TABLE IF NOT EXISTS scraper_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO scraper_settings (key, value)
VALUES ('crawler_control', '{"paused": false, "updated_by": "migration"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
