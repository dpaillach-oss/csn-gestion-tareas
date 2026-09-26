/* ==========================================================================
   views/buscar.js – Buscador global
   Busca en todas las comunidades por nombre de comunidad, tarea, descripción,
   responsable, estado, prioridad, comentarios, avances y archivos.
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util, M = CSN.model, UI = CSN.ui;
  var V = CSN.views = CSN.views || {};

  var estado = { texto: '', comunidadId: 'todas' };
  var historialBusqueda = [];

  var Vb = V.buscar = {
    render: function (cont, params) {
      params = params || {};
      if (params.texto !== undefined) estado.texto = params.texto;
      if (params.comunidadId) estado.comunidadId = params.comunidadId;

      var res = estado.texto ? CSN.store.buscar(estado.texto, { comunidadId: estado.comunidadId }) : [];
      var grupos = U.groupBy(res, function (r) { return r.comunidad ? r.comunidad.nombre : '(sin comunidad)'; });

      cont.innerHTML = '' +
        UI.encabezado('BUSCAR', 'Búsqueda general en todas las comunidades. Escriba una palabra y presione Enter.') +
        '<div class="card mb" style="border-left:4px solid var(--c-primary)">' +
        '<div class="flex gap items-center flex-wrap">' +
        '<div class="grow"><input type="search" id="q" value="' + U.attr(estado.texto) + '" placeholder="Ej: ASCENSOR, filtración, portón, Juan Pérez, urgente, vencida…" style="font-size:1.05rem;padding:.65rem .75rem"></div>' +
        '<div style="min-width:200px">' + UI.selectComunidades(estado.comunidadId, true) + '</div>' +
        '<button class="btn btn-primary btn-lg" id="btn-q">BUSCAR</button>' +
        '</div>' +
        '<div class="chip-row mt">' +
        ['ASCENSOR', 'FILTRACIÓN', 'PISCINA', 'URGENTE', 'VENCIDA', 'EN PROCESO'].map(function (t) {
          return '<button class="chip" data-ejemplo="' + U.attr(t) + '">' + U.escapeHtml(t) + '</button>';
        }).join('') +
        '</div>' +
        (historialBusqueda.length ? '<div class="small muted mt">Búsquedas recientes: ' +
          historialBusqueda.slice(0, 6).map(function (h) { return '<a href="#" data-ejemplo="' + U.attr(h) + '">' + U.escapeHtml(h) + '</a>'; }).join(' · ') + '</div>' : '') +
        '</div>' +
        '<div id="resultados">' + (estado.texto ? pintarResultados(res, grupos) : pintarAyuda()) + '</div>';

      var input = U.$('#q', cont);
      function ejecutar(valor) {
        var t = (valor !== undefined ? valor : input.value).trim();
        estado.texto = t;
        if (t && historialBusqueda.indexOf(t) < 0) historialBusqueda.unshift(t);
        Vb.render(cont, {});
        var el = U.$('#q', cont);
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }
      U.$('#btn-q', cont).onclick = function () { ejecutar(); };
      input.onkeydown = function (e) { if (e.key === 'Enter') ejecutar(); };
      U.$('[data-campo="comunidadId"]', cont).onchange = function (e) { estado.comunidadId = e.target.value; Vb.render(cont, {}); };
      U.$$('[data-ejemplo]', cont).forEach(function (b) {
        b.onclick = function (e) { e.preventDefault(); ejecutar(b.getAttribute('data-ejemplo')); };
      });
      if (params.foco) setTimeout(function () { try { input.focus(); } catch (e) {} }, 150);
    }
  };

  function pintarAyuda() {
    return '<div class="card"><div class="card-h"><h2>¿Qué puede buscar?</h2></div>' +
      '<div class="grid grid-2">' +
      '<ul class="list-plain">' +
      '<li>🏢 Nombre de la comunidad (ATALAYA, LA ESPUELA, VISTA VERDE II)</li>' +
      '<li>📋 Nombre de la tarea</li>' +
      '<li>📝 Descripción de la tarea</li>' +
      '<li>👤 Responsable</li>' +
      '</ul><ul class="list-plain">' +
      '<li>🔄 Estado (Pendiente, En proceso, Vencida, Completada…)</li>' +
      '<li>⚡ Prioridad (Baja, Media, Alta, Urgente)</li>' +
      '<li>💬 Comentarios y avances</li>' +
      '<li>📎 Nombres de archivos y documentos adjuntos</li>' +
      '</ul></div>' +
      '<div class="alert-box alert-info mt">Ejemplo: si escribe <b>ASCENSOR</b>, el sistema mostrará todas las tareas relacionadas con ascensores de <b>todas</b> las comunidades, sin importar cuál esté seleccionada.</div>' +
      '</div>';
  }

  function pintarResultados(res, grupos) {
    if (!res.length) return UI.vacio('No se encontraron coincidencias para «' + estado.texto + '».', '🔎');
    var conf = CSN.store.config();
    return '<div class="card mb"><div class="card-h"><h2>' + res.length + ' resultado(s) para «' + U.escapeHtml(estado.texto) + '»</h2>' +
      '<span class="small muted actions">' + Object.keys(grupos).length + ' comunidad(es)</span></div>' +
      '<div class="small muted">Los resultados indican entre paréntesis el campo donde se encontró la coincidencia.</div></div>' +
      Object.keys(grupos).map(function (nombre) {
        return '<div class="mb"><div class="day-group-title">🏢 ' + U.escapeHtml(nombre) + ' (' + grupos[nombre].length + ')</div>' +
          '<div class="grid grid-auto mt">' + grupos[nombre].map(function (r) {
            var t = r.tarea;
            return '<div class="task-card ' + M.semaforo(t, conf).clase + '" data-tarea="' + U.attr(t.id) + '">' +
              '<div class="tc-title">' + U.escapeHtml(t.titulo) + '</div>' +
              '<div class="tc-meta">' + UI.badgeEstado(t.estado) + UI.badgePrioridad(t.prioridad) + UI.semaforo(t, true) + '</div>' +
              '<div class="tc-meta"><span>📅 Límite: ' + U.fmtFecha(t.fechaLimite) + '</span>' +
              (t.responsable ? '<span>👤 ' + U.escapeHtml(t.responsable) + '</span>' : '') + '</div>' +
              '<div class="tc-meta small"><b>Coincidencia en:</b> ' + U.escapeHtml(r.campos.join(', ')) + '</div>' +
              '<div class="mt">' + UI.avance(t) + '</div></div>';
          }).join('') + '</div></div>';
      }).join('');
  }
})(typeof window !== 'undefined' ? window : globalThis);
