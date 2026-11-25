import { beforeEach, describe, expect, it } from 'vitest';
import { setDbClient } from '../src/database/client.js';
import {
  getContentBySlug,
  listContents,
  listCountries,
  listGenres,
  listYears,
  searchContents,
  upsertContents,
  upsertCountries,
  upsertGenres,
} from '../src/database/contents.js';
import { getEpisodesByContentId, upsertEpisodes } from '../src/database/episodes.js';
import { isCrawlerPaused, setCrawlerPaused } from '../src/database/jobs.js';
import { getSeasonsByContentId, upsertSeasons } from '../src/database/seasons.js';
import { normalizeContentRecord } from '../src/services/normalization.js';
import { createMockSupabase } from './helpers/mock-stores.js';

describe('Database Repositories (Upsert, Relations, Search & Filtering)', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockSupabase();
    setDbClient(mockDb);
  });

  it('performs non-destructive upserts and preserves previously scraped detail fields', async () => {
    const initial = normalizeContentRecord({
      source_id: '100',
      slug: 'remarried-empress-2026',
      title: 'The Remarried Empress',
      content_type: 'series',
      synopsis: 'Rich synopsis',
      director: 'Jo Soo-won',
      release_year: 2026,
      rating: 9.5,
      status: 'ongoing',
      country: 'South Korea',
      genres: ['Drama', 'Romance'],
      detail_source_url: 'https://tv1.nontondrama.vip/remarried-empress-2026',
    });

    const first = await upsertContents([initial]);
    expect(first.inserted).toBe(1);
    expect(first.updated).toBe(0);

    // Subsequent catalog refresh has null synopsis/director but updated episode count
    const refresh = normalizeContentRecord({
      slug: 'remarried-empress-2026',
      title: 'The Remarried Empress',
      content_type: 'series',
      total_episodes: 12,
      is_popular: true,
      detail_source_url: 'https://tv1.nontondrama.vip/remarried-empress-2026',
    });

    const second = await upsertContents([refresh]);
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(1);

    const saved = await getContentBySlug('remarried-empress-2026');
    expect(saved.synopsis).toBe('Rich synopsis');
    expect(saved.director).toBe('Jo Soo-won');
    expect(saved.total_episodes).toBe(12);
    expect(saved.is_popular).toBe(true);
    expect(mockDb.tables.contents).toHaveLength(1);
  });

  it('stores relational seasons and episodes and supports season filtering & pagination', async () => {
    const { records } = await upsertContents([
      normalizeContentRecord({
        slug: 'marshals-2026',
        title: 'Marshals',
        content_type: 'series',
        detail_source_url: 'https://tv1.nontondrama.vip/marshals-2026',
      }),
    ]);
    const content = records[0];

    const seasons = await upsertSeasons(content.id, [
      { season_number: 1, season_title: 'Season 1', episode_count: 2 },
      { season_number: 2, season_title: 'Season 2', episode_count: 1 },
    ]);
    expect(seasons).toHaveLength(2);

    await upsertEpisodes(content.id, seasons, [
      { season_number: 1, episode_number: 1, episode_title: 'S1E1', episode_slug: 'm-s1-e1', source_url: 'https://tv1.nontondrama.vip/m-s1-e1' },
      { season_number: 1, episode_number: 2, episode_title: 'S1E2', episode_slug: 'm-s1-e2', source_url: 'https://tv1.nontondrama.vip/m-s1-e2' },
      { season_number: 2, episode_number: 1, episode_title: 'S2E1', episode_slug: 'm-s2-e1', source_url: 'https://tv1.nontondrama.vip/m-s2-e1' },
    ]);

    const fetchedSeasons = await getSeasonsByContentId(content.id);
    expect(fetchedSeasons.map((s) => s.season_number)).toEqual([1, 2]);

    const s1Eps = await getEpisodesByContentId(content.id, { season: 1, page: 1, limit: 1 });
    expect(s1Eps.total).toBe(2);
    expect(s1Eps.items).toHaveLength(1);
    expect(s1Eps.items[0].season_number).toBe(1);
    expect(s1Eps.items[0].episode_number).toBe(1);
  });

  it('supports filtering, case-insensitive search, taxonomies, and crawler pause state', async () => {
    await upsertContents([
      normalizeContentRecord({
        slug: 'spider-man-2026',
        title: 'Spider-Man: New Dawn',
        content_type: 'movie',
        release_year: 2026,
        rating: 8.8,
        country: 'United States',
        genres: ['Action', 'Sci-Fi'],
        detail_source_url: 'https://tv13.lk21official.cc/spider-man-2026',
      }),
      normalizeContentRecord({
        slug: 'drama-korea-2025',
        title: 'Winter Blossom',
        content_type: 'series',
        release_year: 2025,
        rating: 9.1,
        status: 'completed',
        country: 'South Korea',
        genres: ['Drama', 'Romance'],
        detail_source_url: 'https://tv1.nontondrama.vip/drama-korea-2025',
      }),
    ]);

    await upsertGenres([{ name: 'Action', slug: 'action', source_url: 'https://tv1.nontondrama.vip/genre/action' }]);
    await upsertCountries([{ name: 'South Korea', slug: 'south-korea', source_url: 'https://tv1.nontondrama.vip/country/south-korea' }]);

    const searchRes = await searchContents({ q: 'SPIDER', type: 'movie', page: 1, limit: 10 });
    expect(searchRes.total).toBe(1);
    expect(searchRes.items[0].slug).toBe('spider-man-2026');

    const filtered = await listContents({ type: 'series', status: 'completed', genre: 'Drama', country: 'South Korea' });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0].slug).toBe('drama-korea-2025');

    expect((await listGenres()).length).toBe(1);
    expect((await listCountries()).length).toBe(1);
    expect((await listYears()).map((y) => y.year)).toEqual([2026, 2025]);

    expect(await isCrawlerPaused()).toBe(false);
    await setCrawlerPaused(true, 'test');
    expect(await isCrawlerPaused()).toBe(true);
  });
});
