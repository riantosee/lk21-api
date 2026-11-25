import { describe, expect, it, vi } from 'vitest';
import { parseHomepage } from '../src/scraper/homepage.js';
import { parseCatalogPage } from '../src/scraper/catalog.js';
import { crawlPaginatedCatalog, extractPaginationInfo } from '../src/scraper/pagination.js';
import { parseDetailPage } from '../src/scraper/detail.js';
import { parseEpisodeDetailPage, parseSeasonsAndEpisodes } from '../src/scraper/episodes.js';
import { parseSearchApiPayload } from '../src/scraper/search.js';

const SAMPLE_HOMEPAGE_HTML = `<!DOCTYPE html>
<html>
<body data-web_type="series" data-search_url="https://gudangvape.com/" data-thumbnail_url="https://poster.assetsy.de/wp-content/uploads/">
  <section class="featured">
    <ul class="sliders">
      <li class="slider">
        <article itemscope itemtype="https://schema.org/Movie">
          <meta itemprop="genre" content="Drama, Romance">
          <figure>
            <a href="/remarried-empress-2026" itemprop="url">
              <div class="poster">
                <span class="rating"><span itemprop="ratingValue">9.5</span></span>
                <span class="year">2026</span>
                <span class="episode">EPS<strong>10</strong></span>
                <span class="duration">S.1</span>
                <picture><img src="https://poster.assetsy.de/emp.jpg" alt="The Remarried Empress (2026)"></picture>
              </div>
              <figcaption><h3 class="poster-title">The Remarried Empress</h3></figcaption>
            </a>
          </figure>
        </article>
      </li>
    </ul>
  </section>
  <div class="widget">
    <div class="header"><h2>LK21 TERBARU</h2></div>
    <article>
      <meta itemprop="genre" content="Action">
      <figure>
        <a href="https://d21.team/fjord-2026" itemprop="url">
          <div class="poster">
            <span class="rating"><span itemprop="ratingValue">7.6</span></span>
            <span class="year">2026</span>
            <span class="label label-HD">HD</span>
            <span class="duration">02:27</span>
            <picture><img data-src="https://poster.assetsy.de/fjord.jpg" alt="Fjord (2026)"></picture>
          </div>
          <figcaption><h3 class="poster-title">Fjord</h3></figcaption>
        </a>
      </figure>
    </article>
  </div>
  <form class="form-filter">
    <select name="genre1"><option value="">- Pilih Genre</option><option value="action">Action</option><option value="drama">Drama</option></select>
    <select name="country"><option value="">- Negara</option><option value="south-korea">South Korea</option></select>
    <select name="tahun"><option value="0">- Tahun</option><option value="2026">2026</option><option value="2025">2025</option></select>
  </form>
</body>
</html>`;

const SAMPLE_SERIES_DETAIL_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:image" content="https://poster.assetsy.de/emp.jpg">
  <script type="application/ld+json">{"@type":"TVSeries","datePublished":"2026-11-03","genre":["Drama","Fantasy"],"actor":[{"name":"Shin Min-a"},{"name":"Lee Jong-suk"}],"director":[{"name":"Jo Soo-won"}]}</script>
</head>
<body>
  <div class="movie-info">
    <h1>The Remarried Empress (2026)</h1>
    <div class="info-tag"><span>3.11.2026</span><span>Asian</span><span>Ongoing</span></div>
    <div class="tag-list">
      <span class="tag"><a href="/country/south-korea">South Korea</a></span>
      <span class="tag"><a href="/genre/drama">Drama</a></span>
      <span class="tag"><a href="/genre/romance">Romance</a></span>
    </div>
  </div>
  <div class="meta-info">
    <div class="synopsis">Permaisuri Navier menghadapi intrik istana.</div>
    <div class="detail">
      <p><span>Sutradara: </span><a href="/director/jo-soo-won">Jo Soo-won</a></p>
      <p><span>Bintang Film: </span><a href="/artist/shin-min-a">Shin Min-a</a>, <a href="/artist/lee-jong-suk">Lee Jong-suk</a></p>
      <p><span>Negara: </span><a href="/country/south-korea">South Korea</a></p>
    </div>
  </div>
  <div class="widget">
    <div class="header"><h2>Series Terkait</h2></div>
    <article>
      <figure><a href="/red-sleeve-2021" itemprop="url"><div class="poster"><span class="year">2021</span><span class="episode complete">EPS<strong>17</strong></span><span class="duration">S.1</span></div><figcaption><h3 class="poster-title">Red Sleeve</h3></figcaption></a></figure>
    </article>
  </div>
  <script id="watch-history-data" type="application/json">{"id":35115,"title":"The Remarried Empress","rating":"9.5","total_eps":2,"total_season":2,"poster":"https://poster.assetsy.de/emp.jpg","slug":"remarried-empress-2026","year":2026}</script>
  <script id="season-data" type="application/json">{"1":[{"s":1,"episode_no":1,"title":"Ep 1","slug":"emp-s1-e1"}],"2":[{"s":2,"episode_no":1,"title":"S2 Ep 1","slug":"emp-s2-e1"}]}</script>
