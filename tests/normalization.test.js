import { describe, expect, it } from 'vitest';
import {
  buildDedupeKey,
  deduplicateContents,
  extractSlugFromUrl,
  mergeContentRecords,
  normalizeContentRecord,
  normalizeDate,
  normalizeRating,
  normalizeStatus,
  normalizeTitle,
  normalizeYear,
} from '../src/services/normalization.js';

describe('Data Normalization & Deduplication', () => {
  it('normalizes titles, years, ratings, statuses, and slugs cleanly', () => {
    expect(normalizeTitle('The Remarried Empress (2026)')).toBe('The Remarried Empress');
    expect(normalizeTitle('Love Destiny (2018) - Series')).toBe('Love Destiny');
    expect(extractSlugFromUrl('https://tv1.nontondrama.vip/remarried-empress-2026')).toBe('remarried-empress-2026');
    expect(normalizeYear('Released 2026')).toBe(2026);
    expect(normalizeYear('invalid')).toBeNull();
    expect(normalizeRating('9.5')).toBe(9.5);
    expect(normalizeRating('0')).toBeNull();
    expect(normalizeRating('12.5')).toBeNull();
    expect(normalizeStatus('Ongoing', 'series')).toBe('ongoing');
    expect(normalizeStatus('Complete', 'series')).toBe('completed');
    expect(normalizeStatus(null, 'movie')).toBe('released');
  });

  it('parses dotted, ISO, and named-month dates accurately', () => {
    expect(normalizeDate('3.11.2026')).toBe('2026-11-03');
    expect(normalizeDate('2026-11-24')).toBe('2026-11-24');
    expect(normalizeDate('24 Nov 2026')).toBe('2026-11-24');
    expect(normalizeDate('not-a-date')).toBeNull();
  });

  it('preserves existing rich detail fields during non-destructive merge', () => {
    const existing = normalizeContentRecord({
      source_id: '35115',
      source_slug: 'remarried-empress-2026',
      slug: 'remarried-empress-2026',
      title: 'The Remarried Empress',
      content_type: 'series',
      synopsis: 'Full synopsis already stored',
      director: 'Jo Soo-won',
      cast: ['Shin Min-a', 'Lee Jong-suk'],
      genres: ['Drama', 'Fantasy'],
      is_featured: true,
      detail_source_url: 'https://tv1.nontondrama.vip/remarried-empress-2026',
    });

    const incomingCard = normalizeContentRecord({
      source_slug: 'remarried-empress-2026',
      slug: 'remarried-empress-2026',
      title: 'The Remarried Empress',
      content_type: 'series',
      synopsis: null,
      director: null,
      cast: [],
      genres: ['Romance'],
      is_popular: true,
      total_episodes: 11,
      detail_source_url: 'https://tv1.nontondrama.vip/remarried-empress-2026',
    });

    const merged = mergeContentRecords(existing, incomingCard);
    expect(merged.synopsis).toBe('Full synopsis already stored');
    expect(merged.director).toBe('Jo Soo-won');
    expect(merged.cast).toEqual(['Shin Min-a', 'Lee Jong-suk']);
    expect(merged.genres).toEqual(['Drama', 'Fantasy', 'Romance']);
    expect(merged.is_featured).toBe(true);
    expect(merged.is_popular).toBe(true);
    expect(merged.total_episodes).toBe(11);
  });

  it('deduplicates identical source URLs while keeping distinct titles with same name apart', () => {
    const a1 = normalizeContentRecord({
      title: 'The Substitute',
      release_year: 2026,
      content_type: 'series',
      is_featured: true,
      detail_source_url: 'https://tv1.nontondrama.vip/substitute-2026',
    });
    const a2 = normalizeContentRecord({
      title: 'The Substitute',
      release_year: 2026,
      content_type: 'series',
      is_popular: true,
      detail_source_url: 'https://tv1.nontondrama.vip/substitute-2026',
    });
    const b = normalizeContentRecord({
      title: 'The Substitute',
      release_year: 1996,
      content_type: 'movie',
      detail_source_url: 'https://tv13.lk21official.cc/substitute-1996',
    });

    const deduped = deduplicateContents([a1, a2, b]);
    expect(deduped).toHaveLength(2);
    expect(buildDedupeKey(a1)).not.toBe(buildDedupeKey(b));
    const mergedA = deduped.find((x) => x.slug === 'substitute-2026');
    expect(mergedA.is_featured).toBe(true);
    expect(mergedA.is_popular).toBe(true);
  });
});
