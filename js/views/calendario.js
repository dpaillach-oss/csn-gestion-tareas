/* ==========================================================================
   views/calendario.js – Módulo CALENDARIO (mes, semana, día)
   Las tareas se posicionan según su fecha límite o su fecha de creación y se
   identifican con el semáforo de vencimientos.
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util, M = CSN.model, UI = CSN.ui;
  var V = CSN.views = CSN.views || {};

  var estado = { vista: 'mes', fecha: U.hoy(), comunidadId: 'todas', campo: 'fechaLimite' };

  var Vcal = V.calendario = {
    estado: estado,
    render: function (cont, params) {
      if (params && params.vista) estado.vista = params.vista;
      if (params && params.fecha) estado.fecha = params.fecha;
      if (!estado.fecha) estado.fecha = U.hoy();

      var conf = CSN.store.config();
      var tareas = CSN.store.filtrarTareas({ comunidadId: estado.comunidadId });
      var conFecha = tareas.filter(function (t) { return !!t[estado.campo]; });

      cont.innerHTML = '' +
        UI.encabezado('CALENDARIO',
          'Ubicación de las tareas en el tiempo según su <b>' + (estado.campo === 'fechaLimite' ? 'fecha límite' : 'fecha de creación') + '</b>. ' +
          '<b>' + conFecha.length + '</b> tarea(s) con fecha registrada.',
          '<button class="btn" data-ir="tareas">📋 Ver listado de tareas</button>') +
        '<div class="card tight mb">' +
        '<div class="cal-head">' +
        '<button class="btn btn-sm" data-cal="anterior">‹</button>' +
        '<button class="btn btn-sm" data-cal="hoy">Hoy</button>' +
        '<button class="btn btn-sm" data-cal="siguiente">›</button>' +
        '<span class="title" id="cal-titulo">' + U.escapeHtml(tituloPeriodo()) + '</span>' +
        '<div class="chip-row" data-grupo="vista">' +
        ['mes', 'semana', 'dia'].map(function (v) {
          return '<button class="chip' + (estado.vista === v ? ' active' : '') + '" data-cal="vista" data-valor="' + v + '">' +
            (v === 'mes' ? 'Mes' : v === 'semana' ? 'Semana' : 'Día') + '</button>';
        }).join('') + '</div>' +
        '<div class="chip-row" data-grupo="campo">' +
        '<button class="chip' + (estado.campo === 'fechaLimite' ? ' active' : '') + '" data-cal="campo" data-valor="fechaLimite">Vencimiento</button>' +
        '<button class="chip' + (estado.campo === 'fechaCreacion' ? ' active' : '') + '" data-cal="campo" data-valor="fechaCreacion">Creación</button>' +
        '</div>' +
        '<div class="field" style="min-width:190px"><label class="small">Comunidad</label>' + UI.selectComunidades(estado.comunidadId, true) + '</div>' +
        '</div>' +
        '<div class="legend mb">' +
        '<span><i style="background:var(--c-ok)"></i>En plazo</span>' +
        '<span><i style="background:var(--c-warn)"></i>Próxima a vencer</span>' +
        '<span><i style="background:var(--c-danger)"></i>Vencida</span>' +
        '<span><i style="background:var(--c-muted)"></i>Completada / sin plazo</span>' +
        '</div>' +
        '<div id="cal-cuerpo">' + cuerpo(conFecha, conf) + '</div>' +
        '</div>';

      U.$('[data-campo="comunidadId"]', cont).onchange = function (e) {
        estado.comunidadId = e.target.value; Vcal.render(cont, null);
      };
      U.$$('[data-cal]', cont).forEach(function (b) {
        b.onclick = function () {
          var accion = b.getAttribute('data-cal');
          var val = b.getAttribute('data-valor');
          if (accion === 'vista') estado.vista = val;
          else if (accion === 'campo') estado.campo = val;
          else if (accion === 'hoy') estado.fecha = U.hoy();
          else if (accion === 'anterior') estado.fecha = desplazar(-1);
          else if (accion === 'siguiente') estado.fecha = desplazar(1);
          Vcal.render(cont, null);
        };
      });
    }
  };

  /* ---------- Navegación ---------- */
  function desplazar(dir) {
    var d = U.aFecha(estado.fecha) || new Date();
    if (estado.vista === 'mes') d.setMonth(d.getMonth() + dir);
    else if (estado.vista === 'semana') d.setDate(d.getDate() + (7 * dir));
    else d.setDate(d.getDate() + dir);
    return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
  }
  function tituloPeriodo() {
    var d = U.aFecha(estado.fecha) || new Date();
    if (estado.vista === 'mes') return U.MESES[d.getMonth()] + ' ' + d.getFullYear();
    if (estado.vista === 'semana') {
      var ini = inicioSemana(d), fin = new Date(ini);
      fin.setDate(fin.getDate() + 6);
      return U.fmtFechaCorta(ini) + ' — ' + U.fmtFechaCorta(fin) + ' ' + fin.getFullYear();
    }
    return U.fmtFechaLarga(estado.fecha);
  }
  function inicioSemana(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dow = (x.getDay() + 6) % 7; // lunes = 0
    x.setDate(x.getDate() - dow);
    return x;
  }
  function iso(d) { return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate()); }

  /* ---------- Cuerpo según la vista ---------- */
  function cuerpo(tareas, conf) {
    if (estado.vista === 'mes') return vistaMes(tareas, conf);
    if (estado.vista === 'semana') return vistaSemana(tareas, conf);
    return vistaDia(tareas, conf);
  }

  function eventoHtml(t, conf) {
    var sem = M.semaforo(t, conf);
    var c = CSN.store.comunidad(t.comunidadId);
    return '<div class="cal-ev ' + sem.clase + '" data-tarea="' + U.attr(t.id) + '" title="' +
      U.attr(t.titulo + ' · ' + (c ? c.nombre : '') + ' · ' + t.estado + ' · ' + sem.texto) + '">' +
      U.escapeHtml(U.truncar(t.titulo, 26)) + '</div>';
  }

  function vistaMes(tareas, conf) {
    var base = U.aFecha(estado.fecha) || new Date();
    var primero = new Date(base.getFullYear(), base.getMonth(), 1);
    var inicio = inicioSemana(primero);
    var hoy = U.hoy();
    var html = '<div class="cal-grid">' +
      ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(function (d) { return '<div class="cal-dow">' + d + '</div>'; }).join('');
    var cursor = new Date(inicio);
    for (var i = 0; i < 42; i++) {
      var dia = iso(cursor);
      var delDia = tareas.filter(function (t) { return t[estado.campo] === dia; });
      html += '<div class="cal-cell' + (cursor.getMonth() !== base.getMonth() ? ' out' : '') + (dia === hoy ? ' today' : '') + '" data-dia="' + dia + '">' +
        '<div class="dnum">' + cursor.getDate() + (delDia.length ? ' <span class="badge" style="font-size:.6rem">' + delDia.length + '</span>' : '') + '</div>' +
        delDia.slice(0, 4).map(function (t) { return eventoHtml(t, conf); }).join('') +
        (delDia.length > 4 ? '<div class="small muted">+' + (delDia.length - 4) + ' más</div>' : '') +
        '</div>';
      cursor.setDate(cursor.getDate() + 1);
    }
    return html + '</div>';
  }

  function vistaSemana(tareas, conf) {
    var ini = inicioSemana(U.aFecha(estado.fecha) || new Date());
    var html = '<div class="cal-grid">';
    var hoy = U.hoy();
    for (var i = 0; i < 7; i++) {
      var d = new Date(ini); d.setDate(d.getDate() + i);
      var dia = iso(d);
      var delDia = tareas.filter(function (t) { return t[estado.campo] === dia; });
      html += '<div class="cal-cell' + (dia === hoy ? ' today' : '') + '" style="min-height:190px" data-dia="' + dia + '">' +
        '<div class="dnum">' + U.DIAS[d.getDay()] + ' ' + d.getDate() + '</div>' +
        (delDia.length ? delDia.map(function (t) { return eventoHtml(t, conf); }).join('') : '<div class="small muted">Sin tareas</div>') +
        '</div>';
    }
    return html + '</div>';
  }

  function vistaDia(tareas, conf) {
    var dia = estado.fecha;
    var delDia = tareas.filter(function (t) { return t[estado.campo] === dia; });
    if (!delDia.length) return UI.vacio('No hay tareas registradas para el ' + U.fmtFecha(dia) + '.', '📅');
    var grupos = [
      { t: '🔴 Vencidas', items: delDia.filter(function (t) { return M.semaforo(t, conf).color === 'rojo'; }) },
      { t: '🟡 Próximas a vencer', items: delDia.filter(function (t) { return M.semaforo(t, conf).color === 'amarillo'; }) },
      { t: '🟢 En plazo', items: delDia.filter(function (t) { return M.semaforo(t, conf).color === 'verde'; }) },
      { t: '⚪ Completadas / sin plazo', items: delDia.filter(function (t) { return M.semaforo(t, conf).color === 'gris'; }) }
    ].filter(function (g) { return g.items.length; });
    return '<div class="stack">' + grupos.map(function (g) {
      return '<div><div class="day-group-title' + (dia === U.hoy() ? ' today' : '') + '">' + g.t + '</div>' +
        '<div class="grid grid-auto mt">' + g.items.map(function (t) {
          var c = CSN.store.comunidad(t.comunidadId);
          return '<div class="task-card ' + M.semaforo(t, conf).clase + '" data-tarea="' + U.attr(t.id) + '">' +
            '<div class="tc-title">' + U.escapeHtml(t.titulo) + '</div>' +
            '<div class="tc-meta"><span>🏢 ' + U.escapeHtml(c ? c.nombre : '') + '</span>' + UI.badgeEstado(t.estado) + UI.badgePrioridad(t.prioridad) + '</div>' +
            '<div class="tc-meta">' + UI.semaforo(t) + (t.responsable ? '<span>👤 ' + U.escapeHtml(t.responsable) + '</span>' : '') + '</div>' +
            '<div class="mt">' + UI.avance(t) + '</div></div>';
        }).join('') + '</div></div>';
    }).join('') + '</div>';
  }
})(typeof window !== 'undefined' ? window : globalThis);
