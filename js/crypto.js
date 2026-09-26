/* ==========================================================================
   crypto.js – Cifrado de los datos sincronizados (AES-256-GCM + PBKDF2)
   Se usa cuando la sincronización se realiza mediante un repositorio externo
   (por ejemplo un Gist). El contenido viaja siempre cifrado y la clave nunca
   se envía al servidor.
   API: CSN.crypto.cifrar(texto, clave) / descifrar(paquete, clave)
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var ITER = 150000;

  function webcrypto() {
    var c = global.crypto || global.msCrypto;
    if (c && c.subtle) return c;
    throw new Error('Este navegador no soporta WebCrypto (se requiere HTTPS o localhost)');
  }
  function b64(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return global.btoa ? global.btoa(s) : Buffer.from(bytes).toString('base64');
  }
  function deb64(str) {
    var s = global.atob ? global.atob(str) : Buffer.from(str, 'base64').toString('binary');
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function utf8(str) {
    if (global.TextEncoder) return new global.TextEncoder().encode(str);
    return new Uint8Array(Buffer.from(str, 'utf8'));
  }
  function deUtf8(buf) {
    if (global.TextDecoder) return new global.TextDecoder().decode(buf);
    return Buffer.from(buf).toString('utf8');
  }
  function aleatorio(n) {
    var a = new Uint8Array(n);
    webcrypto().getRandomValues(a);
    return a;
  }

  function derivar(clave, salt) {
    var c = webcrypto();
    return c.subtle.importKey('raw', utf8(clave), { name: 'PBKDF2' }, false, ['deriveKey'])
      .then(function (base) {
        return c.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: ITER, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  CSN.crypto = {
    iteraciones: ITER,
    disponible: function () { try { webcrypto(); return true; } catch (e) { return false; } },

    /** Devuelve un texto base64 con formato CSNSYNC1:base64(salt):base64(iv):base64(cifrado) */
    cifrar: function (texto, clave, saltB64) {
      var salt = saltB64 ? deb64(saltB64) : aleatorio(16);
      var iv = aleatorio(12);
      return derivar(clave, salt).then(function (key) {
        return webcrypto().subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, utf8(texto));
      }).then(function (ct) {
        return 'CSNSYNC1:' + b64(salt) + ':' + b64(iv) + ':' + b64(ct);
      });
    },

    descifrar: function (paquete, clave) {
      var p = String(paquete || '').split(':');
      if (p.length !== 4 || p[0] !== 'CSNSYNC1') return Promise.reject(new Error('Formato de datos cifrados no reconocido'));
      var salt = deb64(p[1]), iv = deb64(p[2]), ct = deb64(p[3]);
      return derivar(clave, salt).then(function (key) {
        return webcrypto().subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
      }).then(function (buf) { return deUtf8(buf); })
        .catch(function () { throw new Error('No fue posible descifrar: la clave de sincronización no coincide'); });
    },

    /**
     * Huella corta de la clave de sincronización.
     * Permite verificar que dos dispositivos usan la misma clave sin transmitirla.
     * Se aplica PBKDF2 (100.000 iteraciones) y se publican sólo 4 bytes.
     */
    huella: function (clave) {
      var c = webcrypto();
      return c.subtle.importKey('raw', utf8(clave), { name: 'PBKDF2' }, false, ['deriveBits'])
        .then(function (base) {
          return c.subtle.deriveBits({ name: 'PBKDF2', salt: utf8('csn-huella-v1'), iterations: 100000, hash: 'SHA-256' }, base, 256);
        })
        .then(function (bits) {
          return Array.prototype.slice.call(new Uint8Array(bits, 0, 4)).map(function (b) {
            return ('0' + b.toString(16)).slice(-2);
          }).join('');
        });
    },

    /** Resumen SHA-256 en hexadecimal (se usa para integrar la clave y evitar duplicar registros) */
    sha256: function (texto) {
      return webcrypto().subtle.digest('SHA-256', utf8(String(texto))).then(function (buf) {
        return Array.prototype.slice.call(new Uint8Array(buf)).map(function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
