#!/usr/bin/env node
/* ==========================================================================
   server.js – Servidor local para ejecutar y probar la aplicación
   Uso:   node server.js [puerto]
   Abre:  http://localhost:8080
   Para probar desde el teléfono (misma red WiFi) use la dirección indicada
   al iniciar el servidor. Nota: el service worker (PWA/offline) requiere
   localhost o HTTPS; las funciones de sincronización sí funcionan en red local.
   ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const RAIZ = __dirname;
const PUERTO = parseInt(process.argv[2], 10) || 8080;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.sql': 'text/plain; charset=utf-8'
};

const servidor = http.createServer((req, res) => {
  let ruta = decodeURIComponent(req.url.split('?')[0]);
  if (ruta === '/' || ruta === '') ruta = '/index.html';
  const archivo = path.join(RAIZ, path.normalize(ruta).replace(/^([/\\])+/, ''));
  if (!archivo.startsWith(RAIZ)) { res.writeHead(403); res.end('Acceso denegado'); return; }

  fs.readFile(archivo, (err, datos) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<h1>404</h1><p>Archivo no encontrado: ' + ruta + '</p>'); return; }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/'
    });
    res.end(datos);
  });
});

servidor.listen(PUERTO, '0.0.0.0', () => {
  const ips = [];
  Object.keys(os.networkInterfaces()).forEach((n) => {
    (os.networkInterfaces()[n] || []).forEach((d) => {
      if (d.family === 'IPv4' && !d.internal) ips.push(d.address);
    });
  });
  console.log('\n  GESTIÓN DE TAREAS – CSN Gestión de Activos Inmobiliarios SPA');
  console.log('  -------------------------------------------------------------');
  console.log('  En este computador :  http://localhost:' + PUERTO);
  ips.forEach((ip) => console.log('  Desde el teléfono  :  http://' + ip + ':' + PUERTO));
  console.log('  -------------------------------------------------------------');
  if (!ips.length) console.log('  (No se detectó red local; conéctese a una red WiFi para probar desde el teléfono.)');
  console.log('  Presione Ctrl+C para detener el servidor.\n');
});
