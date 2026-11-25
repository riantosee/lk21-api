const API_BASE = '/api/v1';
const STORAGE_LIST_KEY = 'nd_my_list_v1';
const STORAGE_HISTORY_KEY = 'nd_watch_history_v1';
const FALLBACK_POSTER =
  'data:image/svg+xml;charset=UTF-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="300" height="450" fill="#181820"/><text x="50%" y="50%" fill="#e50914" font-family="sans-serif" font-weight="bold" font-size="22" text-anchor="middle">NONTONDRAMA</text></svg>'
  );

const state = {
  home: null,
  heroItems: [],
  heroIndex: 0,
  heroTimer: null,
  genres: [],
  countries: [],
  years: [],

  // Section 1 (Trends)
  trendTab: 'featured',
  trendGenre: '',

  // Section 2 (Catalog)
  catalogTab: 'movies',
  catalogGenre: '',
  catalogSort: 'latest',
  catalogYear: '',
  catalogCountry: '',
  catalogMinRating: 0,
  catalogSearch: '',
  catalogPage: 1,
  catalogTotalPages: 1,

  // Personal (localStorage only, no login)
  personalTab: 'list',
  myList: loadStorage(STORAGE_LIST_KEY, []),
  history: loadStorage(STORAGE_HISTORY_KEY, []),

  // Active modal item
  activeItem: null,
};

const $ = (id) => document.getElementById(id);

function loadStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // ignore quota errors
  }
}

function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), 2600);
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message || `HTTP ${res.status}`);
  }
  return json;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isInMyList(slug) {
  return state.myList.some((x) => x.slug === slug);
}

function toggleMyList(item) {
  if (!item?.slug) return;
  if (isInMyList(item.slug)) {
    state.myList = state.myList.filter((x) => x.slug !== item.slug);
    showToast(`Dihapus dari My List: ${item.title}`);
  } else {
    state.myList = [item, ...state.myList.filter((x) => x.slug !== item.slug)].slice(0, 50);
    showToast(`Ditambahkan ke My List: ${item.title}`);
  }
  saveStorage(STORAGE_LIST_KEY, state.myList);
  updatePersonalUI();
  syncHeroListButton();
  syncModalListButton();
}

function recordWatchHistory(item) {
  if (!item?.slug) return;
  state.history = [item, ...state.history.filter((x) => x.slug !== item.slug)].slice(0, 30);
  saveStorage(STORAGE_HISTORY_KEY, state.history);
  updatePersonalUI();
}

function updatePersonalUI() {
  $('myListCount').textContent = String(state.myList.length);
  const section = $('mylist');
  const items = state.personalTab === 'list' ? state.myList : state.history;
  if (state.myList.length === 0 && state.history.length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  renderCardList($('personalRow'), items, 'Belum ada item di daftar ini.');
}

function createCardElement(item) {
  const card = document.createElement('article');
  card.className = 'card';
  const saved = isInMyList(item.slug);
  const poster = item.poster_url || FALLBACK_POSTER;
  const badgeLeft =
    item.content_type === 'movie'
      ? item.quality || 'MOVIE'
      : item.total_episodes
        ? `EPS ${item.total_episodes}`
        : 'SERIES';
  const badgeRight =
    item.status === 'completed'
      ? '<span class="badge badge-green">END</span>'
      : item.status === 'ongoing'
        ? '<span class="badge badge-red">ONGOING</span>'
        : '';

  card.innerHTML = `
    <div class="card-poster-wrap">
      <img class="card-poster" src="${escapeHtml(poster)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.src='${FALLBACK_POSTER}'" />
      <div class="card-badges">
        <span class="badge">${escapeHtml(badgeLeft)}</span>
        ${badgeRight}
      </div>
      <div class="card-play-overlay">
        <div class="play-circle">
          <svg viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
    </div>
    <h3 class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
    <div class="card-sub">
      <span>${item.release_year || '—'}</span>
      <span class="card-sub-right">
        <button type="button" class="card-heart ${saved ? 'saved' : ''}" title="Simpan ke My List" aria-label="Simpan ke My List">♥</button>
        <span class="card-rating">★ ${item.rating != null ? Number(item.rating).toFixed(1) : 'N/A'}</span>
      </span>
    </div>
  `;

  card.querySelector('.card-heart').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMyList(item);
    e.currentTarget.classList.toggle('saved', isInMyList(item.slug));
  });

  card.addEventListener('click', () => openDetailModal(item));
  return card;
}

