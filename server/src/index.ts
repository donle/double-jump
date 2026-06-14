import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type RawData } from 'ws';
import type { ClientToServerMessage } from '../../shared/net/protocol';
import { RoomManager } from './rooms/RoomManager';

const port = Number(process.env.PORT ?? 8787);
const clientDistDir = resolve(fileURLToPath(new URL('../../client/dist', import.meta.url)));
const roomManager = new RoomManager();
const httpServer = createServer((request, response) => {
  serveClient(request.url ?? '/', request.method ?? 'GET', response);
});
const server = new WebSocketServer({ server: httpServer });

server.on('connection', (socket) => {
  roomManager.attach(socket);

  socket.on('message', (raw) => {
    const message = parseMessage(raw);
    if (!message) {
      socket.send(JSON.stringify({
        type: 'error',
        code: 'BAD_MESSAGE',
        message: 'Invalid message payload.',
      }));
      return;
    }
    roomManager.handle(socket, message);
  });

  socket.on('close', () => {
    roomManager.detach(socket);
  });
});

server.on('listening', () => {
  console.log(`[double-jump-server] listening on ws://localhost:${port}`);
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`[double-jump-server] http://localhost:${port}`);
});

function serveClient(rawUrl: string, method: string, response: ServerResponse): void {
  if (method !== 'GET' && method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  const url = new URL(rawUrl, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = safeResolveClientFile(requestedPath);
  if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
    writeFileResponse(filePath, method, response);
    return;
  }

  if (pathname.startsWith('/assets/')) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('资源不存在。');
    return;
  }

  const indexPath = safeResolveClientFile('/index.html');
  if (indexPath && existsSync(indexPath)) {
    writeFileResponse(indexPath, method, response);
    return;
  }

  response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('前端文件不存在，请先在 client 目录运行构建。');
}

function safeResolveClientFile(pathname: string): string | null {
  const filePath = resolve(clientDistDir, `.${pathname}`);
  const rel = relative(clientDistDir, filePath);
  if (rel.startsWith('..') || rel === '') return rel === '' ? null : null;
  return filePath;
}

function writeFileResponse(filePath: string, method: string, response: ServerResponse): void {
  response.writeHead(200, {
    'Content-Type': contentTypeFor(filePath),
    'Cache-Control': shouldAvoidStaticCache(filePath) ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  if (method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

function contentTypeFor(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.webmanifest':
      return 'application/manifest+json; charset=utf-8';
    case '.map':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function shouldAvoidStaticCache(filePath: string): boolean {
  return filePath.endsWith('index.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest');
}

function parseMessage(raw: RawData): ClientToServerMessage | null {
  try {
    let text: string;
    if (Array.isArray(raw)) {
      text = Buffer.concat(raw).toString('utf8');
    } else if (raw instanceof ArrayBuffer) {
      text = Buffer.from(new Uint8Array(raw)).toString('utf8');
    } else {
      text = raw.toString('utf8');
    }
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== 'object' || !('type' in value)) return null;
    return value as ClientToServerMessage;
  } catch {
    return null;
  }
}
