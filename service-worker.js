// ============================================================
// service-worker.js v2.1 – PCI App
// ============================================================
const CACHE_NAME = 'pci-app-v2.3.0';

const APP_SHELL = [
    '/PCI-EBS/',
    '/PCI-EBS/index.html',
    '/PCI-EBS/app.js',
    '/PCI-EBS/manifest.json',
    '/PCI-EBS/icons/icon-192.png',
    '/PCI-EBS/icons/icon-512.png',
  ];

self.addEventListener('install', event => {
  console.log('[SW] Instalando:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(APP_SHELL.map(url => cache.add(url).catch(e => console.warn('[SW] No cacheado:', url))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Pasar directo: GAS, POST, extensiones no-web
