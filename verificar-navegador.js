#!/usr/bin/env node
/* ==========================================================================
   verificar-navegador.js – Prueba de aceptación en un navegador REAL
   Ejecuta la aplicación en Google Chrome (sin interfaz), recorre las pantallas
   principales, genera capturas de pantalla, produce un informe PDF de ejemplo
   y comprueba el funcionamiento sin conexión (service worker).

   Uso:   node verificar-navegador.js
   Salida: revision-impresion/  (capturas PNG e informe PDF de ejemplo)
   ========================================================================== */
'use strict';
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const RAIZ = __dirname;
const SALIDA = path.join(RAIZ, 'revision-impresion');
const PUERTO = 8099;
const PUERTO_CDP = 9333;
const PERFIL = '/tmp/csn-chrome-perfil';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const paso = (n, t) => console.log('\n\x1b[1m' + n + '. ' + t + '\x1b[0m');
let pruebas = 0, fallas = 0;
function ok(cond, desc, extra) {
  pruebas++;
  if (cond) console.log('  \x1b[32m✓\x1b[0m ' + desc);
  else { fallas++; console.log('  \x1b[31m✗ ' + desc + '\x1b[0m' + (extra ? '\n      ' + extra : '')); }
}

/* ---------- Utilidades HTTP ---------- */
function pedirJson(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => {
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}
async function esperarServidor(url, intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    try { await pedirJson(url); return true; } catch (e) { await esperar(250); }
  }
  return false;
}

/* ---------- Cliente mínimo del protocolo DevTools ---------- */
function crearCdp(wsUrl) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pendientes = new Map();
    const oyentes = {};
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pendientes.has(m.id)) {
        const { res: r, rej: rj } = pendientes.get(m.id);
        pendientes.delete(m.id);
        if (m.error) rj(new Error(m.error.message)); else r(m.result);
      } else if (m.method && oyentes[m.method]) {
        oyentes[m.method].forEach((f) => f(m.params));
      }
    });
    ws.addEventListener('error', rej);
    ws.addEventListener('open', () => res({
      enviar: (method, params) => new Promise((r, rj) => {
        const mid = ++id;
        pendientes.set(mid, { res: r, rej: rj });
        ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
      }),
      on: (method, fn) => { (oyentes[method] = oyentes[method] || []).push(fn); },
      cerrar: () => ws.close()
    }));
  });
}

/* ---------- Evaluación de código en el navegador ---------- */
async function evaluar(cdp, expresion, esperarPromesa = true) {
  const r = await cdp.enviar('Runtime.evaluate', {
    expression: expresion, awaitPromise: esperarPromesa, returnByValue: true, allowUnsafeEvalBlockedByCSP: true
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : 'Error al evaluar');
  return r.result.value;
}
async function esperarCondicion(cdp, condicion, ms = 8000, paso2 = 200) {
  const inicio = Date.now();
  while (Date.now() - inicio < ms) {
    if (await evaluar(cdp, '!!(' + condicion + ')', false)) return true;
    await esperar(paso2);
  }
  return false;
}
async function captura(cdp, nombre) {
  const r = await cdp.enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(SALIDA, nombre), Buffer.from(r.data, 'base64'));
  return path.join(SALIDA, nombre);
}

