/* ==========================================================================
   sync/index.js – Interfaz del sincronizador
   Actualiza el indicador de estado (🟢 SINCRONIZADO / 🟡 SINCRONIZANDO /
   🔴 SIN CONEXIÓN), muestra el detalle y permite forzar la sincronización.
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util;

  var UI = CSN.syncUI = {};

  function pintar(datos) {
    var pill = U.$('#sync-pill');
    var txt = U.$('#sync-text');
    if (!pill || !txt) return;
    pill.className = 'sync-pill ' + datos.clase;
    var pend = datos.pendientes || 0;
    txt.textContent = datos.texto + (pend && datos.estado === 'sin-conexion' ? ' (' + pend + ')' : '');
    pill.title = datos.detalle + (pend ? ' — ' + pend + ' cambio(s) pendiente(s)' : '');
  }

  UI.detalle = function () {
    var s = CSN.sync;
    var c = CSN.store.config();
    var p = CSN.store.pendientes();
    var conflictos = CSN.store.conflictos(true);
    var modo = c.syncModo === 'gist' ? 'Repositorio cifrado (GitHub)'
      : (c.syncModo === 'supabase' ? 'Base de datos en la nube (Supabase)' : 'Sólo en este dispositivo');

    var html = '' +
      '<div class="alert-box ' + (s.estado === 'sincronizado' ? 'alert-ok' : s.estado === 'sincronizando' ? 'alert-info' : 'alert-warn') + ' mb">' +
      '<b>' + s.iconoEstado() + ' ' + U.escapeHtml(s.textoEstado()) + '</b><br>' + U.escapeHtml(s.detalle || '') + '</div>' +
      '<dl class="kv">' +
      '<dt>Modo</dt><dd>' + U.escapeHtml(modo) + '</dd>' +
      '<dt>Última sincronización</dt><dd>' + U.escapeHtml(c.ultimaSync || 'Sin sincronizaciones aún') + '</dd>' +
      '<dt>Cambios pendientes</dt><dd>' + p.pendientes + ' de ' + p.total + ' registros</dd>' +
      '<dt>Automática</dt><dd>' + (c.syncAuto ? 'Activada cada ' + (c.syncIntervalo || 20) + ' s' : 'Desactivada') + '</dd>' +
      '<dt>Almacenamiento local</dt><dd>' + CSN.db.modo.toUpperCase() + (CSN.db.modo !== 'idb' ? ' <span class="small muted">(se recomienda IndexedDB)</span>' : '') + '</dd>' +
      '</dl>' +
      (conflictos.length ? '<div class="alert-box alert-warn mt"><b>⚠ ' + conflictos.length + ' conflicto(s) sin revisar.</b><br>' +
        'Un registro fue modificado en dos dispositivos. Revise la pestaña <b>Conflictos</b> en Configuración para ver versiones, dispositivos, usuarios y horarios.</div>' : '') +
      '<p class="small muted mt">Los cambios realizados sin conexión se guardan en este dispositivo y se envían automáticamente al recuperar Internet. ' +
      'Ninguna modificación se sobrescribe sin quedar registrada.</p>';

    var footer = '<button class="btn" data-x="cerrar">Cerrar</button>' +
      '<button class="btn btn-primary" data-x="sync"' + (CSN.sync.configurado() ? '' : ' disabled') + '>Sincronizar ahora</button>';

    U.Modal.abrir({
      title: 'Estado de sincronización', icon: '🔄', body: html, footer: footer,
      onOpen: function (modal) {
        modal.querySelector('[data-x="cerrar"]').onclick = function () { U.Modal.cerrar(); };
        var b = modal.querySelector('[data-x="sync"]');
        b.onclick = function () {
          b.disabled = true; b.innerHTML = '<span class="spinner"></span> Sincronizando…';
          CSN.sync.sincronizar({ manual: true }).then(function () {
            U.Modal.cerrar();
            UI.detalle();
          });
        };
      }
    });
  };

  UI.iniciar = function () {
    CSN.store.on('sync', pintar);
    CSN.store.on('cambio', function () { CSN.sync.emitirEstado(); });
    var pill = U.$('#sync-pill');
    if (pill) pill.onclick = UI.detalle;
    CSN.store.on('sync:peso', function (bytes) {
      U.toast('Los datos superan ' + U.peso(bytes) + '. Para un uso intensivo de fotografías se recomienda la base de datos Supabase.', 'warn', 9000);
    });
    CSN.sync.emitirEstado();
  };
})(typeof window !== 'undefined' ? window : globalThis);