function renderCardList(container, items, emptyMessage = 'Tidak ada konten ditemukan.') {
  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const item of items) frag.appendChild(createCardElement(item));
  container.appendChild(frag);
}

/* ---------------- HERO CAROUSEL ---------------- */
function renderHero(index) {
  if (!state.heroItems.length) return;
  state.heroIndex = (index + state.heroItems.length) % state.heroItems.length;
  const item = state.heroItems[state.heroIndex];

  const backdrop = $('heroBackdrop');
  backdrop.style.backgroundImage = item.poster_url ? `url("${item.poster_url}")` : 'none';

  const kickerParts = [];
  if (item.content_type === 'series') {
    kickerParts.push(`SEASON ${item.total_seasons || 1}`);
    if (item.total_episodes) kickerParts.push(`${item.total_episodes} EPISODE`);
  } else {
    kickerParts.push('FEATURED MOVIE');
    if (item.quality) kickerParts.push(item.quality);
  }
  $('heroKicker').textContent = kickerParts.join(' • ');

  const genresText = (item.genres || []).slice(0, 3).join(', ');
  $('heroMeta').innerHTML = `
    <span class="hero-rating">★ ${item.rating != null ? Number(item.rating).toFixed(1) : '8.5'}</span>
    <span class="hero-dot">•</span>
    <span>${item.release_year || '2026'}</span>
    ${genresText ? `<span class="hero-dot">•</span><span>${escapeHtml(genresText)}</span>` : ''}
    ${item.status ? `<span class="hero-dot">•</span><span style="text-transform:capitalize">${escapeHtml(item.status)}</span>` : ''}
  `;

  $('heroTitle').textContent = item.title;
  $('heroSynopsis').textContent =
    item.synopsis ||
    `Tonton ${item.title} (${item.release_year || 'Terbaru'}) subtitle Indonesia kualitas HD langsung tanpa login.`;

  syncHeroListButton();

  // Lazy-enrich hero synopsis if not present on card summary
  if (!item.synopsis) {
    apiGet(`/detail/${encodeURIComponent(item.slug)}`)
      .then((res) => {
        if (res.data?.synopsis) {
          item.synopsis = res.data.synopsis;
          if (state.heroItems[state.heroIndex]?.slug === item.slug) {
            $('heroSynopsis').textContent = res.data.synopsis;
          }
        }
      })
      .catch(() => {});
  }

  // Render indicator dashes
  const ind = $('heroIndicators');
  ind.innerHTML = '';
  state.heroItems.forEach((_, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `hero-dash ${i === state.heroIndex ? 'active' : ''}`;
    btn.setAttribute('aria-label', `Slide ${i + 1}`);
    btn.addEventListener('click', () => {
      renderHero(i);
      restartHeroTimer();
    });
    ind.appendChild(btn);
  });
}

function syncHeroListButton() {
  const item = state.heroItems[state.heroIndex];
  const btn = $('heroListBtn');
  if (!item) return;
  const saved = isInMyList(item.slug);
  btn.classList.toggle('saved', saved);
  btn.innerHTML = saved ? '<span>✓</span><span>IN MY LIST</span>' : '<span class="btn-plus">+</span><span>ADD LIST</span>';
}

function restartHeroTimer() {
  clearInterval(state.heroTimer);
  if (state.heroItems.length > 1) {
    state.heroTimer = setInterval(() => renderHero(state.heroIndex + 1), 6500);
  }
}

/* ---------------- GENRE PILLS ---------------- */
function renderGenrePills(container, activeSlug, onSelect) {
  container.innerHTML = '';
  const topGenres = [
    { slug: '', name: 'All' },
    ...state.genres.slice(0, 14),
  ];

  for (const g of topGenres) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `genre-pill ${activeSlug === g.slug ? 'active' : ''}`;
    btn.textContent = g.name;
    btn.addEventListener('click', () => onSelect(g.slug));
    container.appendChild(btn);
  }
}

