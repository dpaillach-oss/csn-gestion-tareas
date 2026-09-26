/* ==========================================================================
   views/dashboard.js – Panel general (DASHBOARD)
   Indicadores dinámicos, gráficos, buscador global, acciones rápidas,
   próximos vencimientos y últimas modificaciones.
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util, M = CSN.model, UI = CSN.ui;
  var V = CSN.views = CSN.views || {};

  V.dashboard = {};

  V.dashboard.render = function (cont) {
    var conf = CSN.store.config();
    var r = CSN.store.resumenGlobal();
    var tareas = CSN.store.todas('tareas');
    var s = CSN.store.sesion() || {};

    /* --- Gráficos --- */
    var porComunidad = r.porComunidad.map(function (rc) {
      var partes = {};
      M.ESTADOS.forEach(function (e) { partes[e.id] = CSN.store.tareasDe(rc.comunidad.id).filter(function (t) { return t.estado === e.id; }).length; });
      return { etiqueta: rc.comunidad.nombre, total: rc.total, partes: partes };
    });

    var segmentosEstado = M.ESTADOS.map(function (e) {
      return { etiqueta: e.id, valor: tareas.filter(function (t) { return t.estado === e.id; }).length, color: UI.COLORES_ESTADO[e.id] };
    });

    var vencidas = CSN.store.filtrarTareas({ vencidas: true });
    var proximos = CSN.store.ordenarTareas(tareas.filter(function (t) {
      var sem = M.semaforo(t, conf);
      return sem.color === 'amarillo' || sem.color === 'rojo';
    }).filter(function (t) { return !M.esCerrada(t.estado); }), 'vencimiento', 'asc').slice(0, 8);

    var historial = CSN.store.historialGlobal({}).slice(0, 10);

    cont.innerHTML = '' +
      UI.encabezado('DASHBOARD',
        'Bienvenido/a <b>' + U.escapeHtml(s.nombre || '') + '</b> · ' + U.escapeHtml(s.perfil || '') +
        ' · ' + U.escapeHtml(conf.empresa) + ' · Hoy es ' + U.fmtFechaLarga(U.hoy()),
        UI.etiquetaSync()) +

      /* Buscador global */
      '<div class="card mb" style="border-left:4px solid var(--c-primary)">' +
      '<div class="flex gap items-center flex-wrap">' +
      '<div class="grow"><label class="small" style="font-weight:700;color:var(--c-text-soft)">🔎 BUSCADOR GLOBAL — busca en todas las comunidades</label>' +
      '<input type="search" id="buscador-global" placeholder="Ej: ascensor, filtración, Juan Pérez, vencida, urgente…" ' +
      'style="font-size:1.02rem;padding:.6rem .7rem"></div>' +
      '<button class="btn btn-primary btn-lg" id="btn-buscar">BUSCAR</button></div>' +
      '<div class="small muted mt">Busca por nombre de comunidad, tarea, descripción, responsable, estado, prioridad y palabras contenidas en los comentarios y avances.</div>' +
      '</div>' +

      /* Acciones rápidas */
      '<div class="card mb"><div class="card-h"><h2>Acciones rápidas</h2></div><div class="btn-group">' +
      (CSN.store.puede('comunidad.crear') ? '<button class="btn btn-primary" id="qa-comunidad">+ NUEVA COMUNIDAD</button>' : '') +
      (CSN.store.puede('tarea.crear') ? '<button class="btn btn-primary" id="qa-tarea">+ NUEVA TAREA</button>' : '') +
      (CSN.store.puede('avance.crear') ? '<button class="btn btn-accent" id="qa-avance">📈 AGREGAR AVANCE</button>' : '') +
      '<button class="btn" id="qa-foto">📷 TOMAR FOTO</button>' +
      '<button class="btn" id="qa-informes">📊 INFORMES</button>' +
      '<button class="btn" id="qa-buscar">🔎 BUSCAR</button>' +
      '</div></div>' +

      /* Indicadores */
      '<div class="section-title">Indicadores generales</div>' +
      UI.kpiCuadricula([
        { label: 'Total comunidades', valor: r.comunidades, clase: 'k-primary', pista: r.comunidadesTotales + ' registradas en total', ir: 'comunidades' },
        { label: 'Tareas pendientes', valor: r.pendientes, clase: 'k-primary', pista: 'Incluye las vencidas', ir: 'pendientes' },
        { label: 'Tareas en proceso', valor: r.proceso, clase: 'k-info', pista: r.terceros + ' pendiente(s) de terceros', ir: 'tareas?estado=En proceso' },
        { label: 'Tareas vencidas', valor: r.vencidas, clase: 'k-danger', pista: 'Requieren atención inmediata', ir: 'vencidas' },
        { label: 'Tareas urgentes', valor: r.urgentes, clase: 'k-accent', pista: 'Prioridad urgente abiertas', ir: 'tareas?urgentes=1' },
        { label: 'Próximas a vencer', valor: r.proximas, clase: 'k-warn', pista: 'Dentro de ' + conf.umbralDias + ' días', ir: 'tareas?semaforo=proximas' },
        { label: 'Tareas completadas', valor: r.completadas, clase: 'k-ok', pista: r.canceladas + ' cancelada(s)', ir: 'tareas?completadas=1' },
        { label: 'Cumplimiento general', valor: r.cumplimiento + '%', clase: 'k-ok', pista: 'Avance promedio: ' + r.avancePromedio + '%' }
      ]) +

      /* Gráficos */
      '<div class="grid grid-2 mt-lg">' +
      '<div class="card"><div class="card-h"><h2>Tareas por comunidad</h2>' +
      '<span class="small muted actions">Barras por estado</span></div>' +
      UI.barras(porComunidad) + '</div>' +
      '<div class="card"><div class="card-h"><h2>Tareas por estado</h2></div>' +
      UI.anillo(segmentosEstado, 'Distribución por estado', 'tareas') + '</div>' +
      '</div>' +

      '<div class="grid grid-2 mt-lg">' +
      '<div class="card"><div class="card-h"><h2>Porcentaje de cumplimiento</h2></div>' +
      UI.anilloPct(r.cumplimiento, 'cumplimiento', r.cumplimiento >= 70 ? '#16a34a' : (r.cumplimiento >= 40 ? '#e8a400' : '#d92d20')) +
      '<div class="mt"><div class="flex between small"><span>Tareas completadas</span><b>' + r.completadas + ' de ' + (r.total - r.canceladas) + '</b></div>' +
      '<div class="progress mt" style="height:12px"><span style="width:' + r.cumplimiento + '%"></span></div></div>' +
      '<div class="small muted mt">El porcentaje considera las tareas completadas sobre el total de tareas vigentes (excluye las canceladas).</div></div>' +
      '<div class="card"><div class="card-h"><h2>Tareas vencidas (' + vencidas.length + ')</h2>' +
      '<button class="btn btn-sm actions" data-ir="vencidas">Ver todas</button></div>' +
      (vencidas.length ? '<div class="stack">' + CSN.store.ordenarTareas(vencidas, 'vencimiento', 'asc').slice(0, 6).map(function (t) {
        var c = CSN.store.comunidad(t.comunidadId);
        return '<div class="task-card sem-rojo" data-tarea="' + U.attr(t.id) + '">' +
          '<div class="tc-title">' + U.escapeHtml(t.titulo) + '</div>' +
          '<div class="tc-meta"><span>🏢 ' + U.escapeHtml(c ? c.nombre : '') + '</span>' +
          '<span>📅 ' + U.fmtFecha(t.fechaLimite) + '</span>' + UI.badgePrioridad(t.prioridad) + '</div></div>';
      }).join('') + '</div>' : '<p class="muted small">No hay tareas vencidas. 👍</p>') + '</div>' +
      '</div>' +

      '<div class="grid grid-2 mt-lg">' +
      '<div class="card"><div class="card-h"><h2>Próximos vencimientos</h2></div>' +
      (proximos.length ? '<div class="stack">' + proximos.map(function (t) {
        var c = CSN.store.comunidad(t.comunidadId);
        return '<div class="task-card ' + M.semaforo(t, conf).clase + '" data-tarea="' + U.attr(t.id) + '">' +
          '<div class="tc-head"><div class="grow"><div class="tc-title">' + U.escapeHtml(t.titulo) + '</div>' +
          '<div class="tc-meta"><span>🏢 ' + U.escapeHtml(c ? c.nombre : '') + '</span>' + UI.semaforo(t) + '</div></div>' + UI.avance(t) + '</div></div>';
      }).join('') + '</div>' : '<p class="muted small">No hay vencimientos en el horizonte inmediato.</p>') + '</div>' +
      '<div class="card"><div class="card-h"><h2>Últimas modificaciones</h2></div>' +
      UI.listaHistorial(historial, 10) + '</div>' +
      '</div>';

    /* Eventos */
    U.$('#btn-buscar', cont).onclick = buscar;
    var inp = U.$('#buscador-global', cont);
    inp.onkeydown = function (e) { if (e.key === 'Enter') buscar(); };
    function buscar() {
      var q = inp.value.trim();
      if (!q) { U.toast('Escriba un término de búsqueda', 'warn'); return; }
      CSN.app.ir('buscar', { texto: q });
    }
    var qa = {
      'qa-comunidad': function () { V.comunidades.formulario(null, function () { CSN.app.recargar(); }); },
      'qa-tarea': function () { V.tareas.formulario({ onListo: function () { CSN.app.recargar(); } }); },
      'qa-avance': function () { V.tareas.avanceRapido(); },
      'qa-foto': function () { V.tareas.fotoRapida(); },
      'qa-informes': function () { CSN.app.ir('informes'); },
      'qa-buscar': function () { CSN.app.ir('buscar', { foco: 1 }); }
    };
    Object.keys(qa).forEach(function (id) {
      var el = U.$('#' + id, cont);
      if (el) el.onclick = qa[id];
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
