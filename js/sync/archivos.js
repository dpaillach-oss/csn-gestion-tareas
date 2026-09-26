/* ==========================================================================
   sync/archivos.js – Manejo de fotografías y documentos
   · Cámara del teléfono (captura directa) y selección desde galería
   · Compresión automática de imágenes antes de enviarlas a la nube
   · Documentos PDF / Word / Excel / otros
   Los archivos quedan asociados a la tarea (y al avance, cuando corresponde)
   y se sincronizan junto con los registros.
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util;

  var PESO_MAX_DOC = 12 * 1024 * 1024;   // 12 MB por documento
  var TIPOS_DOC = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.odt,.ods,.jpg,.jpeg,.png,.webp,.zip,.rar';

  function url(a) { return a.remoto || a.contenido || ''; }

  /** Crea un selector de archivos efímero */
  function pedirArchivos(opts) {
    return new Promise(function (res) {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = opts.accept || '*/*';
      inp.multiple = !!opts.multiple;
      if (opts.capture) { inp.setAttribute('capture', opts.capture); inp.capture = opts.capture; }
      inp.style.position = 'fixed'; inp.style.left = '-9999px';
      document.body.appendChild(inp);
      inp.addEventListener('change', function () {
        var files = Array.prototype.slice.call(inp.files || []);
        setTimeout(function () { inp.remove(); }, 500);
        res(files);
      });
      // Si el usuario cancela no hay evento "change": se limpia al volver el foco
      global.addEventListener('focus', function () {
        setTimeout(function () {
          if (document.body.contains(inp)) { inp.remove(); res([]); }
        }, 1200);
      }, { once: true });
      inp.click();
    });
  }

  var Archivos = CSN.archivos = {
    PESO_MAX_DOC: PESO_MAX_DOC,
    TIPOS_DOC: TIPOS_DOC,
    url: url,

    /** Botón 📷 TOMAR FOTOGRAFÍA (abre la cámara del teléfono si está disponible) */
    tomarFotografia: function (tareaId, rol, avanceId) {
      return pedirArchivos({ accept: 'image/*', capture: 'environment', multiple: false })
        .then(function (files) { return Archivos.procesar(tareaId, files, rol || 'fotografia', avanceId); });
    },

    /** Botón 🖼️ SELECCIONAR FOTOGRAFÍA (galería / explorador, varias a la vez) */
    seleccionarFotografias: function (tareaId, rol, avanceId) {
      return pedirArchivos({ accept: 'image/*', multiple: true })
        .then(function (files) { return Archivos.procesar(tareaId, files, rol || 'fotografia', avanceId); });
    },

    /** Botón 📎 ADJUNTAR ARCHIVO (documentos de cualquier tipo permitido) */
    adjuntarDocumento: function (tareaId, rol, avanceId) {
      return pedirArchivos({ accept: TIPOS_DOC, multiple: true })
        .then(function (files) { return Archivos.procesar(tareaId, files, rol || 'adjunto', avanceId); });
    },

    /**
     * Recolecta archivos SIN guardarlos aún (se usan para adjuntarlos después
     * de guardar un avance o el cierre de una tarea).
     * tipo: 'imagen' (cámara) | 'galeria' | 'documento'
     */
    recolectar: function (tipo, multiple) {
      var opciones = tipo === 'imagen'
        ? { accept: 'image/*', capture: 'environment', multiple: multiple !== false }
        : (tipo === 'galeria' ? { accept: 'image/*', multiple: true } : { accept: TIPOS_DOC, multiple: multiple !== false });
      return pedirArchivos(opciones).then(function (files) {
        return (files || []).reduce(function (p, f) {
          return p.then(function (acc) {
            var esImagen = /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name);
            if (!esImagen && f.size > PESO_MAX_DOC) {
              U.toast('El archivo «' + f.name + '» supera los 12 MB permitidos', 'err');
              return acc;
            }
            if (esImagen) {
              return U.comprimirImagen(f, 1600, 0.8).then(function (img) {
                return acc.concat([{ nombre: f.name || ('foto-' + U.marca() + '.jpg'), tipo: 'image/jpeg', peso: img.peso, contenido: img.dataUrl }]);
              });
            }
            return U.leerComoDataURL(f).then(function (dataUrl) {
              return acc.concat([{ nombre: f.name, tipo: f.type || 'application/octet-stream', peso: f.size, contenido: dataUrl }]);
            });
          });
        }, Promise.resolve([]));
      });
    },

    /** Procesa y guarda una lista de archivos del navegador */
    procesar: function (tareaId, files, rol, avanceId) {
      if (!files || !files.length) return Promise.resolve([]);
      var guardados = [];
      return files.reduce(function (p, f) {
        return p.then(function () {
          var esImagen = /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name);
          if (!esImagen && f.size > PESO_MAX_DOC) {
            U.toast('El archivo «' + f.name + '» supera los 12 MB permitidos', 'err');
            return null;
          }
          if (esImagen) {
            return U.comprimirImagen(f, 1600, 0.8).then(function (img) {
              return CSN.store.agregarArchivo({
                tareaId: tareaId, avanceId: avanceId || '', nombre: f.name || ('foto-' + U.marca() + '.jpg'),
                tipo: 'image/jpeg', peso: img.peso, contenido: img.dataUrl, rol: rol || 'fotografia',
                ancho: img.ancho, alto: img.alto
              });
            }).then(function (r) { if (r) guardados.push(r); });
          }
          return U.leerComoDataURL(f).then(function (dataUrl) {
            return CSN.store.agregarArchivo({
              tareaId: tareaId, avanceId: avanceId || '', nombre: f.name, tipo: f.type || 'application/octet-stream',
              peso: f.size, contenido: dataUrl, rol: rol || 'adjunto'
            });
          }).then(function (r) { if (r) guardados.push(r); });
        });
      }, Promise.resolve()).then(function () {
        if (guardados.length) {
          U.toast(guardados.length + (guardados.length === 1 ? ' archivo guardado' : ' archivos guardados'), 'ok');
          CSN.sync.avisarCambioLocal();
        }
        return guardados;
      });
    },

    /** Visor de fotografías a tamaño completo */
    ver: function (lista, indice) {
      var items = (lista || []).filter(function (a) { return url(a); })
        .map(function (a) { return { url: url(a), nombre: a.nombre, fecha: a.fecha }; });
      if (!items.length) return;
      U.Lightbox.abrir(items, indice || 0);
    },

    /** Descarga un archivo ya guardado */
    descargar: function (a) {
      var u = url(a);
      if (!u) { U.toast('El archivo no está disponible en este dispositivo', 'warn'); return; }
      if (/^data:/.test(u)) {
        var bin = atob(u.split(',')[1]);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        U.descargar(new Blob([arr], { type: a.tipo || 'application/octet-stream' }), a.nombre);
      } else {
        var link = document.createElement('a');
        link.href = u; link.download = a.nombre || 'archivo'; link.target = '_blank';
        document.body.appendChild(link); link.click(); setTimeout(function () { link.remove(); }, 800);
      }
    },

    /** Miniatura HTML de un archivo */
    miniatura: function (a, indice) {
      if (/^image\//.test(a.tipo || '')) {
        return '<div class="thumb" data-foto="' + indice + '"><img src="' + U.attr(url(a)) + '" alt="' + U.attr(a.nombre) + '" loading="lazy">' +
          (a.rol === 'cierre' ? '<span class="tag">Cierre</span>' : (a.rol === 'avance' ? '<span class="tag">Avance</span>' : '')) +
          '</div>';
      }
      return '';
    },

    /** Tarjeta de documento HTML */
    documentoHtml: function (a) {
      return '<div class="file-item"><span class="fi-ico">' + U.iconoArchivo(a.tipo, a.nombre) + '</span>' +
        '<span class="grow"><span class="fi-name">' + U.escapeHtml(a.nombre) + '</span>' +
        '<span class="small muted">' + U.peso(a.peso || 0) + ' · ' + U.fmtFecha(a.fecha) + ' · ' + U.escapeHtml(a.usuario || '') + '</span></span>' +
        '<span class="fi-actions">' +
        '<button class="btn btn-sm" data-bajar="' + a.id + '" title="Descargar">⬇</button>' +
        (CSN.store.puede('archivo.eliminar') ? '<button class="btn btn-sm btn-danger" data-borrar-archivo="' + a.id + '" title="Eliminar">🗑</button>' : '') +
        '</span></div>';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
