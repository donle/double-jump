const CACHE_VERSION = 'double-jump-pwa-v1';
const STATIC_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/pwa-icon.svg',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-maskable-512.png',
  '/imagegen/easy-portrait-bg.png',
  '/imagegen/normal-portrait-bg.png',
  '/imagegen/hard-portrait-bg.png',
  '/imagegen/player-p1.png',
  '/imagegen/player-p2.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(STATIC_URLS);
    await cacheIndexAssets(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstIndex(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheIndexAssets(cache) {
  const response = await fetch('/index.html', { cache: 'no-cache' });
  if (!response.ok) return;
  const html = await response.clone().text();
  await cache.put('/index.html', response);

  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], self.location.origin).href)
    .filter((href) => href.startsWith(self.location.origin));

  await Promise.all(urls.map(async (href) => {
    try {
      await cache.add(href);
    } catch {
      // 单个资源失败不应阻止 PWA 安装。
    }
  }));
}

async function networkFirstIndex(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put('/index.html', response.clone());
    return response;
  } catch {
    return (await cache.match('/index.html')) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
