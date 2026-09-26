/* ==========================================================================
   zip.js – Escritor ZIP mínimo (sin dependencias)
   Se usa para generar archivos .xlsx reales. Usa compresión deflate cuando el
   navegador la soporta (CompressionStream) y si no, almacena sin comprimir.
   API: CSN.zip.crear([{ nombre, datos }]) -> Promise<Uint8Array>
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};

  var TABLA_CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(str) {
    if (global.TextEncoder) return new global.TextEncoder().encode(str);
    return new Uint8Array(Buffer.from(str, 'utf8'));
  }
  function deflateRaw(buf) {
    if (typeof global.CompressionStream !== 'function') return Promise.resolve(null);
    try {
      var cs = new global.CompressionStream('deflate-raw');
      var w = cs.writable.getWriter();
      w.write(buf); w.close();
      return new global.Response(cs.readable).arrayBuffer().then(function (ab) {
        return new Uint8Array(ab);
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  /** Fecha/hora en formato MS-DOS requerido por el ZIP */
  function dosFecha(d) {
    var hora = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
    var fecha = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { hora: hora, fecha: fecha };
  }

  function construir(archivos, comprimidos) {
    var partes = [], centrales = [], offset = 0;
    var now = dosFecha(new Date());

    archivos.forEach(function (a) {
      var nombre = utf8(a.nombre);
      var datos = a.datos;
      var comp = comprimidos[a.nombre];
      var metodo = comp ? 8 : 0;
      var payload = comp || datos;
      var crc = crc32(datos);

      var local = new Uint8Array(30 + nombre.length);
      var dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);      // firma
      dv.setUint16(4, 20, true);              // versión
      dv.setUint16(6, 0, true);               // banderas
      dv.setUint16(8, metodo, true);
      dv.setUint16(10, now.hora, true);
      dv.setUint16(12, now.fecha, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, payload.length, true);
      dv.setUint32(22, datos.length, true);
      dv.setUint16(26, nombre.length, true);
      dv.setUint16(28, 0, true);
      local.set(nombre, 30);
      partes.push(local, payload);

      var cen = new Uint8Array(46 + nombre.length);
      var dv2 = new DataView(cen.buffer);
      dv2.setUint32(0, 0x02014b50, true);
      dv2.setUint16(4, 20, true);
      dv2.setUint16(6, 20, true);
      dv2.setUint16(8, 0, true);
      dv2.setUint16(10, metodo, true);
      dv2.setUint16(12, now.hora, true);
      dv2.setUint16(14, now.fecha, true);
      dv2.setUint32(16, crc, true);
      dv2.setUint32(20, payload.length, true);
      dv2.setUint32(24, datos.length, true);
      dv2.setUint16(28, nombre.length, true);
      dv2.setUint16(30, 0, true);
      dv2.setUint16(32, 0, true);
      dv2.setUint16(34, 0, true);
      dv2.setUint16(36, 0, true);
      dv2.setUint32(38, 0, true);
      dv2.setUint32(42, offset, true);
      cen.set(nombre, 46);
      centrales.push(cen);

      offset += local.length + payload.length;
    });

    var tamCentral = centrales.reduce(function (a, c) { return a + c.length; }, 0);
    var fin = new Uint8Array(22);
    var dvf = new DataView(fin.buffer);
    dvf.setUint32(0, 0x06054b50, true);
    dvf.setUint16(8, archivos.length, true);
    dvf.setUint16(10, archivos.length, true);
    dvf.setUint32(12, tamCentral, true);
    dvf.setUint32(16, offset, true);
    dvf.setUint16(20, 0, true);

    var total = offset + tamCentral + 22;
    var out = new Uint8Array(total);
    var pos = 0;
    partes.concat(centrales).forEach(function (p) { out.set(p, pos); pos += p.length; });
    out.set(fin, pos);
    return out;
  }

  CSN.zip = {
    crc32: crc32,
    crear: function (archivos) {
      archivos = archivos || [];
      var nombres = {};
      archivos.forEach(function (a) {
        if (!(a.datos instanceof Uint8Array)) {
          a.datos = typeof a.datos === 'string' ? utf8(a.datos) : new Uint8Array(a.datos);
        }
      });
      return Promise.all(archivos.map(function (a) {
        return deflateRaw(a.datos).then(function (c) {
          // Sólo comprime si el resultado es realmente más pequeño
          if (c && c.length < a.datos.length - 8) nombres[a.nombre] = c;
          return null;
        });
      })).then(function () { return construir(archivos, nombres); });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
