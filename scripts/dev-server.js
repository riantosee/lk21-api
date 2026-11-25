import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiHandler from '../api/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PORT = Number.parseInt(process.env.PORT || '3000', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function enhanceRes(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
    return res;
  };
  return res;
}

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    req.query = Object.fromEntries(url.searchParams.entries());
    req.body = await readBody(req);
    return apiHandler(req, enhanceRes(res));
  }

  const relPath = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const fullPath = path.resolve(PUBLIC_DIR, relPath);
  if (!fullPath.startsWith(PUBLIC_DIR) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    const fallback = path.join(PUBLIC_DIR, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(fallback).pipe(res);
  }

  const ext = path.extname(fullPath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(fullPath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`NontonDrama Web + API running at http://localhost:${PORT}`);
});
