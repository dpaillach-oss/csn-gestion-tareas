/* ==========================================================================
   sw.js – Service Worker (PWA)
   Permite instalar la aplicación, abrirla como aplicación de escritorio o de
   teléfono y trabajar sin conexión con los datos ya descargados.
   ========================================================================== */
var VERSION = 'csn-tareas-v1.0.1';
var ESTATICOS = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'css/print.css',
  'js/util.js',
  'js/db.js',
  'js/crypto.js',
  'js/zip.js',
  'js/xlsx.js',
  'js/model.js',
  'js/store.js',
  'js/sync/core.js',
  'js/sync/gist.js',
  'js/sync/supabase.js',
  'js/sync/archivos.js',
  'js/sync/index.js',
  'js/report.js',
  'js/views/ui.js',
  'js/views/dashboard.js',
  'js/views/comunidades.js',
  'js/views/tareas.js',
  'js/views/calendario.js',
  'js/views/informes.js',
  'js/views/buscar.js',
  'js/views/usuarios.js',
  'js/views/config.js',
  'js/app.js',
  'assets/logo.png',
  'assets/logo-header.png',
  'assets/icons/favicon.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      return Promise.all(ESTATICOS.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (claves) {
      return Promise.all(claves.map(function (k) {
        if (k !== VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Nunca se almacenan en caché las llamadas a los servicios en la nube
  if (/github\.com|supabase\.co/.test(url.hostname)) return;

  if (url.origin === location.origin) {
    // Archivos propios: primero la caché (rápido y funciona sin conexión)
    e.respondWith(
      caches.match(e.request).then(function (r) {
        var red = fetch(e.request).then(function (resp) {
          if (resp && resp.status === 200) {
            var copia = resp.clone();
            caches.open(VERSION).then(function (c) { c.put(e.request, copia); });
          }
          return resp;
        }).catch(function () { return r; });
        return r || red;
      })
    );
    return;
  }
  // Otros orígenes: red con respaldo en caché
  e.respondWith(fetch(e.request).catch(function () { return caches.match(e.request); }));
});