/* ---------------- SECTION 1: TRENDS ---------------- */
async function loadTrends() {
  const row = $('trendsRow');
  row.innerHTML = '<div class="skeleton-card"></div>'.repeat(6);

  try {
    let items = [];
    if (state.trendGenre) {
      const res = await apiGet(`/genres/${encodeURIComponent(state.trendGenre)}?page=1&limit=20&sort=rating`);
      items = res.data;
    } else if (state.home && state.home[state.trendTab]?.items?.length) {
      items = state.home[state.trendTab].items;
    } else {
      const endpointMap = {
        featured: '/latest?page=1&limit=20',
        popular: '/popular?page=1&limit=20',
        recommendations: '/recommendations?page=1&limit=20',
        latest_series: '/latest?page=1&limit=20&type=series',
      };
      const res = await apiGet(endpointMap[state.trendTab] || '/latest?page=1&limit=20');
      items = res.data;
    }
    renderCardList(row, items, 'Belum ada judul untuk filter genre ini.');
  } catch (err) {
    renderCardList(row, [], `Gagal memuat data: ${err.message}`);
  }
}

/* ---------------- SECTION 2: CATALOG EXPLORER ---------------- */
async function loadCatalog() {
  const grid = $('catalogGrid');
  grid.innerHTML = '<div class="skeleton-card"></div>'.repeat(10);

  const params = new URLSearchParams();
  params.set('page', String(state.catalogPage));
  params.set('limit', '20');

  let path = '/movies';
  if (state.catalogTab === 'search' && state.catalogSearch.trim()) {
    path = '/search';
    params.set('q', state.catalogSearch.trim());
    if (state.catalogYear) params.set('year', state.catalogYear);
    if (state.catalogGenre) params.set('genre', state.catalogGenre);
  } else {
    if (state.catalogTab === 'series') path = '/series';
    else if (state.catalogTab === 'ongoing') path = '/ongoing';
    else if (state.catalogTab === 'completed') path = '/completed';
    else if (state.catalogTab === 'search') path = '/latest';
    else path = '/movies';

    if (state.catalogGenre) params.set('genre', state.catalogGenre);
    if (state.catalogYear) params.set('year', state.catalogYear);
    if (state.catalogCountry) params.set('country', state.catalogCountry);
    if (path === '/movies' || path === '/series') {
      params.set('sort', state.catalogSort);
      params.set('order', state.catalogSort === 'title' ? 'asc' : 'desc');
    }
  }

  try {
    const res = await apiGet(`${path}?${params.toString()}`);
    let items = res.data || [];
    if (state.catalogMinRating > 0) {
      items = items.filter((it) => Number(it.rating || 0) >= state.catalogMinRating);
    }

    renderCardList(
      grid,
      items,
      state.catalogSearch
        ? `Tidak ada hasil untuk "${state.catalogSearch}".`
        : 'Tidak ada judul yang cocok dengan filter ini.'
    );

    const pag = res.pagination || { page: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false, total: items.length };
    state.catalogTotalPages = Math.max(1, pag.totalPages || 1);
    $('pageInfo').textContent = `Halaman ${pag.page} dari ${state.catalogTotalPages} (${pag.total} judul)`;
    $('prevPageBtn').disabled = !pag.hasPreviousPage;
    $('nextPageBtn').disabled = !pag.hasNextPage;
  } catch (err) {
    renderCardList(grid, [], `Gagal memuat katalog: ${err.message}`);
  }
}

/* ---------------- DETAIL & WATCH MODAL ---------------- */
async function openDetailModal(summaryItem) {
  state.activeItem = summaryItem;
  const modal = $('detailModal');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  fillModal(summaryItem, [], []);

  try {
    const detailRes = await apiGet(`/detail/${encodeURIComponent(summaryItem.slug)}`);
    const full = detailRes.data;
    state.activeItem = full;
    fillModal(full, full.seasons || [], full.related || []);

    if (full.content_type === 'series' && full.seasons?.length) {
      await loadModalEpisodes(full.slug, full.seasons[0].season_number);
    }
  } catch {
    // Keep summary modal if detail fetch fails
  }
}