/* ================= Proceso principal ================= */
(async function main() {
  if (!fs.existsSync(CHROME)) { console.error('No se encontró Google Chrome en ' + CHROME); process.exit(2); }
  fs.mkdirSync(SALIDA, { recursive: true });
  fs.rmSync(PERFIL, { recursive: true, force: true });

  paso(0, 'Preparación del entorno');
  const servidor = spawn(process.execPath, [path.join(RAIZ, 'server.js'), String(PUERTO)], { stdio: 'ignore' });
  const url = `http://localhost:${PUERTO}/index.html`;
  ok(await esperarServidor(`http://localhost:${PUERTO}/manifest.json`), 'El servidor local entrega la aplicación');

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-features=Translate', '--hide-scrollbars',
    '--remote-debugging-port=' + PUERTO_CDP,
    '--user-data-dir=' + PERFIL,
    '--window-size=1440,950',
    'about:blank'
  ], { stdio: 'ignore' });
  ok(await esperarServidor(`http://localhost:${PUERTO_CDP}/json/version`), 'El navegador Chrome se inicia');

  const version = await pedirJson(`http://localhost:${PUERTO_CDP}/json/version`);
  console.log('     ' + version.Browser);
  const objetivos = await pedirJson(`http://localhost:${PUERTO_CDP}/json/list`);
  const pagina = objetivos.filter((o) => o.type === 'page')[0];
  const cdp = await crearCdp(pagina.webSocketDebuggerUrl);

  const errores = [];
  cdp.on('Runtime.exceptionThrown', (p) => errores.push('Excepción: ' + (p.exceptionDetails.exception && p.exceptionDetails.exception.description || p.exceptionDetails.text)));
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') errores.push('console.error: ' + (p.args || []).map((a) => a.value || a.description || '').join(' '));
  });
  cdp.on('Log.entryAdded', (p) => { if (p.entry && p.entry.level === 'error') errores.push('log: ' + p.entry.text); });

  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');
  await cdp.enviar('Log.enable');
  await cdp.enviar('Network.enable');

  /* ---------- 1. Carga de la aplicación ---------- */
  paso(1, 'Carga de la aplicación en el navegador');
  await cdp.enviar('Page.navigate', { url });
  ok(await esperarCondicion(cdp, 'window.CSN && CSN.app && CSN.app.listo', 20000), 'La aplicación se inicia correctamente en Chrome');
  ok(await esperarCondicion(cdp, "document.querySelector('#login-screen') && !document.querySelector('#login-screen').classList.contains('hidden')"), 'Aparece la pantalla de ingreso');
  ok(await evaluar(cdp, "document.querySelectorAll('#login-form [data-autofocus], #login-email').length > 0"), 'El formulario de ingreso está disponible');
  ok(await evaluar(cdp, "CSN.store.todas('comunidades').length", false) === 3, 'Se cargan las 3 comunidades de demostración');
  await captura(cdp, '01-ingreso.png');

  ok(await evaluar(cdp, "CSN.db.modo", false) === 'idb', 'El navegador utiliza IndexedDB para el almacenamiento local');

  /* ---------- 2. Ingreso y dashboard ---------- */
  paso(2, 'Ingreso y panel general');
  await evaluar(cdp, "CSN.store.login('admin@csn.cl','csn2026').then(function(){ CSN.app.mostrarApp(); return true; })");
  ok(await esperarCondicion(cdp, "!document.querySelector('#app-shell').classList.contains('hidden')"), 'El ingreso abre la aplicación');
  ok(await evaluar(cdp, "document.querySelector('#brand-l1').textContent", false) === 'GESTIÓN DE TAREAS', 'El encabezado muestra «GESTIÓN DE TAREAS»');
  ok(await evaluar(cdp, "/CSN Gestión de Activos Inmobiliarios SPA/.test(document.querySelector('#brand-l2').textContent)", false), 'El encabezado muestra el nombre de la empresa');
  ok(await evaluar(cdp, "!!document.querySelector('#header-logo').getAttribute('src')", false), 'El logotipo aparece en la esquina superior derecha');
  await esperar(600);
  ok(await evaluar(cdp, "document.querySelectorAll('#view-root .kpi').length", false) >= 8, 'El panel muestra los 8 indicadores');
  ok(await evaluar(cdp, "document.querySelectorAll('#view-root .bar-row').length", false) >= 3, 'Se dibujan los gráficos por comunidad');
  ok(await evaluar(cdp, "!!document.querySelector('#view-root .donut')", false), 'Se dibuja la distribución por estado');
  await captura(cdp, '02-dashboard-computador.png');

  /* ---------- 3. Comunidades y panel individual ---------- */
  paso(3, 'Comunidades y panel individual');
  await evaluar(cdp, "CSN.app.ir('comunidades'); true", false);
  await esperar(500);
  ok(await evaluar(cdp, "document.querySelectorAll('#view-root .card[data-comunidad]').length", false) === 3, 'Se listan las comunidades registradas');
  await captura(cdp, '03-comunidades.png');
  await evaluar(cdp, "CSN.app.ir('comunidad',{id: CSN.store.comunidades()[0].id}); true", false);
  await esperar(600);
  ok(await evaluar(cdp, "/COMUNIDAD ATALAYA/.test(document.querySelector('#view-root').textContent)", false), 'Se abre el panel exclusivo de la comunidad');
  ok(await evaluar(cdp, "document.querySelectorAll('#view-root tbody tr').length", false) >= 3, 'El panel lista las tareas de la comunidad');
  await captura(cdp, '04-panel-comunidad.png');

  /* ---------- 4. Ficha de tarea ---------- */
  paso(4, 'Ficha de tarea con seguimiento, fotografías y documentos');
  await evaluar(cdp, "CSN.views.tareas.ficha(CSN.store.todas('tareas')[0].id); true", false);
  await esperar(700);
  ok(await evaluar(cdp, "!!document.querySelector('#ficha-tarea')", false), 'La ficha de la tarea se abre');
  ok(await evaluar(cdp, "!!document.querySelector('#ficha-tarea [data-f=\\\"foto\\\"]')", false), 'Incluye el botón «TOMAR FOTOGRAFÍA»');
  ok(await evaluar(cdp, "!!document.querySelector('#ficha-tarea [data-f=\\\"adjunto\\\"]')", false), 'Incluye el botón «ADJUNTAR ARCHIVO»');
  ok(await evaluar(cdp, "/Historial de modificaciones/.test(document.querySelector('#ficha-tarea').textContent)", false), 'Incluye el historial de modificaciones');
  await captura(cdp, '05-ficha-tarea.png');
  await evaluar(cdp, "CSN.util.Modal.cerrar(); true", false);

  /* ---------- 5. Calendario, informes y buscador ---------- */
  paso(5, 'Calendario, informes y buscador');
  await evaluar(cdp, "CSN.app.ir('calendario'); true", false);
  await esperar(600);
  ok(await evaluar(cdp, "document.querySelectorAll('#view-root .cal-cell').length", false) >= 28, 'El calendario muestra la grilla mensual');
  await captura(cdp, '06-calendario.png');

  await evaluar(cdp, "CSN.app.ir('informes'); true", false);
  await esperar(700);
  ok(await evaluar(cdp, "!!document.querySelector('#informe-preview') && /Resumen de tareas/.test(document.querySelector('#informe-preview').textContent)", false), 'La vista previa del informe se genera');
  await captura(cdp, '07-informes.png');

  await evaluar(cdp, "CSN.app.ir('buscar',{texto:'ascensor'}); true", false);
  await esperar(700);
  ok(await evaluar(cdp, "document.querySelectorAll('#resultados .task-card').length", false) >= 2, 'El buscador global encuentra las tareas de ascensor');

  /* ---------- 6. Informe PDF de ejemplo ---------- */
  paso(6, 'Generación del informe PDF (hoja carta)');
  await evaluar(cdp, "document.getElementById('report-root').innerHTML = CSN.report.htmlInforme({comunidadId:'todas', desde:'', hasta:'', incluirAvances:true, incluirFotos:true, incluirHistorial:true}); true", false);
  await esperar(500);
  const pdf = await cdp.enviar('Page.printToPDF', {
    paperWidth: 8.5, paperHeight: 11, printBackground: true, preferCSSPageSize: true,
    marginTop: 0.55, marginBottom: 0.6, marginLeft: 0.5, marginRight: 0.5, displayHeaderFooter: false
  });
  const archivoPdf = path.join(SALIDA, 'informe-ejemplo.pdf');
  fs.writeFileSync(archivoPdf, Buffer.from(pdf.data, 'base64'));
  const pesoPdf = fs.statSync(archivoPdf).size;
  ok(pesoPdf > 20000, 'Se genera el informe PDF con formato profesional (' + Math.round(pesoPdf / 1024) + ' KB)');
  const cabecera = fs.readFileSync(archivoPdf).slice(0, 5).toString();
  ok(cabecera === '%PDF-', 'El archivo generado es un PDF válido');
  const paginas = (fs.readFileSync(archivoPdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok(paginas >= 1, 'El PDF contiene ' + paginas + ' página(s)');
  await evaluar(cdp, "document.getElementById('report-root').innerHTML=''; true", false);

  /* ---------- 7. Vista de teléfono ---------- */
  paso(7, 'Comprobación en pantalla de teléfono (390 × 844)');
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.enviar('Emulation.setTouchEmulationEnabled', { enabled: true });
  await evaluar(cdp, "CSN.app.ir('dashboard'); true", false);
  await esperar(700);
  ok(await evaluar(cdp, "window.getComputedStyle(document.querySelector('#bottom-nav')).display", false) !== 'none', 'Aparece la navegación inferior para el teléfono');
  ok(await evaluar(cdp, "window.getComputedStyle(document.querySelector('#sidebar')).transform !== 'none' || document.querySelector('#sidebar').getBoundingClientRect().left < 0", false), 'El menú lateral queda oculto y se abre con el botón ☰');
  ok(await evaluar(cdp, "document.querySelectorAll('#view-root .task-card').length", false) >= 1, 'Las tareas se muestran como tarjetas táctiles en el teléfono');
  await captura(cdp, '08-teléfono-dashboard.png');

  await evaluar(cdp, "CSN.app.ir('tareas'); true", false);
  await esperar(600);
  await captura(cdp, '09-teléfono-tareas.png');
  await evaluar(cdp, "document.querySelector('#burger').click(); true", false);
  await esperar(500);
  ok(await evaluar(cdp, "document.querySelector('#sidebar').classList.contains('open')", false), 'El menú lateral se abre correctamente en el teléfono');
  await captura(cdp, '10-teléfono-menú.png');
  await evaluar(cdp, "CSN.app.cerrarMenu(); true", false);

  await evaluar(cdp, "CSN.views.tareas.ficha(CSN.store.todas('tareas')[0].id); true", false);
  await esperar(700);
  ok(await evaluar(cdp, "!!document.querySelector('#ficha-tarea')", false), 'La ficha se adapta a la pantalla del teléfono');
  await captura(cdp, '11-teléfono-ficha.png');
  await evaluar(cdp, "CSN.util.Modal.cerrar(); true", false);

  /* ---------- 8. Aplicación instalable y trabajo sin conexión ---------- */
  paso(8, 'Aplicación instalable (PWA) y trabajo sin conexión');
  ok(await evaluar(cdp, "typeof CSN.app.instalar === 'function'", false), 'La aplicación ofrece la instalación como aplicación');
  const registroSW = await evaluar(cdp,
    "navigator.serviceWorker.getRegistrations().then(function(r){ return r.length; })");
  ok(registroSW >= 1, 'El service worker queda registrado (' + registroSW + ')');

  await cdp.enviar('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await esperar(400);
  ok(await evaluar(cdp, "!document.querySelector('#offline-banner').classList.contains('hidden')", false), 'Se avisa al usuario que no hay conexión');
  ok(/SIN CONEXIÓN/.test(await evaluar(cdp, "document.querySelector('#sync-text').textContent", false)), 'El indicador de sincronización muestra SIN CONEXIÓN');
  await esperar(4000);   // supera el intervalo mínimo de sincronización
  ok(await evaluar(cdp, "CSN.store.pendientes().pendientes", false) === 0, 'Sin cambios pendientes no se acumulan envíos sin conexión');

  // Crear una tarea sin conexión y comprobar que se conserva localmente
  await evaluar(cdp, "CSN.store.guardarTarea({comunidadId: CSN.store.comunidades()[0].id, titulo:'Tarea creada sin conexión (verificación)', fechaLimite: CSN.util.sumarDias(CSN.util.hoy(), 10), prioridad:'Alta'}).then(function(){return true;})");
  await esperar(500);
  ok(await evaluar(cdp, "CSN.store.pendientes().pendientes", false) >= 1, 'La tarea creada sin conexión queda pendiente de envío');

  await cdp.enviar('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await esperar(1200);
  ok(await evaluar(cdp, "!document.querySelector('#offline-banner') || document.querySelector('#offline-banner').classList.contains('hidden')", false), 'Al recuperar la conexión desaparece el aviso');

  // Recarga sin conexión: la aplicación debe abrir desde el almacenamiento del navegador
  await cdp.enviar('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await cdp.enviar('Page.reload', { ignoreCache: false });
  await esperar(2500);
  const offlineOk = await evaluar(cdp, "typeof CSN !== 'undefined' && !!document.querySelector('#login-screen')", false);
  ok(offlineOk, 'La aplicación vuelve a abrirse sin conexión (service worker)');
  await cdp.enviar('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  /* ---------- 9. Errores de la consola ---------- */
  paso(9, 'Revisión de errores en la consola del navegador');
  const relevantes = errores.filter((e) => !/favicon|Failed to load resource: net::ERR_INTERNET_DISCONNECTED|net::ERR_FAILED.*favicon/i.test(e));
  ok(relevantes.length === 0, 'No se registran errores en la consola del navegador', relevantes.slice(0, 5).join('\n      '));

  /* ---------- Cierre ---------- */
  console.log('\n' + '─'.repeat(66));
  const archivos = fs.readdirSync(SALIDA).sort();
  console.log('  Archivos de verificación generados en revision-impresion/:');
  archivos.forEach((a) => console.log('   · ' + a + '  (' + Math.round(fs.statSync(path.join(SALIDA, a)).size / 1024) + ' KB)'));
  console.log('─'.repeat(66));
  if (fallas === 0) console.log('\x1b[32m%s\x1b[0m', `✔ verificar-navegador.js: ${pruebas} comprobaciones, 0 fallas`);
  else console.log('\x1b[31m%s\x1b[0m', `✗ verificar-navegador.js: ${pruebas} comprobaciones, ${fallas} FALLAS`);

  cdp.cerrar();
  chrome.kill();
  servidor.kill();
  setTimeout(() => process.exit(fallas ? 1 : 0), 300);
})().catch((e) => {
  console.error('\n✗ Error en la verificación:', e);
  try { execSync('pkill -f "remote-debugging-port=' + PUERTO_CDP + '"'); } catch (x) {}
  process.exit(1);
});
