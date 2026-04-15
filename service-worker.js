// ============================================================
// service-worker.js v2.1 – PCI App
// ============================================================
const CACHE_NAME = 'pci-app-v2.2.0';

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
  if (url.hostname.includes('script.google.com')) return;
  if (request.method !== 'GET') return;

  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com') ||
      url.hostname.includes('cdn.tailwindcss.com')) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200 && res.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return new Response(
      `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Sin conexion</title>
      <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f4f8;}
      .box{text-align:center;padding:40px;background:white;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);}h2{color:#1e40af;}</style></head>
      <body><div class="box"><h2>Sin conexion</h2><p>Los datos se guardan localmente y se sincronizan al recuperar la conexion.</p></div></body></html>`,
      { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return (await caches.match(req)) || new Response('', { status: 503 });
  }
}

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Background Sync: se dispara automaticamente cuando el dispositivo
// recupera conexion, aunque la pestana este en segundo plano o cerrada.
self.addEventListener('sync', event => {
  if (event.tag === 'pci-sync-pending') {
    event.waitUntil(
      self.clients
        .matchAll({ includeUncontrolled: true, type: 'window' })
        .then(clients => {
          clients.forEach(c => c.postMessage({ type: 'SW_SYNC_REQUEST' }));
        })
    );
  }
});
