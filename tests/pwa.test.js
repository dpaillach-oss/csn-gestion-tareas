/* ==========================================================================
   tests/pwa.test.js – Aplicación instalable (PWA), estructura y accesibilidad
   Ejecutar:  node tests/pwa.test.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const H = require('./harness');

const RAIZ = H.RAIZ;
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const existe = (rel) => fs.existsSync(path.join(RAIZ, rel));

/** Dimensiones declaradas en el encabezado IHDR de un PNG */
function tamanoPng(rel) {
  const b = fs.readFileSync(path.join(RAIZ, rel));
  if (b.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
}

H.grupo('1. Manifiesto de la aplicación (PWA)');
const manifiesto = JSON.parse(leer('manifest.json'));
H.contiene(manifiesto.name, 'GESTIÓN DE TAREAS', 'El manifiesto declara el nombre de la aplicación');
H.contiene(manifiesto.name, 'CSN Gestión de Activos Inmobiliarios SPA', 'El manifiesto declara el nombre de la empresa');
H.igual(manifiesto.display, 'standalone', 'Se abre como aplicación independiente (sin barra del navegador)');
H.igual(manifiesto.theme_color, '#003090', 'El color del sistema corresponde al corporativo');
H.igual(manifiesto.lang, 'es-CL', 'El idioma declarado es español de Chile');
H.ok(manifiesto.icons.length >= 3, 'Declara los iconos necesarios para instalar en teléfono y computador');
H.ok(manifiesto.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'), 'Incluye icono adaptable (maskable)');
H.ok(manifiesto.shortcuts && manifiesto.shortcuts.length >= 3, 'Incluye accesos rápidos desde el icono');
H.ok(/productivity|business/.test(manifiesto.categories.join(',')), 'Declara categorías adecuadas');

H.grupo('2. Iconos e imágenes');
[['assets/icons/icon-192.png', 192], ['assets/icons/icon-512.png', 512], ['assets/icons/apple-touch-icon.png', 180]].forEach(([rel, lado]) => {
  H.ok(existe(rel), 'Existe el archivo ' + rel);
  const t = tamanoPng(rel);
  H.ok(t && t.ancho === lado && t.alto === lado, rel + ' mide ' + lado + 'x' + lado + ' píxeles');
});
H.ok(existe('assets/logo.png'), 'Se incluye el logotipo de la empresa');
H.ok(existe('assets/logo-header.png'), 'Se incluye la versión del logotipo para el encabezado');
H.ok(fs.statSync(path.join(RAIZ, 'assets/logo-header.png')).size < 200000, 'El logotipo del encabezado está optimizado para carga rápida');
H.ok(existe('assets/icons/favicon.png'), 'Se incluye el favicon');

H.grupo('3. Página principal y encabezado institucional');
const html = leer('index.html');
H.contiene(html, '<html lang="es-CL">', 'El documento declara el idioma español');
H.contiene(html, 'name="viewport"', 'La página es adaptable a todo tamaño de pantalla');
H.contiene(html, 'viewport-fit=cover', 'Se adapta a teléfonos con muescas o bordes curvos');
H.contiene(html, 'rel="manifest"', 'La página enlaza el manifiesto de la aplicación');
H.contiene(html, 'apple-mobile-web-app-capable', 'Permite instalarla en iPhone y iPad');
H.contiene(html, 'id="brand-l1"', 'Existe la primera fila del encabezado');
H.contiene(html, 'id="brand-l2"', 'Existe la segunda fila del encabezado');
H.contiene(html, 'id="header-logo"', 'El logotipo se ubica en el encabezado');
H.contiene(html, 'id="sidebar"', 'Existe el menú lateral para computador');
H.contiene(html, 'id="bottom-nav"', 'Existe la navegación inferior para teléfono');
H.contiene(html, 'id="sync-pill"', 'Existe el indicador de sincronización');
H.contiene(html, 'id="offline-banner"', 'Existe el aviso de trabajo sin conexión');
H.contiene(html, 'id="report-root"', 'Existe el contenedor de informes para imprimir');
H.contiene(html, 'css/print.css', 'Se cargan los estilos de impresión (informes en PDF)');
H.contiene(html, 'id="toasts"', 'Existen los avisos al usuario');
H.noContiene(html, 'TODO', 'No quedan tareas pendientes marcadas en el código');

H.grupo('4. Módulos y archivos de la aplicación');
const scripts = [];
const re = /<script src="([^"]+)"><\/script>/g;
let m;
while ((m = re.exec(html))) scripts.push(m[1]);
H.ok(scripts.length >= 20, 'La aplicación se organiza en ' + scripts.length + ' módulos');
H.ok(scripts.every(existe), 'Todos los módulos declarados existen en disco');
H.igual(scripts[scripts.length - 1], 'js/app.js', 'El núcleo de la aplicación se carga al final');
['js/util.js', 'js/db.js', 'js/model.js', 'js/store.js', 'js/report.js',
  'js/sync/core.js', 'js/sync/gist.js', 'js/sync/supabase.js', 'js/sync/archivos.js']
  .forEach((s) => H.ok(scripts.indexOf(s) >= 0, 'Se carga el módulo ' + s));
