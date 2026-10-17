import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, relative } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Snapshot } from './scan.js';
import type { Profile } from '../core/types.js';

/** Serve one read-only repository snapshot over a token-protected loopback endpoint. */
export async function serve(snapshot: Snapshot & { file: string; cwd: string; profile: Profile }, port: number): Promise<string> {
  const token = randomBytes(24).toString('hex');
  const webRoot = fileURLToPath(new URL('../dist-web/', import.meta.url));
  let allowedHost = '';
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (request.headers.host !== allowedHost || (request.headers.origin && request.headers.origin !== `http://${allowedHost}`)) {
      response.writeHead(403).end('Forbidden origin'); return;
    }
    if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }).end('Read-only server'); return; }
    let url: URL;
    try { url = new URL(request.url ?? '/', `http://${allowedHost}`); } catch { response.writeHead(400).end('Invalid URL'); return; }
    if (url.pathname === '/api/snapshot') {
      const supplied = Buffer.from(url.searchParams.get('token') ?? '');
      if (supplied.length !== token.length || !timingSafeEqual(supplied, Buffer.from(token))) { response.writeHead(403).end('Snapshot token required'); return; }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(snapshot)); return;
    }
    let name: string;
    try { name = decodeURIComponent(url.pathname); } catch { response.writeHead(400).end('Invalid path'); return; }
    const path = resolve(webRoot, `.${name === '/' ? '/index.html' : name}`);
    if (relative(webRoot, path).startsWith('..') || name.includes('\\')) { response.writeHead(403).end('Outside web root'); return; }
    const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain' };
    try {
      const data = await readFile(path);
      response.writeHead(200, { 'Content-Type': `${mime[extname(path)] ?? 'application/octet-stream'}; charset=utf-8` }).end(data);
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise<void>((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolveListening());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not determine local server port.');
  allowedHost = `127.0.0.1:${address.port}`;
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return `http://${allowedHost}/?token=${token}`;
}
