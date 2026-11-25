import axios from 'axios';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export class ScraperHttpError extends Error {
  constructor(message, { status, code, url, retryable = false } = {}) {
    super(message);
    this.name = 'ScraperHttpError';
    this.status = status ?? null;
    this.code = code || 'UPSTREAM_ERROR';
    this.url = url || null;
    this.retryable = retryable;
  }
}

const CHALLENGE_MARKERS = [
  'cf-browser-verification',
  'challenge-platform',
  'g-recaptcha',
  'h-captcha',
  'cf-turnstile',
  'just a moment...',
];

function detectAccessProtection(status, body) {
  if (status === 403) return 'Access forbidden (HTTP 403)';
  if (typeof body === 'string') {
    const sample = body.slice(0, 4000).toLowerCase();
    for (const marker of CHALLENGE_MARKERS) {
      if (sample.includes(marker)) {
        return `Anti-bot or CAPTCHA challenge detected (${marker})`;
      }
    }
  }
  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createScraperClient(overrides = {}) {
  const delayMs = overrides.delayMs ?? config.scraper.delayMs;
  const maxConcurrency = overrides.concurrency ?? config.scraper.concurrency;
  const timeoutMs = overrides.timeoutMs ?? config.scraper.timeoutMs;
  const maxRetries = overrides.maxRetries ?? config.scraper.maxRetries;
  const userAgent = overrides.userAgent ?? config.scraper.userAgent;

  const http = axios.create({
    timeout: timeoutMs,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  // Per-domain next-allowed timestamp & simple concurrency semaphore
  const domainNextAt = new Map();
  let active = 0;
  const waiters = [];

  async function acquireSlot() {
    if (active < maxConcurrency) {
      active += 1;
      return;
    }
    await new Promise((resolve) => waiters.push(resolve));
    active += 1;
  }

  function releaseSlot() {
    active = Math.max(0, active - 1);
    const next = waiters.shift();
    if (next) next();
  }

  async function waitDomainSlot(url) {
    const host = new URL(url).host;
    const now = Date.now();
    const nextAllowed = domainNextAt.get(host) || 0;
    const waitMs = Math.max(0, nextAllowed - now);
    domainNextAt.set(host, Math.max(now, nextAllowed) + delayMs);
    if (waitMs > 0) await sleep(waitMs);
  }

  async function requestWithRetry(requestConfig, { signal } = {}) {
    let attempt = 0;
    const url = requestConfig.url;

    while (true) {
      if (signal?.aborted) {
        throw new ScraperHttpError('Scrape aborted', { code: 'ABORTED', url, retryable: false });
      }

      await acquireSlot();
      try {
        await waitDomainSlot(url);
        const res = await http.request({ ...requestConfig, signal });
        const status = res.status;

        const protectionReason = detectAccessProtection(status, res.data);
        if (protectionReason) {
          logger.warn({ url, status, reason: protectionReason }, 'Access protection encountered; refusing to bypass');
          throw new ScraperHttpError(protectionReason, {
            status,
            code: 'ACCESS_PROTECTED',
            url,
            retryable: false,
          });
        }

        if (status >= 200 && status < 300) {
          return {
            status,
            data: res.data,
            headers: res.headers,
            finalUrl: res.request?.res?.responseUrl || url,
          };
        }

        if (status === 404) {
          throw new ScraperHttpError(`Resource not found (${status})`, {
            status,
            code: 'NOT_FOUND',
            url,
            retryable: false,
          });
        }

        const retryable = status === 429 || status >= 500;
        if (!retryable || attempt >= maxRetries) {
          throw new ScraperHttpError(`Upstream HTTP ${status}`, {
            status,
            code: status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR',
            url,
            retryable: false,
          });
        }

        const backoff = Math.min(10_000, delayMs * 2 ** (attempt + 1)) + Math.floor(Math.random() * 250);
        logger.warn({ url, status, attempt: attempt + 1, backoffMs: backoff }, 'Retrying upstream request');
        attempt += 1;
        await sleep(backoff);
      } catch (err) {
        if (err instanceof ScraperHttpError) throw err;
        const isTimeout = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
        const isNetwork = !err.response;
        if ((!isTimeout && !isNetwork) || attempt >= maxRetries || signal?.aborted) {
          throw new ScraperHttpError(err.message || 'Network request failed', {
            code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
            url,
            retryable: false,
          });
        }
        const backoff = Math.min(10_000, delayMs * 2 ** (attempt + 1)) + Math.floor(Math.random() * 250);
        logger.warn({ url, err: err.message, attempt: attempt + 1, backoffMs: backoff }, 'Retrying after network error');
        attempt += 1;
        await sleep(backoff);
      } finally {
        releaseSlot();
      }
    }
  }

  return {
    async fetchHtml(url, opts = {}) {
      const res = await requestWithRetry({ method: 'GET', url, headers: opts.headers }, opts);
      return { html: String(res.data || ''), status: res.status, finalUrl: res.finalUrl };
    },
    async fetchJson(url, opts = {}) {
      const res = await requestWithRetry(
        {
          method: 'GET',
          url,
          responseType: 'json',
          headers: { Accept: 'application/json', ...opts.headers },
        },
        opts
      );
      return { data: res.data, status: res.status, finalUrl: res.finalUrl };
    },
    async postForm(url, params, opts = {}) {
      const body = new URLSearchParams(params).toString();
      const res = await requestWithRetry(
        {
          method: 'POST',
          url,
          data: body,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...opts.headers,
          },
        },
        opts
      );
      return { html: String(res.data || ''), status: res.status, finalUrl: res.finalUrl };
    },
  };
}

export const defaultScraperClient = createScraperClient();