function fillModal(item, seasons, related) {
  const poster = item.poster_url || FALLBACK_POSTER;
  $('modalHero').style.backgroundImage = `url("${poster}")`;
  $('modalPoster').src = poster;
  $('modalPoster').alt = item.title;
  $('modalKicker').textContent =
    item.content_type === 'series'
      ? `TV SERIES • ${(item.status || 'ONGOING').toUpperCase()}`
      : `MOVIE • ${item.quality || 'HD'}`;
  $('modalTitle').textContent = item.title;

  const metaParts = [
    `<span class="hero-rating">★ ${item.rating != null ? Number(item.rating).toFixed(1) : 'N/A'}</span>`,
    item.release_year ? `<span>${item.release_year}</span>` : '',
    item.duration ? `<span>${escapeHtml(item.duration)}</span>` : '',
    item.country ? `<span>${escapeHtml(item.country)}</span>` : '',
  ].filter(Boolean);
  $('modalMeta').innerHTML = metaParts.join(' <span class="hero-dot">•</span> ');

  $('modalGenres').innerHTML = (item.genres || [])
    .map((g) => `<span class="modal-genre-tag">${escapeHtml(g)}</span>`)
    .join('');

  $('modalSynopsis').textContent =
    item.synopsis || 'Sinopsis lengkap sedang disinkronkan. Klik Tonton Sekarang untuk langsung membuka halaman tayangan.';

  const watchLink = $('modalWatchLink');
  watchLink.href = item.detail_source_url || '#';
  $('modalWatchText').textContent = item.content_type === 'series' ? 'TONTON SERIES' : 'TONTON FILM';
  watchLink.onclick = () => recordWatchHistory(item);

  syncModalListButton();

  // Credits
  const creditsEl = $('modalCredits');
  const castText = Array.isArray(item.cast) && item.cast.length ? item.cast.join(', ') : '—';
  creditsEl.innerHTML = `
    <div><span class="credit-label">Sutradara</span><span>${escapeHtml(item.director || '—')}</span></div>
    <div><span class="credit-label">Pemeran</span><span>${escapeHtml(castText)}</span></div>
    <div><span class="credit-label">Negara / Region</span><span>${escapeHtml([item.country, item.region].filter(Boolean).join(' • ') || '—')}</span></div>
  `;

  // Seasons & Episodes
  const epSection = $('modalEpisodesSection');
  const seasonSelect = $('modalSeasonSelect');
  if (item.content_type === 'series' && seasons.length > 0) {
    epSection.classList.remove('hidden');
    seasonSelect.innerHTML = seasons
      .map((s) => `<option value="${s.season_number}">Season ${s.season_number} (${s.episode_count} Eps)</option>`)
      .join('');
    seasonSelect.onchange = () => loadModalEpisodes(item.slug, Number(seasonSelect.value));
  } else {
    epSection.classList.add('hidden');
    $('modalEpisodesGrid').innerHTML = '';
  }

  // Related
  const relSection = $('modalRelatedSection');
  if (related.length > 0) {
    relSection.classList.remove('hidden');
    renderCardList($('modalRelatedRow'), related);
  } else {
    relSection.classList.add('hidden');
  }
}

async function loadModalEpisodes(slug, seasonNumber) {
  const grid = $('modalEpisodesGrid');
  grid.innerHTML = '<span class="episodes-hint">Memuat episode...</span>';
  try {
    const res = await apiGet(`/episodes/${encodeURIComponent(slug)}?season=${seasonNumber}&page=1&limit=100`);
    const eps = res.data || [];
    if (!eps.length) {
      grid.innerHTML = '<span class="episodes-hint">Daftar episode belum disinkronkan. Klik tombol Tonton Series di atas.</span>';
      return;
    }
    grid.innerHTML = eps
      .map(
        (ep) => `
        <a class="ep-pill" href="${escapeHtml(ep.source_url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(ep.episode_title || '')}">
          ▶ Ep ${ep.episode_number}
        </a>`
      )
      .join('');
    grid.querySelectorAll('.ep-pill').forEach((el) => {
      el.addEventListener('click', () => state.activeItem && recordWatchHistory(state.activeItem));
    });
  } catch {
    grid.innerHTML = '<span class="episodes-hint">Gagal memuat daftar episode.</span>';
  }
}

