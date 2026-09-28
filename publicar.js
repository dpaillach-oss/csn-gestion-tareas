#!/usr/bin/env node
/* ==========================================================================
   publicar.js – Publica la aplicación en Internet (GitHub Pages)
   Deja la aplicación disponible por HTTPS, que es lo que permite instalarla
   en el celular, usar la cámara y trabajar sin conexión.

   REQUISITO: tener la sesión de GitHub iniciada en este equipo:
       gh auth login          (y aceptar los permisos de repositorio)

   USO:
       node publicar.js                      publica en el repositorio csn-gestion-tareas
       node publicar.js mi-repositorio       usa otro nombre de repositorio
       node publicar.js --simular            verifica todo sin publicar
       node publicar.js --privado            crea el repositorio como privado (Pages seguirá siendo público)
   ========================================================================== */
'use strict';
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const args = process.argv.slice(2);
const SIMULAR = args.indexOf('--simular') >= 0;
const PRIVADO = args.indexOf('--privado') >= 0;
const NOMBRE = args.filter((a) => !a.startsWith('--'))[0] || 'csn-gestion-tareas';

let codigoSalida = 0;
const paso = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');
function ok(cond, desc, extra) {
  if (cond) console.log('  \x1b[32m✓\x1b[0m ' + desc);
  else { codigoSalida = 1; console.log('  \x1b[31m✗ ' + desc + '\x1b[0m' + (extra ? '\n      ' + extra : '')); }
  return cond;
}
function sh(cmd, opts) {
  const salida = execSync(cmd, Object.assign({ cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, opts || {}));
  // Con la salida silenciada (stdio: 'ignore') el resultado es nulo: se normaliza
  // para no romper el flujo al encadenar comprobaciones.
  return (salida === null || salida === undefined) ? '' : String(salida).trim();
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async function main() {
  console.log('\n\x1b[1mPUBLICACIÓN DE «GESTIÓN DE TAREAS – CSN»\x1b[0m');
  console.log('  Repositorio destino: ' + NOMBRE + (PRIVADO ? ' (privado)' : ' (público)') + (SIMULAR ? ' · SIMULACIÓN' : ''));

  /* ---------- 1. Comprobaciones previas ---------- */
  paso('1. Comprobaciones previas');
  ok(fs.existsSync(path.join(RAIZ, 'index.html')), 'El proyecto está en esta carpeta');
  ok(fs.existsSync(path.join(RAIZ, 'manifest.json')) && fs.existsSync(path.join(RAIZ, 'sw.js')),
    'Incluye el manifiesto y el service worker (aplicación instalable)');
  let version = '';
  try { version = sh('gh --version').split('\n')[0]; ok(true, 'GitHub CLI disponible: ' + version); }
  catch (e) { ok(false, 'GitHub CLI no está instalado', 'Instálelo con: brew install gh'); }

  let autenticado = false, usuario = '';
  try {
    const estado = execFileSync('gh', ['auth', 'status'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    autenticado = /Logged in to/i.test(estado);
  } catch (e) {
    autenticado = /Logged in to/i.test((e.stdout || '') + (e.stderr || ''));
  }
  if (autenticado) { try { usuario = sh('gh api user --jq .login'); } catch (e) { usuario = ''; } }
  if (!ok(autenticado && !SIMULAR, 'Sesión de GitHub iniciada' + (usuario ? ' como ' + usuario : ''))) {
    if (!SIMULAR) {
      console.log('\n  \x1b[33mPara continuar, ejecute en esta carpeta:\x1b[0m');
      console.log('      gh auth login            (elija GitHub.com → HTTPS → login con el navegador)');
      console.log('      node publicar.js         (vuelva a ejecutar este script)\n');
      process.exit(1);
    }
    console.log('  \x1b[33m(simulación: se continúa sin sesión de GitHub para revisar el resto)\x1b[0m');
    usuario = usuario || 'usuario-de-ejemplo';
  }
  ok(!!usuario, 'Usuario de GitHub identificado: ' + usuario);

  /* ---------- 2. Preparación de los archivos ---------- */
  paso('2. Preparación de los archivos a publicar');
  const ignorar = ['node_modules', '.npm-cache', '.git', 'revision-impresion', '.chrome-perfil'];
  const archivos = [];
  (function recorrer(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      if (ignorar.indexOf(e.name) >= 0) return;
      const completo = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(completo);
      else if (e.name !== '.DS_Store' && e.name !== 'package-lock.json') archivos.push(path.relative(RAIZ, completo));
    });
  })(RAIZ);
  const peso = archivos.reduce((a, f) => a + fs.statSync(path.join(RAIZ, f)).size, 0);
  ok(archivos.length > 40, 'Se publicarán ' + archivos.length + ' archivos (' + Math.round(peso / 1024) + ' KB en total)');
  ok(archivos.indexOf('index.html') >= 0 && archivos.indexOf('js/app.js') >= 0, 'Se incluyen la aplicación y sus módulos');
  ok(archivos.filter((f) => /node_modules/.test(f)).length === 0, 'No se publican las dependencias de desarrollo');
  ok(archivos.indexOf('manifest.json') >= 0 && archivos.indexOf('sw.js') >= 0, 'Se incluyen los archivos necesarios para instalar en el teléfono');
  const privados = archivos.filter((f) => /(^|\/)(\.env|token|credenciales)/i.test(f));
  ok(privados.length === 0, 'No se publica ningún archivo de credenciales');
  const conClaves = archivos.filter((f) => /\.(js|html|json)$/.test(f)).filter((f) => {
    const t = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    return /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJhbGciOi[A-Za-z0-9_-]{20,})/.test(t);
  });
  ok(conClaves.length === 0, 'Ningún archivo contiene tokens ni claves escritas', conClaves.join(', '));

  /* ---------- 3. Repositorio y envío ---------- */
  paso('3. Repositorio y envío de los archivos');
  if (!fs.existsSync(path.join(RAIZ, '.git'))) {
    sh('git init -q -b main');
    ok(true, 'Se inicializa el repositorio local');
  } else ok(true, 'El repositorio local ya existe');
  try { sh('git config user.name', { stdio: 'ignore' }); } catch (e) { sh('git config user.name "' + usuario + '"'); }
  // Entornos restringidos: la sesión de GitHub puede vivir en una carpeta de
  // configuración propia (GH_CONFIG_DIR) y no estar registrada en Git. Se deja
  // el repositorio configurado para usar las credenciales de `gh` al enviar.
  try { sh('git config --local --get credential.helper', { stdio: 'ignore' }); }
  catch (e) { try { sh('git config --local credential.helper "!gh auth git-credential"'); ok(true, 'Se configura el envío con las credenciales de GitHub CLI'); } catch (e2) {} }
  try { sh('git config user.email', { stdio: 'ignore' }); } catch (e) { sh('git config user.email "' + usuario + '@users.noreply.github.com"'); }
  sh('git add -A');
  try {
    sh('git commit -q -m "Publicación de GESTIÓN DE TAREAS – CSN Gestión de Activos Inmobiliarios SPA"');
    ok(true, 'Se registran los cambios');
  } catch (e) { ok(true, 'No había cambios nuevos por registrar'); }

  if (SIMULAR) {
    paso('4. Simulación');
    console.log('  (simulación: no se crea el repositorio ni se habilita Pages)');
    console.log('\n  URL que quedaría: \x1b[36mhttps://' + usuario.toLowerCase() + '.github.io/' + NOMBRE + '/\x1b[0m\n');
    process.exit(codigoSalida);
  }

  let existe = false;
  try { sh('gh repo view ' + NOMBRE + ' --json name'); existe = true; } catch (e) { existe = false; }
  if (existe) {
    try { sh('git remote remove origin', { stdio: 'ignore' }); } catch (e) {}
    sh('git remote add origin https://github.com/' + usuario + '/' + NOMBRE + '.git');
    sh('git push -u origin main 2>&1');
    ok(true, 'Se actualiza el repositorio existente ' + NOMBRE);
  } else {
    sh('gh repo create ' + NOMBRE + ' ' + (PRIVADO ? '--private' : '--public') +
      ' --source=. --remote=origin --push --description "Gestión de tareas para administración de edificios y comunidades (PWA con sincronización entre dispositivos)"');
    ok(true, 'Se crea el repositorio ' + NOMBRE + ' y se envían los archivos');
  }

  /* ---------- 4. Publicación (GitHub Pages) ---------- */
  paso('4. Publicación en Internet (GitHub Pages, HTTPS)');
  try {
    sh('gh api -X POST repos/' + usuario + '/' + NOMBRE + '/pages -f "source[branch]=main" -f "source[path]=/"');
    ok(true, 'Se habilita GitHub Pages');
  } catch (e) {
    const salida = ((e.stdout || '') + (e.stderr || ''));
    if (/already exists|409/i.test(salida)) ok(true, 'GitHub Pages ya estaba habilitado');
    else ok(false, 'No fue posible habilitar GitHub Pages', salida.slice(0, 300));
  }

  const url = 'https://' + usuario.toLowerCase() + '.github.io/' + NOMBRE + '/';
  console.log('\n  \x1b[1mDirección de la aplicación:\x1b[0m \x1b[36m' + url + '\x1b[0m');
  console.log('  (GitHub tarda entre 30 segundos y 2 minutos en publicarla por primera vez)');

  process.stdout.write('  Esperando a que responda');
  let lista = false;
  for (let i = 0; i < 40 && !lista; i++) {
    await esperar(6000);
    process.stdout.write('.');
    try {
      const r = await fetch(url, { method: 'GET' });
      if (r.ok) lista = true;
    } catch (e) { /* aún no responde */ }
  }
  console.log('');
  if (!lista) console.log('  \x1b[33mTodavía no responde; espere un momento y abra la dirección en el navegador.\x1b[0m');

  /* ---------- 5. Comprobaciones finales ---------- */
  paso('5. Comprobaciones en la dirección publicada');
  if (lista) {
    try {
      const html = await (await fetch(url)).text();
      ok(/GESTIÓN DE TAREAS/.test(html), 'La página publicada contiene la aplicación');
      const man = await fetch(url + 'manifest.json');
      ok(man.ok, 'El manifiesto de la aplicación está disponible (permitirá instalarla)');
      const sw = await fetch(url + 'sw.js');
      ok(sw.ok, 'El service worker está disponible (permitirá usarla sin conexión)');
      const app = await fetch(url + 'js/app.js');
      ok(app.ok, 'Los módulos de la aplicación se publicaron correctamente');
      const logo = await fetch(url + 'assets/logo.png');
      ok(logo.ok, 'El logotipo de la empresa está disponible');
      ok(url.indexOf('https://') === 0, 'La dirección usa HTTPS (necesario para la cámara y la instalación)');
    } catch (e) { ok(false, 'No fue posible verificar todos los archivos publicados', e.message); }
  }

  paso('Cómo instalarla en el celular');
  console.log('  1. Abra en el teléfono:  \x1b[36m' + url + '\x1b[0m');
  console.log('  2. iPhone/iPad: abra con Safari → Compartir → «Añadir a pantalla de inicio».');
  console.log('     Android: menú ⋮ de Chrome → «Instalar aplicación».');
  console.log('  3. Ingrese con admin@csn.cl / csn2026 y cambie la contraseña en «Usuarios».');
  console.log('  4. Para sincronizar los movimientos entre computador y celular:');
  console.log('     en el \x1b[1mcomputador\x1b[0m → Configuración → Sincronización → «📱 Generar código para el celular»;');
  console.log('     en el \x1b[1mcelular\x1b[0m → Configuración → Sincronización → «🔗 Pegar código de vinculación».');
  console.log('     Desde ahí, cada tarea, avance, fotografía y cambio de estado se replica en ambos equipos.\n');

  process.exit(codigoSalida);
})().catch((e) => {
  console.error('\n\x1b[31m✗ Error durante la publicación:\x1b[0m ' + e.message);
  if (e.stdout) console.error(String(e.stdout).slice(-500));
  if (e.stderr) console.error(String(e.stderr).slice(-500));
  process.exit(1);
});
