# NontonDrama / LK21 Public Metadata API

[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933.svg)](https://nodejs.org/)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.1-6BA539.svg)](./docs/openapi.yaml)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-000000.svg)](https://vercel.com/)
[![Database](https://img.shields.io/badge/Database-Supabase%20PostgreSQL-3ECF8E.svg)](https://supabase.com/)

**Free, community-ready REST API** untuk katalog metadata film, serial drama Asia & Barat, genre, negara, tahun rilis, daftar season, dan metadata episode — dibangun dengan arsitektur **Scrape Once, Store Permanently, Serve Efficiently**.

> **Base URL (Production):** `https://lk21-api-lovat.vercel.app`  
> **Interactive Playground:** `https://lk21-api-lovat.vercel.app/`  
> **OpenAPI 3.1 Spec:** `https://lk21-api-lovat.vercel.app/api/v1/openapi.yaml`

---

## Fitur Utama

- **Gratis & Tanpa API Key (Public Read Endpoints):** Seluruh endpoint publik di `/api/v1/*` dapat langsung dipakai oleh komunitas, web app, mobile app, maupun bot.
- **Database-Driven (Bukan Scrape per Request):** Semua request publik dilayani dari **Supabase PostgreSQL + Vercel Edge CDN + Upstash Redis (opsional)** sehingga cepat dan stabil.
- **Katalog Lengkap & Terstruktur:** Mendukung Movies, Series (Ongoing & Completed), Featured, Popular, Recommendations, 29+ Genre, 46+ Negara, Tahun Rilis, Pencarian Partial (Case-Insensitive), Detail Lengkap, Seasons, dan Episodes.
- **Standar Response Konsisten:** Seluruh endpoint mengembalikan format JSON seragam lengkap dengan objek `pagination` dan `meta`.
- **Aman untuk Komunitas:** Dilengkapi validasi parameter `Zod`, IP Rate Limiting (`120 req/menit`), CORS, sanitasi error, serta endpoint `/api/v1/admin/*` dan `/api/v1/cron/*` yang terproteksi secret.

---

## Daftar Endpoint Publik (`/api/v1`)

| Method | Endpoint | Parameter Query | Deskripsi |
|---|---|---|---|
| `GET` | `/api/v1/home` | `limit` (default `12`, max `24`) | Kumpulan section homepage: `featured`, `latest_movies`, `latest_series`, `popular`, `recommendations`, `ongoing`, `completed` |
| `GET` | `/api/v1/latest` | `page`, `limit`, `type` (`movie`\|`series`) | Katalog rilis terbaru |
| `GET` | `/api/v1/movies` | `page`, `limit`, `year`, `genre`, `country`, `sort`, `order` | Katalog film dengan filter & sorting |
| `GET` | `/api/v1/series` | `page`, `limit`, `year`, `genre`, `country`, `status`, `sort`, `order` | Katalog serial drama dengan filter & sorting |
| `GET` | `/api/v1/popular` | `page`, `limit`, `type` | Konten terpopuler |
| `GET` | `/api/v1/recommendations` | `page`, `limit` | Konten rekomendasi |
| `GET` | `/api/v1/ongoing` | `page`, `limit`, `genre`, `country` | Serial drama yang sedang tayang |
| `GET` | `/api/v1/completed` | `page`, `limit`, `genre`, `country` | Serial drama yang sudah tamat |
| `GET` | `/api/v1/genres` | — | Daftar seluruh genre |
| `GET` | `/api/v1/genres/:slug` | `page`, `limit`, `type`, `sort`, `order` | Daftar konten berdasarkan genre (contoh: `action`, `romance`) |
| `GET` | `/api/v1/countries` | — | Daftar seluruh negara |
| `GET` | `/api/v1/countries/:slug` | `page`, `limit`, `type`, `sort`, `order` | Daftar konten berdasarkan negara (contoh: `south-korea`, `usa`) |
| `GET` | `/api/v1/years` | — | Daftar tahun rilis beserta jumlah judul |
| `GET` | `/api/v1/years/:year` | `page`, `limit`, `type`, `sort`, `order` | Daftar konten pada tahun tertentu (contoh: `2026`) |
| `GET` | `/api/v1/search` | `q` (**wajib**), `page`, `limit`, `type`, `year`, `genre` | Pencarian judul partial & case-insensitive |
| `GET` | `/api/v1/detail/:slug` | — | Metadata detail lengkap (sinopsis, sutradara, pemeran, genre, negara, related, seasons) |
| `GET` | `/api/v1/seasons/:slug` | — | Daftar seluruh season pada sebuah serial |
| `GET` | `/api/v1/episodes/:slug` | `season`, `page`, `limit` | Daftar metadata episode per season & tautan referensi sumber |
| `GET` | `/api/v1/health` | — | Status kesehatan API, database, cache, dan sinkronisasi terakhir |
| `GET` | `/api/v1/openapi.yaml` | — | Spesifikasi kontrak OpenAPI 3.1 |

**Nilai `sort` yang didukung:** `latest` (default: tahun rilis & update terbaru), `rating`, `year`, `title`, `updated`.  
**Nilai `order` yang didukung:** `desc` (default), `asc`.

---

## Contoh Penggunaan (Quick Start)

### 1. cURL
```bash
# Ambil daftar film 2026
curl -s "https://lk21-api-lovat.vercel.app/api/v1/movies?year=2026&page=1&limit=10"

# Cari judul "loki"
curl -s "https://lk21-api-lovat.vercel.app/api/v1/search?q=loki"

# Ambil detail serial + daftar season
curl -s "https://lk21-api-lovat.vercel.app/api/v1/detail/loki-2021"

# Ambil daftar episode Season 1
curl -s "https://lk21-api-lovat.vercel.app/api/v1/episodes/loki-2021?season=1"
```

### 2. JavaScript / TypeScript (`fetch`)
```js
const BASE_URL = 'https://lk21-api-lovat.vercel.app/api/v1';

async function getSeries(genre = 'drama', page = 1) {
  const res = await fetch(`${BASE_URL}/series?genre=${encodeURIComponent(genre)}&page=${page}&limit=20`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error.message);
  return json; // { success, data: [...], pagination: {...}, meta: {...} }
}

getSeries('romance', 1).then(({ data, pagination }) => {
  console.log(`Total: ${pagination.total}`, data.map((item) => item.title));
});
```

### 3. Python (`requests`)
```python
import requests

BASE_URL = "https://lk21-api-lovat.vercel.app/api/v1"

res = requests.get(f"{BASE_URL}/search", params={"q": "empress", "limit": 10}, timeout=10)
payload = res.json()

for item in payload["data"]:
    print(f"{item['title']} ({item['release_year']}) - ★ {item['rating']}")
```

---

## Format Response Standar

### Sukses (`200 OK`)
```json
{
  "success": true,
  "data": [
    {
      "id": "6b50b013-11f3-4193-8828-33bd853a1eb8",
      "slug": "loki-2021",
      "title": "Loki",
      "content_type": "series",
      "poster_url": "https://poster.assetsy.de/wp-content/uploads/2021/10/film-loki-2021-lk21.jpg",
      "release_year": 2021,
      "rating": 8.2,
      "status": "completed",
      "country": "United States",
      "genres": ["Action", "Adventure", "Fantasy", "Sci-Fi"],
      "total_seasons": 2,
      "total_episodes": 12,
      "detail_source_url": "https://tv1.nontondrama.vip/loki-2021"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "meta": {
    "source": "nontondrama",
    "cached": false,
    "timestamp": "2026-11-26T12:00:00.000Z"
  }
}
```

### Error (`400` / `404` / `429` / `503`)
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Content not found"
  }
}
```

---

## Rate Limit & Fair Use Policy

Agar API tetap cepat dan gratis untuk semua anggota komunitas:
- **Batas Default:** `120 requests / menit` per IP.
- Setiap response menyertakan header `X-RateLimit-Limit`, `X-RateLimit-Remaining`, dan `X-RateLimit-Reset`.
- Endpoint GET publik menggunakan Edge CDN `Cache-Control: public, s-maxage=120, stale-while-revalidate=300` serta cache Upstash Redis (jika dikonfigurasi).
- Jika aplikasi kamu membutuhkan trafik tinggi, silakan **self-host** instance kamu sendiri mengikuti panduan di bawah.

---

## Arsitektur Sistem

```text
Source Catalog (Static HTML + JSON-LD)
  ↓  (Rate-Limited Modular Scraper Worker)
Normalization, Validation (Zod) & Deduplication
  ↓  (Non-Destructive Upsert)
Supabase PostgreSQL (contents, seasons, episodes, genres, countries, jobs, logs)
  ↓
Upstash Redis Cache + Vercel Edge CDN
  ↓
Serverless REST API (/api/v1/*)  →  Web / Mobile / Community Apps
```

---

## Panduan Self-Hosting (Deploy Milik Sendiri)

### 1. Clone & Install
```bash
git clone https://github.com/riantosee/lk21-api.git
cd lk21-api
npm install
```

### 2. Setup Database Supabase
1. Buat project gratis di [Supabase](https://supabase.com/).
2. Buka **SQL Editor** → jalankan isi [src/database/migrations/001_initial_schema.sql](./src/database/migrations/001_initial_schema.sql).
3. Salin **Project URL** dan **Secret / `service_role` key** dari **Project Settings → API Keys**.

### 3. Konfigurasi `.env`
Salin `.env.example` menjadi `.env` (jangan pernah commit `.env`):
```bash
cp .env.example .env
```
Isi variabel wajib:
```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<secret-or-service-role-key>
ADMIN_API_SECRET=<random-32-byte-hex>
CRON_SECRET=<random-32-byte-hex>
```
*(Opsional: tambahkan `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` untuk caching Redis tambahan.)*

### 4. Sinkronisasi Data & Jalankan Lokal
```bash
# Cek parser live tanpa menyentuh database
npm run discover

# Sinkronisasi katalog awal ke Supabase
npm run sync:quick

# Sinkronisasi multi-halaman + detail/episode
npm run sync:full -- --category=latest-movies --start-page=1 --max-pages=10 --details

# Pulihkan job yang gagal (jika ada)
npm run sync:retry

# Jalankan server lokal (http://localhost:3000)
npm run dev

# Jalankan seluruh automated tests (Vitest)
npm test
```

### 5. Deploy ke Vercel
```bash
vercel --prod
```
Pasang variabel lingkungan yang sama di **Vercel Project Settings → Environment Variables**. Detail lengkap ada di [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

---

## Dokumentasi Teknis Lengkap

- [docs/API.md](./docs/API.md) — Referensi endpoint publik & admin lengkap
- [docs/openapi.yaml](./docs/openapi.yaml) — Spesifikasi OpenAPI 3.1 (siap import ke Postman / Swagger / Scalar)
- [docs/DATABASE.md](./docs/DATABASE.md) — Skema PostgreSQL, index, dan strategi non-destructive upsert
- [docs/SCRAPER.md](./docs/SCRAPER.md) — Arsitektur modul scraper, rate limit, pagination, dan recovery
- [docs/SOURCE_ANALYSIS.md](./docs/SOURCE_ANALYSIS.md) — Audit struktur sumber, selector, dan `robots.txt`
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) — Panduan production Supabase + Upstash + Vercel Cron
- [CONTRIBUTING.md](./CONTRIBUTING.md) — Panduan kontribusi komunitas

---

## Disclaimer & Ruang Lingkup

Proyek ini adalah **Metadata Catalog API** yang hanya mengumpulkan, menormalisasi, dan menyajikan **metadata katalog publik** (judul, tahun rilis, sinopsis, genre, negara, poster, daftar season/episode, dan tautan referensi halaman sumber). Proyek ini **tidak** menyalin, menghosting, melewati iklan/proteksi akses, maupun mendistribusikan file video atau stream audiovisual berhak cipta. Seluruh merek dagang dan hak cipta konten adalah milik pemilik sah masing-masing.
