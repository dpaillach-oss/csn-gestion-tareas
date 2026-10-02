/* ==========================================================================
   sw.js – Service Worker (PWA)
   Permite instalar la aplicación, abrirla como aplicación de escritorio o de
   teléfono y trabajar sin conexión con los datos ya descargados.
   ========================================================================== */
var VERSION = 'csn-tareas-v1.0.2';
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

/* Devuelve una respuesta válida cuando no hay conexión ni copia guardada.
   Es importante responder SIEMPRE algo válido: si el manejador devuelve una
   respuesta vacía, el navegador informa un error de red genérico y oculta la
   causa real del problema. */
function respuestaSinConexion() {
  return new Response(
    '<!DOCTYPE html><html lang="es"><meta charset="utf-8">' +
    '<title>Sin conexión</title>' +
    '<body style="font-family:system-ui,-apple-system,sans-serif;padding:2rem;color:#1c2333">' +
    '<h1 style="color:#003090">Sin conexión</h1>' +
    '<p>Este archivo todavía no está guardado en el dispositivo y ahora no hay Internet.</p>' +
    '<p>Los datos que ya descargaste siguen disponibles; vuelve a intentarlo cuando recuperes la conexión.</p>' +
    '<p><button onclick="location.reload()" style="padding:.6rem 1.2rem;border:0;border-radius:8px;' +
    'background:#003090;color:#fff;font-size:1rem">Reintentar</button></p></body></html>',
    { status: 503, statusText: 'Sin conexión', headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('fetch', function (e) {
  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }

  // Sólo se gestionan pedidos GET del propio sitio (los archivos de la aplicación).
  // Cualquier otra petición —envíos a los servicios en la nube (GitHub, Supabase),
  // métodos POST/PATCH y otros dominios— pasa directamente a la red, sin
  // intervención, para no alterar la respuesta ni ocultar los errores reales.
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request).then(function (enCache) {
      // Primero la copia guardada (rápido y funciona sin conexión); en paralelo
      // se actualiza desde la red cuando hay Internet.
      var desdeRed = fetch(e.request).then(function (resp) {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          var copia = resp.clone();
          caches.open(VERSION).then(function (c) { c.put(e.request, copia); });
        }
        return resp;
      }).catch(function () {
        return enCache || respuestaSinConexion();
      });
      return enCache || desdeRed;
    })
  );
});
