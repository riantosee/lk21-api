export function buildPagination({ page, limit, total }) {
  const safeLimit = Math.max(1, Number(limit) || 20);
  const safePage = Math.max(1, Number(page) || 1);
  const safeTotal = Math.max(0, Number(total) || 0);
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / safeLimit);
  return {
    page: safePage,
    limit: safeLimit,
    total: safeTotal,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1 && totalPages > 0,
  };
}

export function formatSuccess(data, { pagination, cached = false, meta = {} } = {}) {
  const body = {
    success: true,
    data,
  };
  if (pagination) {
    body.pagination = pagination;
  }
  body.meta = {
    source: 'nontondrama',
    cached: Boolean(cached),
    timestamp: new Date().toISOString(),
    ...meta,
  };
  return body;
}

export function formatError(code, message, details) {
  const error = { code, message };
  if (details !== undefined) {
    error.details = details;
  }
  return {
    success: false,
    error,
  };
}

export function sendSuccess(res, data, options = {}) {
  const status = options.status || 200;
  res.status(status).json(formatSuccess(data, options));
}

export function sendError(res, status, code, message, details) {
  res.status(status).json(formatError(code, message, details));
}
