#!/usr/bin/env node
/* ==========================================================================
   tests/todas.js – Ejecuta todas las suites de pruebas de la aplicación
   Uso:  node tests/todas.js        (o  npm test )
   ========================================================================== */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const SUITES = [
  'model.test.js', 'store.test.js', 'sync.test.js',
  'export.test.js', 'ui.test.js', 'pwa.test.js'
];

let fallas = 0, pruebas = 0;
const resumen = [];

SUITES.forEach((s) => {
  const ruta = path.join(__dirname, s);
  process.stdout.write('\n\x1b[1m▶ ' + s + '\x1b[0m\n');
  try {
    const salida = execFileSync(process.execPath, [ruta], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const m = /(\d+) pruebas, 0 fallas/.exec(salida);
    pruebas += m ? +m[1] : 0;
    resumen.push(['✔', s, m ? +m[1] : 0]);
    console.log(salida);
  } catch (e) {
    const salida = (e.stdout || '') + (e.stderr || '');
    const m = /(\d+) pruebas, (\d+) FALLAS/.exec(salida);
    pruebas += m ? +m[1] : 0;
    fallas += m ? +m[2] : 1;
    resumen.push(['✗', s, m ? +m[2] : 'error']);
    console.log(salida || e.message);
  }
});

console.log('\n' + '═'.repeat(64));
console.log('  RESUMEN DE PRUEBAS — GESTIÓN DE TAREAS (CSN)');
console.log('═'.repeat(64));
resumen.forEach(([signo, s, n]) => {
  console.log('  ' + signo + '  ' + s.padEnd(22) + (typeof n === 'number' ? (n + (signo === '✔' ? ' pruebas correctas' : ' fallas')) : n));
});
console.log('─'.repeat(64));
console.log('  ' + (fallas === 0 ? '\x1b[32m✔ TODAS LAS PRUEBAS PASARON\x1b[0m' : '\x1b[31m✗ HAY PRUEBAS FALLIDAS\x1b[0m') +
  '   ·   Total: ' + pruebas + ' pruebas   ·   Fallas: ' + fallas);
console.log('═'.repeat(64) + '\n');
process.exit(fallas ? 1 : 0);
