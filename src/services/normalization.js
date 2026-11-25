const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  mei: '05', agu: '08', okt: '10', des: '12',
};

export function cleanText(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function slugify(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function extractSlugFromUrl(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== 'string') return '';
  try {
    const pathname = urlOrPath.startsWith('http')
      ? new URL(urlOrPath).pathname
      : urlOrPath.split('?')[0];
    const parts = pathname.split('/').filter(Boolean);
    return (parts[parts.length - 1] || '').toLowerCase();
  } catch {
    return slugify(urlOrPath);
  }
}

export function resolveUrl(href, baseUrl) {
  if (!href || typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed === '#' || /^javascript:/i.test(trimmed)) return null;
  try {
    return new URL(trimmed, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
  } catch {
    return null;
  }
}

export function normalizeTitle(rawTitle) {
  const text = cleanText(rawTitle);
  if (!text) return null;
  return text
    .replace(/\s*-\s*Series$/i, '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .trim();
}

export function normalizeYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  return year >= 1888 && year <= 2100 ? year : null;
}

export function normalizeRating(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).replace(',', '.').match(/\d+(\.\d+)?/);
  if (!match) return null;
  const num = Number.parseFloat(match[0]);
  if (!Number.isFinite(num) || num <= 0 || num > 10) return null;
  return Math.round(num * 10) / 10;
}

export function normalizeDate(value) {
  const text = cleanText(value);
  if (!text) return null;

  // ISO YYYY-MM-DD (optionally with timestamp)
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Dotted D.M.YYYY or DD.MM.YYYY (observed in NontonDrama .info-tag e.g. 3.11.2026)
  const dotted = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotted) {
    const [, d, m, y] = dotted;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Named month e.g. "24 Nov 2026"
  const named = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (month) return `${named[3]}-${month}-${named[1].padStart(2, '0')}`;
  }

  return null;
}

export function normalizeTimestamp(value) {
  const text = cleanText(value);
  if (!text) return null;

  const isoDate = normalizeDate(text);
  const timeMatch = text.match(/\b(\d{2}:\d{2}(?::\d{2})?)\b/);
  if (isoDate && timeMatch) {
    const time = timeMatch[1].length === 5 ? `${timeMatch[1]}:00` : timeMatch[1];
    const parsed = new Date(`${isoDate}T${time}Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const direct = new Date(text);
  return Number.isNaN(direct.getTime()) ? null : direct.toISOString();
}

export function normalizeStatus(rawStatus, contentType = 'series') {
  const text = (cleanText(rawStatus) || '').toLowerCase();
  if (text.includes('ongoing') || text.includes('airing')) return 'ongoing';
  if (text.includes('complete') || text.includes('ended') || text.includes('finished')) return 'completed';
  if (text.includes('released')) return 'released';
  return contentType === 'movie' ? 'released' : null;
}

export function normalizeStringList(items) {
  if (!items) return [];
  const raw = Array.isArray(items) ? items : String(items).split(',');
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const cleaned = cleanText(item);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(cleaned);
    }
  }
  return out;
}

export function buildDedupeKey(item) {
  const type = item.content_type || 'series';
  if (item.detail_source_url) return `url:${item.detail_source_url.toLowerCase()}`;
  if (item.source_id) return `id:${type}:${item.source_id}`;
  if (item.source_slug) return `slug:${type}:${item.source_slug.toLowerCase()}`;
  return `title:${type}:${slugify(item.title)}:${item.release_year || ''}`;
}

export function deduplicateContents(items) {
  const map = new Map();
  for (const item of items) {
    const key = buildDedupeKey(item);
    const existing = map.get(key);
    map.set(key, existing ? mergeContentRecords(existing, item) : item);
  }
  return Array.from(map.values());
}

/**
 * Non-destructive merge: incoming non-null fields enrich existing records,
 * while null/empty fields NEVER wipe previously scraped metadata.
 */
export function mergeContentRecords(existing, incoming) {
  const merged = { ...existing };
  for (const [key, val] of Object.entries(incoming)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      if (val.length > 0) {
        merged[key] = normalizeStringList([...(existing[key] || []), ...val]);
      }
      continue;
    }
    if (typeof val === 'boolean') {
      merged[key] = Boolean(existing[key]) || val;
      continue;
    }
    if (typeof val === 'string' && val.trim() === '') continue;
    merged[key] = val;
  }
  return merged;
}

export function normalizeContentRecord(raw) {
  const contentType = raw.content_type === 'movie' ? 'movie' : 'series';
  const sourceSlug = extractSlugFromUrl(raw.source_slug || raw.detail_source_url || raw.slug);
  const title = normalizeTitle(raw.title) || sourceSlug;
  const slug = slugify(raw.slug || sourceSlug || title);

  const record = {
    source_id: raw.source_id != null && String(raw.source_id).trim() !== '' ? String(raw.source_id).trim() : null,
    source_slug: sourceSlug,
    title,
    original_title: cleanText(raw.original_title),
    alternative_titles: normalizeStringList(raw.alternative_titles),
    slug,
    content_type: contentType,
    poster_url: raw.poster_url && /^https?:\/\//i.test(raw.poster_url) ? raw.poster_url : null,
    backdrop_url: raw.backdrop_url && /^https?:\/\//i.test(raw.backdrop_url) ? raw.backdrop_url : null,
    synopsis: cleanText(raw.synopsis),
    release_year: normalizeYear(raw.release_year ?? raw.title),
    release_date: normalizeDate(raw.release_date),
    rating: normalizeRating(raw.rating),
    duration: cleanText(raw.duration),
    quality: cleanText(raw.quality),
    status: normalizeStatus(raw.status, contentType),
    region: cleanText(raw.region),
    country: cleanText(raw.country),
    director: cleanText(Array.isArray(raw.director) ? raw.director.join(', ') : raw.director),
    cast: normalizeStringList(raw.cast),
    genres: normalizeStringList(raw.genres),
    related_slugs: normalizeStringList(raw.related_slugs),
    total_seasons: Number.isInteger(raw.total_seasons) ? raw.total_seasons : null,
    total_episodes: Number.isInteger(raw.total_episodes) ? raw.total_episodes : null,
    detail_source_url: raw.detail_source_url,
    source_updated_at: normalizeTimestamp(raw.source_updated_at),
    detail_scraped_at: raw.detail_scraped_at || null,
  };

  if (typeof raw.is_featured === 'boolean') record.is_featured = raw.is_featured;
  if (typeof raw.is_popular === 'boolean') record.is_popular = raw.is_popular;
  if (typeof raw.is_recommended === 'boolean') record.is_recommended = raw.is_recommended;

  return record;
}
