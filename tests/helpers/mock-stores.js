import crypto from 'node:crypto';

/**
 * Lightweight in-memory Supabase PostgREST mock supporting select, insert,
 * upsert, update, filters (eq, neq, in, ilike, contains, not, or), order, range,
 * single, maybeSingle, and basic season join for episodes.
 */
export function createMockSupabase(initialTables = {}) {
  const tables = {
    contents: [],
    seasons: [],
    episodes: [],
    genres: [],
    countries: [],
    scraper_jobs: [],
    sync_logs: [],
    scraper_settings: [{ key: 'crawler_control', value: { paused: false } }],
    ...Object.fromEntries(Object.entries(initialTables).map(([k, v]) => [k, v.map((r) => ({ ...r }))])),
  };

  function matchOrClause(row, expr) {
    const clauses = expr.split(',');
    return clauses.some((clause) => {
      const ilikeMatch = clause.match(/^([^.]+)\.ilike\.(.+)$/);
      if (ilikeMatch) {
        const [, field, pattern] = ilikeMatch;
        const val = String(row[field] ?? '').toLowerCase();
        const needle = pattern.replace(/^%|%$/g, '').toLowerCase();
        return val.includes(needle);
      }
      const eqMatch = clause.match(/^([^.]+)\.eq\.(.+)$/);
      if (eqMatch) {
        const [, field, expected] = eqMatch;
        return String(row[field] ?? '').toLowerCase() === expected.toLowerCase();
      }
      return false;
    });
  }

  function makeBuilder(tableName) {
    const state = {
      op: 'select',
      selectCols: '*',
      countMode: null,
      head: false,
      payload: null,
      upsertOpts: null,
      filters: [],
      orders: [],
      rangeFrom: null,
      rangeTo: null,
      limitCount: null,
      singleMode: null,
    };

    const execute = () => {
      const rows = tables[tableName];
      if (!rows) return { data: null, error: { message: `Unknown table ${tableName}` } };

      const now = new Date().toISOString();

      if (state.op === 'insert') {
        const input = Array.isArray(state.payload) ? state.payload : [state.payload];
        const inserted = input.map((r) => ({
          id: r.id || crypto.randomUUID(),
          created_at: now,
          updated_at: now,
          ...r,
        }));
        rows.push(...inserted);
        return finalize(inserted, inserted.length);
      }

      if (state.op === 'upsert') {
        const input = Array.isArray(state.payload) ? state.payload : [state.payload];
        const conflictCols = (state.upsertOpts?.onConflict || 'id').split(',').map((s) => s.trim());
        const out = [];
        for (const item of input) {
          const existingIdx = rows.findIndex((r) =>
            conflictCols.every((col) => r[col] !== undefined && r[col] === item[col])
          );
          if (existingIdx >= 0) {
            rows[existingIdx] = { ...rows[existingIdx], ...item, updated_at: now };
            out.push({ ...rows[existingIdx] });
          } else {
            const created = {
              id: item.id || crypto.randomUUID(),
              created_at: now,
              updated_at: now,
              ...item,
            };
            rows.push(created);
            out.push({ ...created });
          }
        }
        return finalize(out, out.length);
      }

      if (state.op === 'update') {
        const matched = rows.filter((r) => state.filters.every((f) => f(r)));
        for (const m of matched) {
          Object.assign(m, state.payload, { updated_at: now });
        }
        return finalize(matched.map((r) => ({ ...r })), matched.length);
      }

      // SELECT
      let result = rows.filter((r) => state.filters.every((f) => f(r))).map((r) => ({ ...r }));

      // Join seasons for episodes queries
      if (tableName === 'episodes' && String(state.selectCols).includes('seasons(')) {
        result = result.map((ep) => {
          const season = tables.seasons.find((s) => s.id === ep.season_id);
          return {
            ...ep,
            seasons: season ? { season_number: season.season_number, season_title: season.season_title } : null,
          };
        });
      }

      const totalCount = result.length;

      if (state.orders.length > 0) {
        result.sort((a, b) => {
          for (const { col, ascending } of state.orders) {
            const av = a[col];
            const bv = b[col];
            if (av == null && bv == null) continue;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (av < bv) return ascending ? -1 : 1;
            if (av > bv) return ascending ? 1 : -1;
          }
          return 0;
        });
      }

      if (state.rangeFrom !== null && state.rangeTo !== null) {
        result = result.slice(state.rangeFrom, state.rangeTo + 1);
      } else if (state.limitCount !== null) {
        result = result.slice(0, state.limitCount);
      }

      if (state.head) {
        return { data: null, count: state.countMode ? totalCount : null, error: null };
      }

      return finalize(result, totalCount);
    };

    const finalize = (data, totalCount) => {
      if (state.singleMode === 'single') {
        if (!data.length) return { data: null, error: { message: 'No rows found' } };
        return { data: data[0], error: null };
      }
      if (state.singleMode === 'maybeSingle') {
        return { data: data[0] || null, error: null };
      }
      return { data, count: state.countMode ? totalCount : null, error: null };
    };

    const builder = {
      select(cols = '*', opts = {}) {
        state.selectCols = cols;
        if (opts.count) state.countMode = opts.count;
        if (opts.head) state.head = true;
        return builder;
      },
      insert(payload) {
        state.op = 'insert';
        state.payload = payload;
        return builder;
      },
      upsert(payload, opts = {}) {
        state.op = 'upsert';
        state.payload = payload;
        state.upsertOpts = opts;
        return builder;
      },
      update(payload) {
        state.op = 'update';
        state.payload = payload;
        return builder;
      },
      eq(col, val) {
        state.filters.push((r) => r[col] === val);
        return builder;
      },
      neq(col, val) {
        state.filters.push((r) => r[col] !== val);
        return builder;
      },
      in(col, vals) {
        const set = new Set(vals);
        state.filters.push((r) => set.has(r[col]));
        return builder;
      },
      ilike(col, pattern) {
        const needle = String(pattern).replace(/^%|%$/g, '').toLowerCase();
        state.filters.push((r) => String(r[col] ?? '').toLowerCase().includes(needle));
        return builder;
      },
      contains(col, vals) {
        state.filters.push((r) => {
          const arr = Array.isArray(r[col]) ? r[col].map((x) => String(x).toLowerCase()) : [];
          return vals.every((v) => arr.includes(String(v).toLowerCase()));
        });
        return builder;
      },
      not(col, op, val) {
        if (op === 'is' && val === null) {
          state.filters.push((r) => r[col] !== null && r[col] !== undefined);
        }
        return builder;
      },
      or(expr) {
        state.filters.push((r) => matchOrClause(r, expr));
        return builder;
      },
      order(col, opts = {}) {
        state.orders.push({ col, ascending: opts.ascending !== false });
        return builder;
      },
      range(from, to) {
        state.rangeFrom = from;
        state.rangeTo = to;
        return builder;
      },
      limit(n) {
        state.limitCount = n;
        return builder;
      },
      single() {
        state.singleMode = 'single';
        return Promise.resolve(execute());
      },
      maybeSingle() {
        state.singleMode = 'maybeSingle';
        return Promise.resolve(execute());
      },
      then(resolve, reject) {
        return Promise.resolve(execute()).then(resolve, reject);
      },
    };

    return builder;
  }

  return {
    tables,
    from(tableName) {
      return makeBuilder(tableName);
    },
  };
}

export function createMockRedis() {
  const store = new Map();
  return {
    store,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async set(key, value) {
      store.set(key, value);
      return 'OK';
    },
    async incr(key) {
      const next = (Number(store.get(key)) || 0) + 1;
      store.set(key, next);
      return next;
    },
    async expire() {
      return 1;
    },
    async ping() {
      return 'PONG';
    },
  };
}

export function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(key, val) {
      this.headers[key.toLowerCase()] = val;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
  return res;
}