</body>
</html>`;

const SAMPLE_MOVIE_DETAIL_HTML = `<!DOCTYPE html>
<html>
<head>
  <script type="application/ld+json">{"@type":"Movie","datePublished":"2026-06-13","genre":["Drama"],"actor":[{"name":"Actor One"}],"director":[{"name":"Director One"}]}</script>
</head>
<body>
  <div class="movie-info">
    <h1>Fjord (2026)</h1>
    <div class="info-tag"><span>17+</span><span>WEBDL</span><span>1080p</span><span>2h 27m</span></div>
    <div class="tag-list"><span class="tag"><a href="/country/romania">Romania</a></span><span class="tag"><a href="/genre/drama">Drama</a></span></div>
  </div>
  <div class="meta-info">
    <div class="synopsis">A gripping drama.</div>
    <div class="detail">
      <p><span>Release: </span>13 Jun 2026</p>
      <p><span>Updated: </span>25 Nov 2026 12:00:00</p>
    </div>
  </div>
  <script id="watch-history-data" type="application/json">{"id":35288,"title":"Fjord","rating":"7.6","poster":"https://poster.assetsy.de/fjord.jpg","slug":"fjord-2026","year":2026,"runtime":"02:27"}</script>
</body>
</html>`;

describe('Scraper Parsers & Pagination Engine', () => {
  it('parses homepage sections, movie links, and taxonomy lists', () => {
    const parsed = parseHomepage(SAMPLE_HOMEPAGE_HTML);
    expect(parsed.sections.featured).toHaveLength(1);
    expect(parsed.sections.featured[0].content_type).toBe('series');
    expect(parsed.sections.featured[0].is_featured).toBe(true);
    expect(parsed.sections.featured[0].status).toBe('ongoing');
    expect(parsed.sections.latest_movies).toHaveLength(1);
    expect(parsed.sections.latest_movies[0].content_type).toBe('movie');
    expect(parsed.sections.latest_movies[0].quality).toBe('HD');
    expect(parsed.sections.latest_movies[0].duration).toBe('02:27');
    expect(parsed.taxonomy.genres).toHaveLength(2);
    expect(parsed.taxonomy.countries).toHaveLength(1);
    expect(parsed.taxonomy.years.map((y) => y.year)).toEqual([2026, 2025]);
  });

  it('parses series detail page including multi-season season-data and leaves missing fields null', () => {
    const result = parseDetailPage(SAMPLE_SERIES_DETAIL_HTML, 'https://tv1.nontondrama.vip/remarried-empress-2026');
    expect(result.content.source_id).toBe('35115');
    expect(result.content.content_type).toBe('series');
    expect(result.content.release_date).toBe('2026-11-03');
    expect(result.content.status).toBe('ongoing');
    expect(result.content.region).toBe('Asian');
    expect(result.content.country).toBe('South Korea');
    expect(result.content.director).toBe('Jo Soo-won');
    expect(result.content.cast).toEqual(['Shin Min-a', 'Lee Jong-suk']);
    expect(result.content.original_title).toBeNull();
    expect(result.content.backdrop_url).toBeNull();
    expect(result.seasons).toHaveLength(2);
    expect(result.episodes).toHaveLength(2);
    expect(result.related).toHaveLength(1);
    expect(result.content.related_slugs).toEqual(['red-sleeve-2021']);
  });

  it('parses movie detail page with quality, duration, and empty seasons/episodes', () => {
    const result = parseDetailPage(SAMPLE_MOVIE_DETAIL_HTML, 'https://tv13.lk21official.cc/fjord-2026');
    expect(result.content.content_type).toBe('movie');
    expect(result.content.quality).toBe('WEBDL 1080p');
    expect(result.content.duration).toBe('2h 27m');
    expect(result.content.status).toBe('released');
    expect(result.content.country).toBe('Romania');
    expect(result.seasons).toEqual([]);
    expect(result.episodes).toEqual([]);
  });

  it('throws explicit PARSE_ERROR on completely changed/unrecognized detail HTML', () => {
    expect(() => parseDetailPage('<html><body><div>Empty</div></body></html>', 'https://tv1.nontondrama.vip/broken')).toThrow(
      /Unrecognized detail page structure/
    );
  });

  it('parses episode detail JSON-LD and handles missing season-data gracefully', () => {
    const empty = parseSeasonsAndEpisodes('<html><body></body></html>');
    expect(empty).toEqual({ seasons: [], episodes: [] });

    const epHtml = `<html><head><script type="application/ld+json">{"@type":"TVEpisode","episodeNumber":3,"seasonNumber":2,"datePublished":"2026-11-10","image":"https://poster.assetsy.de/ep3.jpg"}</script></head><body><h1>Show S2E3</h1><div class="synopsis">Episode summary</div></body></html>`;
    const ep = parseEpisodeDetailPage(epHtml, 'https://tv1.nontondrama.vip/show-s2-e3');
    expect(ep.season_number).toBe(2);
    expect(ep.episode_number).toBe(3);
    expect(ep.release_date).toBe('2026-11-10');
    expect(ep.description).toBe('Episode summary');
  });

  it('detects homepage fallback on out-of-bounds pagination and recovers from failed pages', async () => {
    const page1Html = `<html><body><div class="gallery-grid"><article><a href="/a-2026" itemprop="url"><h3 class="poster-title">A</h3></a></article></div><div class="pagination"><a href="/latest/page/1">1</a><a href="/latest/page/2">2</a><a href="/latest/page/3">3</a></div></body></html>`;
    const page3FallbackHtml = SAMPLE_HOMEPAGE_HTML; // section.featured -> homepage fallback

    expect(extractPaginationInfo(page1Html, 1)).toEqual({
      currentPage: 1,
      totalPages: 3,
      hasNextPage: true,
      isHomepageFallback: false,
    });
    expect(extractPaginationInfo(page3FallbackHtml, 3).isHomepageFallback).toBe(true);

    const mockClient = {
      fetchHtml: vi.fn(async (url) => {
        if (url.endsWith('/latest')) return { html: page1Html, finalUrl: url };
        if (url.endsWith('/page/2')) throw new Error('Simulated timeout on page 2');
        return { html: page3FallbackHtml, finalUrl: url };
      }),
    };

    const crawl = await crawlPaginatedCatalog({
      baseUrl: 'https://tv1.nontondrama.vip',
      path: '/latest',
      maxPages: 5,
      client: mockClient,
      parsePage: ($, ctx) => parseCatalogPage($, { page: ctx.page }).items,
    });

    expect(crawl.items).toHaveLength(1);
    expect(crawl.failedPages).toHaveLength(1);
    expect(crawl.failedPages[0].page).toBe(2);
    expect(crawl.hasMore).toBe(false);
  });

  it('parses search API JSON payloads into normalized records', () => {
    const parsed = parseSearchApiPayload({
      totalPages: 2,
      data: [
        {
          id: 'abc123',
          slug: 'love-destiny-2018',
          title: 'Love Destiny (2018) - Series',
          type: 'series',
          year: 2018,
          rating: 8.2,
          season: 1,
          episode: 14,
          is_complete: 1,
          poster: '2026/11/love.jpg',
        },
      ],
    });
    expect(parsed.totalPages).toBe(2);
    expect(parsed.items[0].title).toBe('Love Destiny');
    expect(parsed.items[0].status).toBe('completed');
    expect(parsed.items[0].poster_url).toBe('https://poster.assetsy.de/wp-content/uploads/2026/11/love.jpg');
  });
});
