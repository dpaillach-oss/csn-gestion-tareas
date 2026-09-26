/* ==========================================================================
   tests/harness.js – Entorno de pruebas (jsdom) y utilidades de aserción
   Carga index.html y todos los módulos de la aplicación en un navegador
   simulado para probar la lógica real sin necesidad de abrir un navegador.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

/* ---------- Contadores globales ---------- */
const estado = { pruebas: 0, fallas: 0, grupo: '' };

function grupo(nombre) {
  estado.grupo = nombre;
  console.log('\n\x1b[1m' + nombre + '\x1b[0m');
}
function ok(condicion, descripcion, extra) {
  estado.pruebas++;
  if (condicion) {
    console.log('  \x1b[32m✓\x1b[0m ' + descripcion);
  } else {
    estado.fallas++;
    console.log('  \x1b[31m✗ ' + descripcion + '\x1b[0m' + (extra !== undefined ? '\n      esperado: ' + JSON.stringify(extra) : ''));
  }
  return !!condicion;
}
function igual(a, b, descripcion) {
  const mismo = JSON.stringify(a) === JSON.stringify(b);
  if (!mismo) {
    estado.pruebas++; estado.fallas++;
    console.log('  \x1b[31m✗ ' + descripcion + '\x1b[0m\n      obtenido:  ' + JSON.stringify(a) + '\n      esperado: ' + JSON.stringify(b));
    return false;
  }
  return ok(true, descripcion);
}
function verdadero(v, d) { return ok(v === true, d, v); }
function falso(v, d) { return ok(v === false, d, v); }
function contiene(texto, sub, descripcion) {
  return ok(String(texto).indexOf(sub) >= 0, descripcion, 'no contiene «' + sub + '»');
}
function noContiene(texto, sub, descripcion) {
  return ok(String(texto).indexOf(sub) < 0, descripcion, 'contiene «' + sub + '» y no debería');
}
function lanza(fn, descripcion) {
  try { fn(); } catch (e) { return ok(true, descripcion); }
  return ok(false, descripcion, 'no lanzó error');
}
function resumen(nombreArchivo) {
  console.log('\n' + '─'.repeat(64));
  const codigo = estado.fallas === 0 ? 0 : 1;
  if (codigo === 0) console.log('\x1b[32m%s\x1b[0m', `✔ ${nombreArchivo}: ${estado.pruebas} pruebas, 0 fallas`);
  else console.log('\x1b[31m%s\x1b[0m', `✗ ${nombreArchivo}: ${estado.pruebas} pruebas, ${estado.fallas} FALLAS`);
  // La aplicación deja temporizadores activos (revisión de vencimientos y
  // sincronización automática); se cierra el proceso al terminar las pruebas.
  setTimeout(() => process.exit(codigo), 150);
  return estado.fallas;
}

/* ---------- Entorno jsdom ---------- */
function crearEntorno(opts) {
  opts = opts || {};
  const { JSDOM } = require('jsdom');
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;

  // APIs que jsdom no implementa y que la aplicación utiliza
  const nodeCrypto = require('crypto');
  Object.defineProperty(w, 'crypto', { value: nodeCrypto.webcrypto, configurable: true });
  w.Buffer = Buffer;                       // usado por los respaldos de zip/crypto
  w.fetch = opts.fetch || w.fetch;         // permite simular los servicios en la nube
  w.URL.createObjectURL = () => 'blob:prueba';
  w.URL.revokeObjectURL = () => {};
  w.HTMLCanvasElement.prototype.getContext = function () {
    return { drawImage() {}, fillRect() {}, clearRect() {} };
  };
  w.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/jpeg;base64,UFJFQkE='; };
  w.print = () => { w.__impreso = (w.__impreso || 0) + 1; };
  if (!w.navigator.storage) {
    Object.defineProperty(w.navigator, 'storage', { value: { estimate: () => Promise.resolve({ usage: 1024, quota: 1048576 }) }, configurable: true });
  }

  // Carga de los módulos declarados en index.html (misma secuencia que en producción)
  const fuente = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const scripts = [];
  const re = /<script src="([^"]+)"><\/script>/g;
  let m;
  while ((m = re.exec(fuente))) scripts.push(m[1]);

  scripts.forEach((rel) => {
    if (opts.sinApp && /app\.js$/.test(rel)) return;
    const codigo = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
    try {
      w.eval(codigo);
    } catch (e) {
      console.error('Error al cargar ' + rel + ': ' + e.message);
      throw e;
    }
  });

  w.__scripts = scripts;
  return { dom, w, CSN: w.CSN };
}

/** Espera a que se cumpla una condición (promesa o función) */
function esperar(condicion, ms, paso) {
  ms = ms || 4000; paso = paso || 25;
  const inicio = Date.now();
  return new Promise((res, rej) => {
    (function bucle() {
      let v;
      try { v = typeof condicion === 'function' ? condicion() : condicion; } catch (e) { v = false; }
      if (v) return res(v);
      if (Date.now() - inicio > ms) return rej(new Error('Tiempo de espera agotado'));
      setTimeout(bucle, paso);
    })();
  });
}

/** Inicia la aplicación y la deja lista con sesión de administrador */
function iniciarAplicacion(env, perfil) {
  const { w, CSN } = env;
  return CSN.store.iniciar()
    .then(() => CSN.store.login(perfil === 'supervisor' ? 'supervisor@csn.cl' : (perfil === 'usuario' ? 'usuario@csn.cl' : 'admin@csn.cl'),
      perfil === 'supervisor' ? 'supervisor2026' : (perfil === 'usuario' ? 'usuario2026' : 'csn2026')))
    .then(() => { if (CSN.app && CSN.app.mostrarApp) CSN.app.mostrarApp(); return env; });
}

/* ---------- Utilidades para pruebas ---------- */
/** Lee un ZIP generado por CSN.zip y devuelve { nombre: contenidoTexto } */
function leerZip(u8) {
  const zlib = require('zlib');
  const buf = Buffer.from(u8);
  const salida = {};
  let p = 0;
  while (p + 30 <= buf.length) {
    if (buf.readUInt32LE(p) !== 0x04034b50) break;
    const metodo = buf.readUInt16LE(p + 8);
    const tamComp = buf.readUInt32LE(p + 18);
    const nombreLen = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    const nombre = buf.slice(p + 30, p + 30 + nombreLen).toString('utf8');
    const datos = buf.slice(p + 30 + nombreLen + extraLen, p + 30 + nombreLen + extraLen + tamComp);
    salida[nombre] = metodo === 8 ? zlib.inflateRawSync(datos).toString('utf8') : datos.toString('utf8');
    p += 30 + nombreLen + extraLen + tamComp;
  }
  return salida;
}

/** Fragmento de HTML simulado (contenido) para adjuntar en pruebas */
function dataUrlFalsa(texto) {
  return 'data:text/plain;base64,' + Buffer.from(texto || 'documento de prueba').toString('base64');
}

module.exports = {
  RAIZ, grupo, ok, igual, verdadero, falso, contiene, noContiene, lanza, resumen,
  crearEntorno, iniciarAplicacion, esperar, leerZip, dataUrlFalsa, estado
};