function syncModalListButton() {
  const item = state.activeItem;
  const btn = $('modalListBtn');
  if (!item) return;
  const saved = isInMyList(item.slug);
  btn.classList.toggle('saved', saved);
  btn.innerHTML = saved ? '<span>✓</span><span>IN MY LIST</span>' : '<span class="btn-plus">+</span><span>ADD LIST</span>';
}

function closeDetailModal() {
  $('detailModal').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ---------------- EVENTS & INITIALIZATION ---------------- */
function bindEvents() {
  // Sticky navbar
  window.addEventListener('scroll', () => {
    $('navbar').classList.toggle('scrolled', window.scrollY > 36);
  });

  // Mobile menu
  $('mobileMenuBtn').addEventListener('click', () => {
    $('navLinks').classList.toggle('open');
  });

  // Top nav quick shortcuts
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      $('navLinks').classList.remove('open');
      const target = link.dataset.nav;
      if (target === 'series' || target === 'movies') {
        selectCatalogTab(target);
      }
      if (target === 'mylist' && state.myList.length === 0 && state.history.length === 0) {
        showToast('My List masih kosong — klik ♥ atau ADD LIST di film favoritmu!');
      }
    });
  });

  // Navbar live search -> jump to catalog search
  let searchDebounce = null;
  const triggerSearch = (val) => {
    state.catalogSearch = val;
    state.catalogPage = 1;
    if (val.trim()) {
      selectCatalogTab('search', false);
      $('catalogSearchInput').value = val;
      $('catalog').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    loadCatalog();
  };

  $('navSearchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => triggerSearch(e.target.value), 350);
  });

  $('catalogSearchInput').addEventListener('input', (e) => {
    $('navSearchInput').value = e.target.value;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.catalogSearch = e.target.value;
      state.catalogPage = 1;
      loadCatalog();
    }, 320);
  });

  $('clearSearchBtn').addEventListener('click', () => {
    $('catalogSearchInput').value = '';
    $('navSearchInput').value = '';
    state.catalogSearch = '';
    state.catalogPage = 1;
    loadCatalog();
  });

  // Hero buttons
  $('heroWatchBtn').addEventListener('click', () => {
    const item = state.heroItems[state.heroIndex];
    if (item) openDetailModal(item);
  });
  $('heroListBtn').addEventListener('click', () => {
    const item = state.heroItems[state.heroIndex];
    if (item) toggleMyList(item);
  });

  // Personal tabs
  document.querySelectorAll('[data-personal-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.personalTab = btn.dataset.personalTab;
      document.querySelectorAll('[data-personal-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      updatePersonalUI();
    });
  });

  // Trends tabs
  document.querySelectorAll('[data-trend-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.trendTab = btn.dataset.trendTab;
      state.trendGenre = '';
      document.querySelectorAll('[data-trend-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      renderGenrePills($('trendsGenres'), state.trendGenre, onSelectTrendGenre);
      loadTrends();
    });
  });

  // Catalog tabs
  document.querySelectorAll('[data-catalog-tab]').forEach((btn) => {
    btn.addEventListener('click', () => selectCatalogTab(btn.dataset.catalogTab));
  });

  // Sort pills
  document.querySelectorAll('[data-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.catalogSort = btn.dataset.sort;
      state.catalogPage = 1;
      document.querySelectorAll('[data-sort]').forEach((b) => b.classList.toggle('active', b === btn));
      loadCatalog();
    });
  });

  // Year & Country selects
  $('yearFilter').addEventListener('change', (e) => {
    state.catalogYear = e.target.value;
    state.catalogPage = 1;
    loadCatalog();
  });
  $('countryFilter').addEventListener('change', (e) => {
    state.catalogCountry = e.target.value;
    state.catalogPage = 1;
    loadCatalog();
  });

  // Gold Rating slider
  $('ratingFilter').addEventListener('input', (e) => {
    const val = Number(e.target.value);
    state.catalogMinRating = val;
    $('ratingFilterValue').textContent = val > 0 ? val.toFixed(1) : 'All';
    loadCatalog();
  });

  // Pagination
  $('prevPageBtn').addEventListener('click', () => {
    if (state.catalogPage > 1) {
      state.catalogPage -= 1;
      loadCatalog();
      $('catalog').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  $('nextPageBtn').addEventListener('click', () => {
    if (state.catalogPage < state.catalogTotalPages) {
      state.catalogPage += 1;
      loadCatalog();
      $('catalog').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Horizontal carousel arrows
  document.querySelectorAll('.carousel-arrow').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = $(btn.dataset.scrollTarget);
      if (target) {
        target.scrollBy({ left: Number(btn.dataset.dir) * 620, behavior: 'smooth' });
      }
    });
  });

  // Modal close & list button
  $('modalCloseBtn').addEventListener('click', closeDetailModal);
  $('detailModal').addEventListener('click', (e) => {
    if (e.target === $('detailModal')) closeDetailModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetailModal();
  });
  $('modalListBtn').addEventListener('click', () => {
    if (state.activeItem) toggleMyList(state.activeItem);
  });

  // Footer shortcuts
  document.querySelectorAll('[data-footer-tab]').forEach((el) => {
    el.addEventListener('click', () => selectCatalogTab(el.dataset.footerTab));
  });
  document.querySelectorAll('[data-footer-genre]').forEach((el) => {
    el.addEventListener('click', () => {
      state.catalogGenre = el.dataset.footerGenre;
      state.catalogPage = 1;
      renderGenrePills($('catalogGenres'), state.catalogGenre, onSelectCatalogGenre);
      loadCatalog();
    });
  });
}

function selectCatalogTab(tab, reload = true) {
  state.catalogTab = tab;
  state.catalogPage = 1;
  document.querySelectorAll('[data-catalog-tab]').forEach((b) => b.classList.toggle('active', b.dataset.catalogTab === tab));
  $('inlineSearchBar').classList.toggle('hidden', tab !== 'search');
  if (tab === 'search') $('catalogSearchInput').focus();
  if (reload) loadCatalog();
}

function onSelectTrendGenre(slug) {
  state.trendGenre = slug;
  renderGenrePills($('trendsGenres'), slug, onSelectTrendGenre);
  loadTrends();
}

function onSelectCatalogGenre(slug) {
  state.catalogGenre = slug;
  state.catalogPage = 1;
  renderGenrePills($('catalogGenres'), slug, onSelectCatalogGenre);
  loadCatalog();
}

async function init() {
  bindEvents();
  updatePersonalUI();

  try {
    const [homeRes, genresRes, countriesRes, yearsRes] = await Promise.all([
      apiGet('/home?limit=18'),
      apiGet('/genres'),
      apiGet('/countries'),
      apiGet('/years'),
    ]);

    state.home = homeRes.data;
    state.genres = genresRes.data || [];
    state.countries = countriesRes.data || [];
    state.years = yearsRes.data || [];

    // Populate Hero from featured (fallback to latest_series)
    state.heroItems = (state.home.featured?.items?.length ? state.home.featured.items : state.home.latest_series?.items || []).slice(0, 5);
    renderHero(0);
    restartHeroTimer();

    // Populate filters
    renderGenrePills($('trendsGenres'), state.trendGenre, onSelectTrendGenre);
    renderGenrePills($('catalogGenres'), state.catalogGenre, onSelectCatalogGenre);

    $('yearFilter').innerHTML =
      '<option value="">Year</option>' +
      state.years.map((y) => `<option value="${y.year}">${y.year} (${y.count})</option>`).join('');

    $('countryFilter').innerHTML =
      '<option value="">Country</option>' +
      state.countries.map((c) => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('');

    await Promise.all([loadTrends(), loadCatalog()]);
  } catch (err) {
    $('heroTitle').textContent = 'GAGAL TERHUBUNG KE API';
    $('heroSynopsis').textContent = `Pastikan REST API & Supabase sudah aktif (${err.message}).`;
  }
}

init();