const css = [];
const re2 = /<link rel="stylesheet" href="([^"]+)">/g;
while ((m = re2.exec(html))) css.push(m[1]);
H.ok(css.every(existe), 'Todas las hojas de estilo existen');

H.grupo('5. Trabajo sin conexión (Service Worker)');
const sw = leer('sw.js');
H.contiene(sw, 'addEventListener(\'install\'', 'El service worker se instala');
H.contiene(sw, 'addEventListener(\'activate\'', 'El service worker se activa y limpia versiones anteriores');
H.contiene(sw, 'addEventListener(\'fetch\'', 'El service worker gestiona las peticiones sin conexión');
const listaCache = /var ESTATICOS = \[([\s\S]*?)\];/.exec(sw);
H.ok(!!listaCache, 'El service worker declara los archivos a almacenar');
const archivosCache = listaCache[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter((s) => s && s !== './');
H.ok(archivosCache.length >= 25, 'Almacena ' + archivosCache.length + ' archivos para uso sin conexión');
archivosCache.forEach((rel) => H.ok(existe(rel), 'Archivo almacenado para uso sin conexión: ' + rel));
scripts.forEach((s) => H.ok(archivosCache.indexOf(s) >= 0, 'El módulo ' + s + ' está incluido en el almacenamiento sin conexión'));
H.ok(/url\.origin !== location\.origin/.test(sw), 'Las llamadas a los servicios en la nube no se interceptan: sólo se gestionan archivos del propio sitio');

H.grupo('6. Estilos de impresión de informes');
const print = leer('css/print.css');
H.contiene(print, '@page', 'Se define el tamaño de página para el PDF');
H.contiene(print, 'letter portrait', 'El informe se genera en hoja carta vertical');
H.contiene(print, '.report-only', 'Existe la capa exclusiva del informe');
H.contiene(print, '.topbar, .sidebar, .bottom-nav', 'Se ocultan los menús al imprimir');
H.contiene(print, 'page-break-inside: avoid', 'Se evita cortar las tareas entre páginas');
H.contiene(print, '.rpt-logo img', 'El informe incluye el logotipo');
H.contiene(print, '.rpt-sign', 'El informe incluye el espacio para las firmas');
H.contiene(print, 'display: table-header-group', 'Los títulos de las tablas se repiten en cada página');
const estilos = leer('css/styles.css');
H.contiene(estilos, '--c-primary: #003090', 'El color principal corresponde al logotipo de la empresa');
H.contiene(estilos, '--c-accent: #60cc24', 'El color secundario corresponde al logotipo de la empresa');
H.contiene(estilos, '@media (max-width: 780px)', 'Existe una adaptación específica para teléfonos');
H.contiene(estilos, '.bottom-nav', 'Los teléfonos cuentan con navegación inferior');
H.contiene(estilos, 'font-size: 16px !important', 'Se evita el zoom automático de los formularios en iPhone');
H.contiene(estilos, 'safe-area-inset-bottom', 'Se respeta el área segura de los teléfonos modernos');

H.grupo('7. Servidor local y base de datos en la nube');
H.ok(existe('server.js'), 'Se incluye el servidor local para probar en el teléfono');
try {
  execFileSync(process.execPath, ['--check', path.join(RAIZ, 'server.js')], { stdio: 'pipe' });
  H.ok(true, 'El servidor local no tiene errores de sintaxis');
} catch (e) { H.ok(false, 'El servidor local no tiene errores de sintaxis'); }
const server = leer('server.js');
H.contiene(server, 'application/manifest+json', 'El servidor entrega el manifiesto con el tipo correcto');
H.contiene(server, '0.0.0.0', 'El servidor permite el acceso desde el teléfono en la misma red');
const sql = leer('supabase/schema.sql');
H.contiene(sql, 'create table if not exists public.csn_registros', 'Se incluye el script de creación de la tabla en la nube');
H.contiene(sql, 'enable row level security', 'La tabla en la nube exige control de acceso por fila');
H.ok(/coleccion\s+text not null/.test(sql), 'Cada registro identifica su colección');
H.ok(/ts\s+bigint/.test(sql), 'Cada registro guarda su marca de tiempo (control de conflictos)');
H.contiene(sql, 'jsonb', 'El contenido se guarda en formato JSON');
H.ok(existe('GUIA.md'), 'Se incluye la guía de instalación y uso');
H.ok(existe('publicar.js'), 'Se incluye el script para publicar la aplicación en Internet');
try {
  execFileSync(process.execPath, ['--check', path.join(RAIZ, 'publicar.js')], { stdio: 'pipe' });
  H.ok(true, 'El script de publicación no tiene errores de sintaxis');
} catch (e) { H.ok(false, 'El script de publicación no tiene errores de sintaxis'); }
const publicar = leer('publicar.js');
H.ok(/auth[^\n]*status/.test(publicar), 'El script de publicación verifica la sesión de GitHub antes de publicar');
H.contiene(publicar, 'gh repo create', 'El script crea el repositorio automáticamente');
H.contiene(publicar, 'pages', 'El script habilita la publicación por HTTPS (GitHub Pages)');
H.contiene(publicar, 'node_modules', 'El script no publica las dependencias de desarrollo');
H.ok(/ghp_|github_pat_/.test(publicar), 'El script revisa que no se publiquen credenciales por error');
H.contiene(publicar, 'Generar código para el celular', 'El script explica cómo vincular el celular');
H.ok(existe('.gitignore'), 'Se incluye .gitignore para no publicar archivos de desarrollo');
H.contiene(leer('.gitignore'), 'node_modules', 'El .gitignore excluye las dependencias');
H.contiene(leer('GUIA.md'), 'código de vinculación', 'La guía explica la vinculación del celular con un código');
H.contiene(leer('GUIA.md'), 'publicar.js', 'La guía explica cómo publicar la aplicación');
H.contiene(leer('js/sync/core.js'), 'generarCodigoVinculacion', 'La aplicación genera el código de vinculación');
H.contiene(leer('js/sync/core.js'), 'aplicarCodigoVinculacion', 'La aplicación aplica el código en el dispositivo nuevo');
H.contiene(leer('js/sync/gist.js'), 'snapshot: true', 'El repositorio cifrado publica siempre el conjunto completo (permite vincular dispositivos nuevos)');
H.contiene(leer('js/sync/supabase.js'), 'snapshot: false', 'La base de datos por filas sincroniza de forma incremental');

H.grupo('8. Accesibilidad y usabilidad');
const app = leer('js/app.js');
H.contiene(html, 'aria-label="Abrir menú"', 'Los botones de icono describen su función');
H.contiene(html, 'alt="Logotipo CSN"', 'El logotipo tiene texto alternativo');
H.contiene(html, '<label for="login-email">', 'Los campos de ingreso tienen etiqueta');
H.contiene(html, '<label for="login-password">', 'El campo de contraseña tiene etiqueta');
H.contiene(html, 'autocomplete="current-password"', 'El ingreso permite el gestor de contraseñas del navegador');
H.contiene(estilos, ':focus', 'Se resalta el elemento activo para navegación con teclado');
const store = leer('js/store.js');
H.contiene(store, "sha256(u.salt + '::' + clave)", 'Las contraseñas no se guardan en texto claro');
H.contiene(store, 'No puede eliminar el usuario con el que está conectado', 'Se evita dejar el sistema sin administrador');
const sync = leer('js/sync/core.js');
H.contiene(sync, "CAMPOS_PRIVADOS = ['gistToken', 'supabaseKey', 'syncClave'", 'Las credenciales nunca se envían a la nube');
H.contiene(sync, "'sincronizado': { texto: 'SINCRONIZADO'", 'El indicador muestra SINCRONIZADO');
H.contiene(sync, "'sincronizando': { texto: 'SINCRONIZANDO'", 'El indicador muestra SINCRONIZANDO');
H.contiene(sync, "'sin-conexion': { texto: 'SIN CONEXIÓN'", 'El indicador muestra SIN CONEXIÓN');

H.grupo('9. Módulos preparados para ampliaciones');
const model = leer('js/model.js');
H.contiene(model, 'M.ESTADOS', 'Se definen los 6 estados del flujo de trabajo');
['Pendiente', 'En proceso', 'Pendiente de terceros', 'Completada', 'Cancelada', 'Vencida']
  .forEach((e) => H.contiene(model, "'" + e + "'", 'Estado disponible: ' + e));
['Baja', 'Media', 'Alta', 'Urgente'].forEach((p) => H.contiene(model, "'" + p + "'", 'Prioridad disponible: ' + p));
const db = leer('js/db.js');
['comunidades', 'tareas', 'avances', 'archivos', 'usuarios', 'historial', 'config', 'conflictos', 'bitacora']
  .forEach((c) => H.contiene(db, "'" + c + "'", 'Tabla creada: ' + c));
H.contiene(leer('js/report.js'), 'EXPORTAR EXCEL', 'La exportación a Excel está integrada en la interfaz');
H.contiene(fs.readFileSync(path.join(RAIZ, 'js/views/config.js'), 'utf8'), 'preparada para incorporar nuevos módulos',
  'La configuración documenta la escalabilidad del sistema');

/* --- Las comprobaciones del service worker son asíncronas --- */
(async () => {
  /* ---------- 10. Service worker: comportamiento ante fallos de red ---------- */
  H.grupo('10. Service worker (no debe ocultar ni interferir con la sincronización)');
  {
    const vm = require('vm');
    const sw = leer('sw.js');

    // Las peticiones al servicio en la nube NO deben pasar por el service worker
    H.noContiene(sw, 'caches.match(e.request); })', 'Ya no se devuelven respuestas vacías que provoquen «NetworkError»');
    H.contiene(sw, 'respuestaSinConexion', 'Existe una respuesta clara cuando no hay conexión ni copia guardada');
    H.contiene(sw, "if (url.origin !== location.origin) return;", 'Sólo se gestionan archivos del propio sitio');

    function entornoSW(opciones) {
      opciones = opciones || {};
      const manejadores = {};
      const respondidos = [];
      const contexto = {
        console,
        URL,
        Promise,
        setTimeout,
        clearTimeout,
        Response: class Respuesta {
          constructor(cuerpo, opts) { this.body = cuerpo; this.status = (opts && opts.status) || 200; this.type = 'basic'; }
        },
        location: { origin: 'https://dpaillach-oss.github.io' },
        caches: {
          match: () => Promise.resolve(opciones.enCache || null),
          open: () => Promise.resolve({ put: () => Promise.resolve(), addAll: () => Promise.resolve() }),
          keys: () => Promise.resolve([]),
          delete: () => Promise.resolve(true)
        },
        fetch: () => opciones.redFalla
          ? Promise.reject(Object.assign(new Error('NetworkError when attempting to fetch resource.'), { name: 'TypeError' }))
          : Promise.resolve({ status: 200, type: 'basic', clone() { return this; } }),
        self: {
          addEventListener: (tipo, fn) => { manejadores[tipo] = fn; },
          clients: { claim: () => Promise.resolve() },
          skipWaiting: () => {}
        }
      };
      vm.createContext(contexto);
      vm.runInContext(sw, contexto);
      return {
        disparar: (url, method) => {
          manejadores.fetch({
            request: { url, method: method || 'GET' },
            respondWith: (p) => { respondidos.push(p); }
          });
          return respondidos;
        }
      };
    }

    // 1) Petición al servicio en la nube: no se intercepta (así llegan los errores reales)
    const sw1 = entornoSW({});
    H.igual(sw1.disparar('https://api.github.com/gists/123', 'GET').length, 0,
      'Las llamadas a la sincronización pasan directo a la red, sin intervención del service worker');
    H.igual(sw1.disparar('https://mlvldb.supabase.co/rest/v1/csn_registros', 'PATCH').length, 0,
      'Los envíos a la base de datos en la nube no se interceptan');

    // 2) Archivo propio con copia guardada: se responde desde la caché (funciona sin conexión)
    const copia = { status: 200, type: 'basic', guardada: true };
    const sw2 = entornoSW({ enCache: copia });
    const r2 = sw2.disparar('https://dpaillach-oss.github.io/csn-gestion-tareas/js/app.js');
    H.igual(r2.length, 1, 'Los archivos propios sí se sirven desde la caché');
    H.igual(await r2[0], copia, 'Se entrega la copia guardada sin esperar la red');

    // 3) Archivo propio sin copia y sin red: respuesta válida y comprensible (no un error vacío)
    const sw3 = entornoSW({ redFalla: true });
    const r3 = sw3.disparar('https://dpaillach-oss.github.io/csn-gestion-tareas/js/nuevo.js');
    const resp3 = await r3[0];
    H.ok(!!resp3, 'Se responde algo válido aunque no haya red ni copia guardada');
    H.igual(resp3.status, 503, 'La respuesta indica que no hay conexión');
    H.contiene(String(resp3.body), 'Sin conexión', 'La respuesta explica el problema en español');

    // 4) Archivo propio sin copia pero con red: se entrega desde la red
    const sw4 = entornoSW({});
    const r4 = sw4.disparar('https://dpaillach-oss.github.io/csn-gestion-tareas/css/styles.css');
    const resp4 = await r4[0];
    H.igual(resp4.status, 200, 'Con conexión se entrega el archivo desde la red');
  }

  H.resumen('pwa.test.js');
})().catch((e) => {
  console.error('\n✗ ERROR EN LA SUITE:', e);
  process.exit(1);
});
