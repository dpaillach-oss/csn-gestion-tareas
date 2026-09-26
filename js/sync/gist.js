/* ==========================================================================
   sync/gist.js – Sincronización mediante repositorio cifrado en la nube
   Los datos viajan SIEMPRE cifrados (AES-256-GCM). La clave de sincronización
   la definen los usuarios y nunca se envía al servidor.
   Se usa la API pública de Gists (GitHub) como base de datos centralizada.
   API: CSN.syncGist.descargar() / subir(paquete) / probar() / crear()
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util, Sync = CSN.sync;

  var API = 'https://api.github.com';
  var ARCHIVO_META = 'csn-meta.json';
  var PREFIJO_PARTE = 'csn-parte-';
  var LARGO_PARTE = 350000;          // caracteres por archivo (≈350 KB)
  var AVISO_PESO = 8 * 1024 * 1024;  // sobre este tamaño se sugiere Supabase

  function conf() { return CSN.store.config(); }

  function cabeceras() {
    var c = conf();
    if (!c.gistToken) throw new Error('Falta el token de acceso de GitHub.');
    return {
      'Authorization': 'Bearer ' + String(c.gistToken).trim(),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
  }

  function pedir(metodo, url, cuerpo) {
    var opts = { method: metodo, headers: cabeceras(), cache: 'no-store' };
    if (cuerpo) opts.body = JSON.stringify(cuerpo);
    return fetch(url, opts).then(function (r) {
      if (r.status === 401) throw new Error('Token de GitHub inválido o vencido (401). Genere uno nuevo con permiso "gist".');
      if (r.status === 403) throw new Error('Acceso denegado o límite de solicitudes alcanzado (403). Intente más tarde.');
      if (r.status === 404) throw new Error('No se encontró el repositorio de datos indicado (404). Verifique el identificador.');
      if (r.status === 422) throw new Error('El servidor rechazó la operación (422). Verifique el identificador del repositorio.');
      if (!r.ok) throw new Error('Error del servidor (' + r.status + ')');
      return r.json();
    });
  }

  function crearRepositorio() {
    var cuerpo = {
      description: 'CSN Gestión de Tareas — base de datos cifrada (sincronización entre dispositivos)',
      public: false,
      files: {}
    };
    cuerpo.files[ARCHIVO_META] = { content: JSON.stringify({ formato: 'csn-gestion-tareas', estado: 'nuevo', creado: U.marca() }, null, 2) };
    return fetch(API + '/gists', { method: 'POST', headers: cabeceras(), body: JSON.stringify(cuerpo) })
      .then(function (r) {
        if (r.status === 401) throw new Error('Token de GitHub inválido (401). Genere uno nuevo con permiso "gist".');
        if (!r.ok) throw new Error('No fue posible crear la base de datos en la nube (' + r.status + ')');
        return r.json();
      });
  }

  var Gist = CSN.syncGist = {
    nombre: 'Repositorio cifrado de Gists (GitHub)',
    id: 'gist',
    // Guarda una copia única cifrada de todos los datos: cada envío debe
    // contener el conjunto completo para que un dispositivo que se vincula
    // más tarde reciba también los cambios anteriores.
    snapshot: true,

    /** Crea una base de datos nueva y guarda su identificador en la configuración */
    crear: function () {
      return crearRepositorio().then(function (g) {
        return CSN.store.guardarConfig({ gistId: g.id }).then(function () {
          return { id: g.id, url: g.html_url };
        });
      });
    },

    /** Verifica token y repositorio */
    probar: function () {
      var c = conf();
      return fetch(API + '/user', { headers: cabeceras() })
        .then(function (r) {
          if (r.status === 401) throw new Error('Token de GitHub inválido o vencido (401).');
          if (!r.ok) throw new Error('No fue posible validar el token (' + r.status + ')');
          return r.json();
        })
        .then(function (usuario) {
          if (!c.gistId) {
            return { usuario: usuario.login, repositorio: '(se creará uno nuevo al guardar)', nuevo: true };
          }
          return pedir('GET', API + '/gists/' + c.gistId).then(function (g) {
            return { usuario: usuario.login, repositorio: g.id, archivos: Object.keys(g.files || {}).length, actualizado: g.updated_at };
          });
        });
    },

    /** Descarga el paquete remoto (devuelve null si aún no hay datos) */
    descargar: function () {
      var c = conf();
      if (!c.gistId) return Promise.resolve(null);
      return pedir('GET', API + '/gists/' + c.gistId).then(function (g) {
        var archivos = g.files || {};
        var meta = null;
        if (archivos[ARCHIVO_META] && archivos[ARCHIVO_META].content && !archivos[ARCHIVO_META].truncated) {
          try { meta = JSON.parse(archivos[ARCHIVO_META].content); } catch (e) { meta = null; }
        }
        if (!meta || meta.estado === 'nuevo') return null;

        // Verificación de clave: se comprueba la huella antes de descargar los datos.
        var verificacion = (meta.huella && c.syncClave)
          ? CSN.crypto.huella(c.syncClave).then(function (h) {
            if (h !== meta.huella) {
              throw new Error('La clave de sincronización de este dispositivo no coincide con la usada en la nube. ' +
                'Verifique la clave en Configuración → Sincronización.');
            }
            return true;
          })
          : Promise.resolve(true);

        var partes = [];
        for (var i = 1; i <= (meta.partes || 0); i++) {
          var nombre = PREFIJO_PARTE + i + '.enc';
          if (!archivos[nombre]) throw new Error('La base de datos en la nube está incompleta (falta la parte ' + i + ').');
          partes.push(archivos[nombre]);
        }
        return verificacion.then(function () {
          return Promise.all(partes.map(function (a) {
            if (a.content && !a.truncated) return Promise.resolve(a.content);
            return fetch(a.raw_url, { headers: cabeceras(), cache: 'no-store' }).then(function (r) {
              if (!r.ok) throw new Error('No fue posible descargar un bloque de datos (' + r.status + ')');
              return r.text();
            });
          }));
        }).then(function (trozos) {
          return CSN.crypto.descifrar(trozos.join(''), c.syncClave);
        }).then(function (texto) {
          return JSON.parse(texto);
        });
      });
    },

    /** Sube el paquete (sólo los registros modificados) */
    subir: function (paquete) {
      var c = conf();
      var texto = JSON.stringify(paquete);
      if (texto.length > AVISO_PESO) {
        CSN.store.emitir('sync:peso', texto.length);
      }
      return CSN.crypto.huella(c.syncClave).then(function (huella) {
        return CSN.crypto.cifrar(texto, c.syncClave).then(function (cifrado) {
          var partes = [];
          for (var i = 0; i < cifrado.length; i += LARGO_PARTE) partes.push(cifrado.substr(i, LARGO_PARTE));
          if (!partes.length) partes = [''];
          var meta = {
            formato: 'csn-gestion-tareas', estado: 'activo', version: 1,
            huella: huella, partes: partes.length, actualizado: U.marca(),
            dispositivo: U.deviceId(), bytes: cifrado.length
          };

          var asegurar = c.gistId
            ? Promise.resolve(c.gistId)
            : crearRepositorio().then(function (g) { return CSN.store.guardarConfig({ gistId: g.id }).then(function () { return g.id; }); });

          return asegurar.then(function (id) {
            return pedir('GET', API + '/gists/' + id).then(function (g) {
              var files = {};
              // Elimina bloques sobrantes de envíos anteriores
              Object.keys(g.files || {}).forEach(function (n) {
                if (n.indexOf(PREFIJO_PARTE) === 0) {
                  var num = +n.replace(PREFIJO_PARTE, '').replace('.enc', '');
                  if (num > partes.length) files[n] = null;
                }
              });
              partes.forEach(function (p, i) { files[PREFIJO_PARTE + (i + 1) + '.enc'] = { content: p }; });
              files[ARCHIVO_META] = { content: JSON.stringify(meta, null, 2) };
              return pedir('PATCH', API + '/gists/' + id, { files: files, description: 'CSN Gestión de Tareas — base de datos cifrada (' + U.marca() + ')' });
            }).then(function (g) {
              return { ok: true, id: g.id, partes: partes.length, actualizado: g.updated_at };
            });
          });
        });
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
