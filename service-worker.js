// ============================================================
// service-worker.js – PCI App
// ESE Hospital Regional Noroccidental
// ============================================================

const CACHE_NAME = 'pci-app-v1.0.0';

// App Shell – archivos estáticos a cachear
const APP_SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // CDN de Tailwind (se cachea en runtime la primera vez)
];

// ─── INSTALL ─────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando versión:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando App Shell');
        // Usamos addAll con manejo de errores individuales
        return Promise.allSettled(
          APP_SHELL.map(url => cache.add(url).catch(err => {
            console.warn('[SW] No se pudo cachear:', url, err);
          }))
        );
      })
      .then(() => self.skipWaiting()) // Activar inmediatamente
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activando:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Eliminando caché obsoleto:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── FETCH ───────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar peticiones a Google Apps Script (sync)
  if (url.hostname.includes('script.google.com')) {
    return; // Dejar pasar directamente
  }

  // No interceptar peticiones POST (guardado de datos)
  if (request.method !== 'GET') {
    return;
  }

  // Para Google Fonts y Tailwind CDN – Network First con fallback a caché
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.tailwindcss.com')
  ) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // Para recursos locales – Cache First con fallback a red
  event.respondWith(cacheFirstWithNetwork(request));
});

// ─── ESTRATEGIAS DE CACHÉ ────────────────────────────────────

/**
 * Cache First: Sirve desde caché, si no existe va a la red y guarda.
 * Ideal para App Shell (archivos locales estáticos).
 */
async function cacheFirstWithNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    // Guardar en caché si la respuesta es válida
    if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // Si falla la red y no hay caché, devolver página offline
    console.warn('[SW] Sin red y sin caché para:', request.url);
    return new Response(
      `<!DOCTYPE html>
       <html lang="es">
       <head><meta charset="UTF-8"><title>Sin conexión</title>
       <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f4f8;}
       .box{text-align:center;padding:40px;background:white;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);}
       h2{color:#1e40af;}p{color:#64748b;}</style></head>
       <body><div class="box">
         <h2>📡 Sin conexión</h2>
         <p>Los datos ingresados se guardan localmente.<br>Se sincronizarán al recuperar la conexión.</p>
       </div></body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

/**
 * Network First: Va a la red primero, si falla usa caché.
 * Ideal para recursos CDN externos.
 */
async function networkFirstWithCache(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('', { status: 503 });
  }
}

// ─── BACKGROUND SYNC (si el navegador lo soporta) ────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pci-records') {
    console.log('[SW] Background Sync activado');
    // La sincronización real ocurre en app.js vía syncPendingRecords()
    // Aquí solo notificamos a los clientes
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'BACKGROUND_SYNC', tag: event.tag });
        });
      })
    );
  }
});

// ─── MENSAJES DESDE LA APP ────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
