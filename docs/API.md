# REST API Reference

Base URL prefix: `/api/v1`  
Full OpenAPI 3.1 contract: [openapi.yaml](./openapi.yaml)

## Standard Response Envelope

### Success
```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "meta": {
    "source": "nontondrama",
    "cached": false,
    "timestamp": "2026-11-25T12:00:00.000Z"
  }
}
```
*(Endpoints returning a single resource or bounded lists such as `/home` and `/detail/:slug` omit `pagination`.)*

### Error
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Content not found"
  }
}
```

## Public Endpoints

| Method | Endpoint | Query Parameters | Cache TTL |
|---|---|---|---|
| GET | `/api/v1/home` | `limit` (default 12, max 24) | 5 min |
| GET | `/api/v1/latest` | `page`, `limit`, `type` (`movie`\|`series`) | 10 min |
| GET | `/api/v1/movies` | `page`, `limit`, `year`, `genre`, `country`, `sort`, `order` | 10 min |
| GET | `/api/v1/series` | `page`, `limit`, `year`, `genre`, `country`, `status`, `sort`, `order` | 10 min |
| GET | `/api/v1/popular` | `page`, `limit`, `type` | 15 min |
| GET | `/api/v1/recommendations` | `page`, `limit` | 10 min |
| GET | `/api/v1/ongoing` | `page`, `limit`, `genre`, `country` | 10 min |
| GET | `/api/v1/completed` | `page`, `limit`, `genre`, `country` | 10 min |
| GET | `/api/v1/genres` | — | 24 h |
| GET | `/api/v1/genres/:slug` | `page`, `limit`, `type`, `sort`, `order` | 24 h |
| GET | `/api/v1/countries` | — | 24 h |
| GET | `/api/v1/countries/:slug` | `page`, `limit`, `type`, `sort`, `order` | 24 h |
| GET | `/api/v1/years` | — | 24 h |
| GET | `/api/v1/years/:year` | `page`, `limit`, `type`, `sort`, `order` | 24 h |
| GET | `/api/v1/search` | `q` (required), `page`, `limit`, `type`, `year`, `genre` | 5 min |
| GET | `/api/v1/detail/:slug` | — | 1 h |
| GET | `/api/v1/seasons/:slug` | — | 1 h |
| GET | `/api/v1/episodes/:slug` | `season`, `page`, `limit` | 1 h |
| GET | `/api/v1/health` | — | uncached |
| GET | `/api/v1/openapi.yaml` | — | 1 h (CDN) |

> **Edge CDN Caching:** Semua endpoint GET publik mengembalikan `Cache-Control: public, s-maxage=120, stale-while-revalidate=300` agar beban komunitas ditangani cepat oleh Vercel Edge Network.

## Admin Endpoints (Protected)

Authenticate with `Authorization: Bearer <ADMIN_API_SECRET>` or `X-Admin-Secret: <ADMIN_API_SECRET>`.

- `POST /api/v1/admin/sync` — Body: `{ "type": "quick" | "full" | "detail" | "episode", "maxPages": 2, "startPage": 1, "category": "latest-series", "batchSize": 10 }`
- `GET /api/v1/admin/status` — Crawler pause state, active jobs, failed jobs count, recent syncs.
- `GET /api/v1/admin/jobs` — Query: `?status=failed&type=detail_item&limit=50` or `?id=<uuid>`.
- `POST /api/v1/admin/jobs/retry` — Body: `{ "limit": 5 }`.
- `POST /api/v1/admin/control` — Body: `{ "action": "pause" | "resume" }`.
- `GET /api/v1/admin/history` — Query: `?limit=30`.

## Rate Limiting & Caching

- Every public endpoint returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers and responds with `429 RATE_LIMIT_EXCEEDED` when exceeded.
- Upstash Redis caches responses using namespace versioning (`nd:v:<namespace>`). When sync completes, affected namespaces increment atomically so stale keys expire naturally without expensive wildcard scans.
- If Upstash Redis is unconfigured or temporarily unreachable, the API automatically serves directly from Supabase PostgreSQL (`meta.cached: false`).
