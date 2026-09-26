/* ==========================================================================
   views/ui.js – Componentes de interfaz reutilizables
   Indicadores, insignias, semáforo, tablas y tarjetas de tareas, gráficos.
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util, M = CSN.model;
  var UI = CSN.ui = {};

  /* ---------- Encabezado de página ---------- */
  UI.encabezado = function (titulo, subtitulo, acciones) {
    return '<div class="page-head"><div><h1>' + U.escapeHtml(titulo) + '</h1>' +
      (subtitulo ? '<div class="sub">' + subtitulo + '</div>' : '') + '</div>' +
      (acciones ? '<div class="actions">' + acciones + '</div>' : '') + '</div>';
  };

  UI.vacio = function (mensaje, icono) {
    return '<div class="empty"><span class="ico">' + (icono || '📋') + '</span>' + U.escapeHtml(mensaje) +
      '<div class="small mt">Utilice los botones superiores para registrar información.</div></div>';
  };

  /* ---------- Indicadores ---------- */
  UI.kpi = function (o) {
    return '<button class="kpi ' + (o.clase || 'k-primary') + '" ' +
      (o.ir ? 'data-ir="' + U.attr(o.ir) + '"' : '') + '>' +
      '<span class="label">' + U.escapeHtml(o.label) + '</span>' +
      '<span class="value">' + (typeof o.valor === 'number' ? o.valor : U.escapeHtml(o.valor)) + '</span>' +
      (o.pista ? '<span class="hint">' + U.escapeHtml(o.pista) + '</span>' : '') +
      '</button>';
  };

  UI.kpiCuadricula = function (items) {
    return '<div class="grid grid-4">' + items.map(UI.kpi).join('') + '</div>';
  };

  /* ---------- Insignias ---------- */
  UI.badgeEstado = function (estado) {
    return '<span class="badge ' + M.claseEstado(estado) + '">' + U.escapeHtml(estado) + '</span>';
  };
  UI.badgePrioridad = function (p) {
    return '<span class="badge ' + M.clasePrioridad(p) + '">' + U.escapeHtml(p) + '</span>';
  };

  /* ---------- Semáforo ---------- */
  UI.semaforo = function (tarea, corto) {
    var s = M.semaforo(tarea, CSN.store.config());
    var txt = corto ? (s.color === 'rojo' ? 'VENCIDA' : (s.color === 'amarillo' ? 'PRÓXIMA' : (s.color === 'verde' ? (tarea.estado === 'Completada' ? 'CUMPLIDA' : 'EN PLAZO') : '—'))) : s.texto;
    var dias = (s.dias !== null && s.dias !== undefined && s.color !== 'gris') ? ' <span class="muted small">' + U.txtVencimiento(s.dias) + '</span>' : '';
    return '<span class="semaforo ' + s.clase + '" title="' + U.attr(s.texto) + '"><span class="dot"></span><span class="sem-lbl">' + U.escapeHtml(txt) + '</span>' + (corto ? '' : dias) + '</span>';
  };

  /* ---------- Barra de avance ---------- */
  UI.avance = function (t) {
    var v = Math.max(0, Math.min(100, +t.avance || 0));
    return '<div class="avance-cell"><div class="progress avance-' + v + '"><span style="width:' + v + '%"></span></div>' +
      '<span class="pct">' + v + '%</span></div>';
  };

  /* ---------- Fila / tarjeta de tarea ---------- */
  function comunidadNombre(t) {
    var c = CSN.store.comunidad(t.comunidadId);
    return c ? c.nombre : '(sin comunidad)';
  }
  UI.comunidadNombre = comunidadNombre;

  UI.filaTarea = function (t) {
    return '<tr class="clickable ' + (M.semaforo(t, CSN.store.config()).color === 'rojo' ? 'row-overdue' : '') + '" data-tarea="' + U.attr(t.id) + '">' +
      '<td><div class="t-title">' + U.escapeHtml(t.titulo) + '</div>' +
      '<div class="t-sub">' + U.escapeHtml(comunidadNombre(t)) + (t.responsable ? ' · ' + U.escapeHtml(t.responsable) : '') + '</div></td>' +
      '<td class="nowrap">' + U.fmtFecha(t.fechaCreacion) + '</td>' +
      '<td class="nowrap">' + U.fmtFecha(t.fechaLimite) + '</td>' +
      '<td>' + UI.badgePrioridad(t.prioridad) + '</td>' +
      '<td>' + UI.badgeEstado(t.estado) + '</td>' +
      '<td>' + UI.avance(t) + '</td>' +
      '<td>' + UI.semaforo(t, true) + '</td>' +
      '<td class="actions"><button class="btn btn-sm" data-tarea="' + U.attr(t.id) + '">Ver ficha</button></td></tr>';
  };

  UI.tarjetaTarea = function (t) {
    var sem = M.semaforo(t, CSN.store.config());
    return '<div class="task-card ' + sem.clase + '" data-tarea="' + U.attr(t.id) + '">' +
      '<div class="tc-head"><div class="grow"><div class="tc-title">' + U.escapeHtml(t.titulo) + '</div>' +
      '<div class="tc-meta">' + UI.badgeEstado(t.estado) + UI.badgePrioridad(t.prioridad) + '</div></div></div>' +
      '<div class="tc-meta">' + UI.semaforo(t) + '</div>' +
      '<div class="tc-meta"><span>🏢 ' + U.escapeHtml(comunidadNombre(t)) + '</span>' +
      (t.responsable ? '<span>👤 ' + U.escapeHtml(t.responsable) + '</span>' : '') + '</div>' +
      '<div class="tc-meta"><span>📅 Límite: ' + U.fmtFecha(t.fechaLimite) + '</span></div>' +
      '<div class="mt">' + UI.avance(t) + '</div>' +
      '</div>';
  };

  var COLUMNAS = [
    { id: 'titulo', t: 'Tarea' }, { id: 'fecha', t: 'Fecha' }, { id: 'vencimiento', t: 'Vencimiento' },
    { id: 'prioridad', t: 'Prioridad' }, { id: 'estado', t: 'Estado' }, { id: 'avance', t: 'Avance' },
    { id: 'semaforo', t: 'Semáforo' }, { id: '', t: '' }
  ];

  /**
   * Listado responsable de tareas: tabla en computador y tarjetas en el teléfono.
   * opts: { orden, dir, onSort, sinComunidad, accionesPorFila }
   */
  UI.listaTareas = function (tareas, opts) {
    opts = opts || {};
    if (!tareas.length) return UI.vacio(opts.vacio || 'No hay tareas para mostrar.');
    var ths = COLUMNAS.map(function (c) {
      if (opts.sinComunidad && c.id === 'titulo') c.t = 'Tarea';
      var activa = opts.orden === c.id;
      var flecha = activa ? '<span class="arrow">' + (opts.dir === 'desc' ? '▼' : '▲') + '</span>' : '';
      return c.id
        ? '<th class="sortable" data-orden="' + c.id + '">' + U.escapeHtml(c.t) + ' ' + flecha + '</th>'
        : '<th></th>';
    }).join('');
    var tabla = '<div class="table-wrap hide-mobile"><table class="data"><thead><tr>' + ths + '</tr></thead><tbody>' +
      tareas.map(UI.filaTarea).join('') + '</tbody></table></div>';
    var tarjetas = '<div class="mobile-only grid">' + tareas.map(UI.tarjetaTarea).join('') + '</div>';
    return tabla + tarjetas;
  };

  /* ---------- Gráficos ---------- */
  var COLORES_ESTADO = {
    'Pendiente': '#8b98ad', 'En proceso': '#0b74c4', 'Pendiente de terceros': '#8b5cf6',
    'Completada': '#16a34a', 'Cancelada': '#c2c9d6', 'Vencida': '#d92d20'
  };
  UI.COLORES_ESTADO = COLORES_ESTADO;

  /** Barras horizontales apiladas por estado */
  UI.barras = function (filas, totalMax) {
    if (!filas.length) return UI.vacio('Sin datos para graficar', '📊');
    totalMax = totalMax || Math.max.apply(null, filas.map(function (f) { return f.total; }).concat([1]));
    return '<div class="chart-bars">' + filas.map(function (f) {
      var segs = Object.keys(f.partes || {}).filter(function (k) { return f.partes[k] > 0; }).map(function (k) {
        var pct = (f.partes[k] / totalMax) * 100;
        return '<span class="bar-seg" style="width:' + pct + '%;background:' + (COLORES_ESTADO[k] || '#8b98ad') + '" title="' + U.attr(k + ': ' + f.partes[k]) + '"></span>';
      }).join('');
      return '<div class="bar-row"><span class="bar-label" title="' + U.attr(f.etiqueta) + '">' + U.escapeHtml(f.etiqueta) + '</span>' +
        '<span class="bar-track">' + segs + '</span><span class="bar-val">' + f.total + '</span></div>';
    }).join('') + '</div>' +
      '<div class="legend mt">' + Object.keys(COLORES_ESTADO).map(function (k) {
        return '<span><i style="background:' + COLORES_ESTADO[k] + '"></i>' + U.escapeHtml(k) + '</span>';
      }).join('') + '</div>';
  };

  /** Gráfico de anillo (SVG) */
  UI.anillo = function (segmentos, titulo, subtitulo) {
    var total = segmentos.reduce(function (a, s) { return a + s.valor; }, 0);
    var r = 54, c = 2 * Math.PI * r;
    var acumulado = 0;
    var circulos = segmentos.filter(function (s) { return s.valor > 0; }).map(function (s) {
      var frac = total ? s.valor / total : 0;
      var dash = frac * c;
      var off = -acumulado * c;
      acumulado += frac;
      return '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="' + s.color + '" stroke-width="18" ' +
        'stroke-dasharray="' + dash.toFixed(2) + ' ' + (c - dash).toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '" transform="rotate(-90 66 66)"></circle>';
    }).join('');
    return '<div class="donut-wrap"><svg class="donut" viewBox="0 0 132 132" role="img" aria-label="' + U.attr(titulo) + '">' +
      '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="#eef1f7" stroke-width="18"></circle>' + circulos +
      '<text x="66" y="62" text-anchor="middle" font-size="24" font-weight="700" fill="#1b2436">' + total + '</text>' +
      '<text x="66" y="80" text-anchor="middle" font-size="10" fill="#7b8aa3">' + U.escapeHtml(subtitulo || 'tareas') + '</text></svg>' +
      '<div class="grow"><div class="section-title" style="margin-top:0">' + U.escapeHtml(titulo) + '</div>' +
      segmentos.map(function (s) {
        return '<div class="flex between small" style="padding:.15rem 0"><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + s.color + ';margin-right:.35rem"></i>' +
          U.escapeHtml(s.etiqueta) + '</span><b class="mono">' + s.valor + '</b></div>';
      }).join('') + '</div></div>';
  };

  /** Anillo de cumplimiento en porcentaje */
  UI.anilloPct = function (pct, etiqueta, color) {
    var r = 50, c = 2 * Math.PI * r;
    var dash = (Math.max(0, Math.min(100, pct)) / 100) * c;
    return '<div class="donut-wrap"><svg class="donut" viewBox="0 0 120 120" role="img" aria-label="' + U.attr(etiqueta) + '">' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="#eef1f7" stroke-width="14"></circle>' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + (color || '#16a34a') + '" stroke-width="14" stroke-linecap="round" ' +
      'stroke-dasharray="' + dash.toFixed(2) + ' ' + (c - dash).toFixed(2) + '" transform="rotate(-90 60 60)"></circle>' +
      '<text x="60" y="59" text-anchor="middle" font-size="24" font-weight="800" fill="' + (color || '#16a34a') + '">' + pct + '%</text>' +
      '<text x="60" y="76" text-anchor="middle" font-size="9" fill="#7b8aa3">' + U.escapeHtml(etiqueta) + '</text></svg></div>';
  };

  /* ---------- Filtros ---------- */
  UI.opciones = function (lista, valor, placeholder) {
    return '<option value="">' + U.escapeHtml(placeholder || 'Todos') + '</option>' + lista.map(function (o) {
      var v = o.id !== undefined ? o.id : o;
      var t = o.nombre !== undefined ? o.nombre : (o.t || o);
      return '<option value="' + U.attr(v) + '"' + (String(v) === String(valor) ? ' selected' : '') + '>' + U.escapeHtml(t) + '</option>';
    }).join('');
  };

  /** Opciones (sin la etiqueta <select>) para usar dentro de UI.campo */
  UI.opcionesComunidades = function (valor, conTodas) {
    var lista = CSN.store.comunidades(true).map(function (c) {
      return { id: c.id, nombre: c.nombre + (c.estado === 'Inactiva' ? ' (inactiva)' : '') };
    });
    return (conTodas ? '<option value="todas"' + ((valor === 'todas' || !valor) ? ' selected' : '') + '>Todas las comunidades</option>' : '') +
      (conTodas ? '' : '<option value="">Seleccione una comunidad…</option>') +
      lista.map(function (c) {
        return '<option value="' + U.attr(c.id) + '"' + (String(c.id) === String(valor) ? ' selected' : '') + '>' + U.escapeHtml(c.nombre) + '</option>';
      }).join('');
  };

  /** Selector completo de comunidades (listados y filtros) */
  UI.selectComunidades = function (valor, conTodas) {
    return '<select data-campo="comunidadId">' + UI.opcionesComunidades(valor, conTodas) + '</select>';
  };

  UI.selectEstados = function (valor, placeholder) { return '<select data-campo="estado">' + UI.opciones(M.ESTADOS, valor, placeholder) + '</select>'; };
  UI.selectPrioridades = function (valor, placeholder) { return '<select data-campo="prioridad">' + UI.opciones(M.PRIORIDADES, valor, placeholder) + '</select>'; };

  UI.chips = function (items, activo, campo) {
    return '<div class="chip-row">' + items.map(function (i) {
      return '<button type="button" class="chip' + (String(i.id) === String(activo) ? ' active' : '') + '" data-chip="' + U.attr(campo) + '" data-valor="' + U.attr(i.id) + '">' + U.escapeHtml(i.t) + '</button>';
    }).join('') + '</div>';
  };

  /* ---------- Utilidades de formulario ---------- */
  UI.campo = function (o) {
    var id = 'f_' + U.slug(o.nombre || o.label || 'campo') + '_' + Math.random().toString(36).slice(2, 6);
    var req = o.requerido ? ' <span class="req">*</span>' : '';
    var control;
    var comun = 'id="' + id + '" data-campo="' + U.attr(o.nombre) + '"' + (o.requerido ? ' required' : '') + (o.atributos || '');
    if (o.tipo === 'textarea') control = '<textarea ' + comun + ' rows="' + (o.filas || 3) + '" placeholder="' + U.attr(o.placeholder || '') + '">' + U.escapeHtml(o.valor || '') + '</textarea>';
    else if (o.tipo === 'select') {
      // Si el llamador entrega un <select> ya construido se reutilizan sus opciones
      // (evita selectores anidados que dejarían el campo sin valor).
      var opciones = o.opcionesHtml || '';
      if (/^\s*<select/i.test(opciones)) {
        var m = /<select[^>]*>([\s\S]*)<\/select>/i.exec(opciones);
        opciones = m ? m[1] : '';
      }
      control = '<select ' + comun + '>' + opciones + '</select>';
    }
    else if (o.tipo === 'range') {
      control = '<input type="range" ' + comun + ' min="0" max="100" step="5" value="' + (o.valor || 0) + '" oninput="this.nextElementSibling.textContent=this.value+\'%\'"><span class="badge b-media">' + (o.valor || 0) + '%</span>';
    } else control = '<input type="' + (o.tipo || 'text') + '" ' + comun + ' value="' + U.attr(o.valor || '') + '" placeholder="' + U.attr(o.placeholder || '') + '">';
    return '<div class="field ' + (o.ancho === 2 ? 'col-2' : '') + '"><label for="' + id + '">' + U.escapeHtml(o.label) + req + '</label>' +
      control + (o.ayuda ? '<span class="hint-line">' + U.escapeHtml(o.ayuda) + '</span>' : '') + '</div>';
  };

  /** Lee los campos [data-campo] de un contenedor */
  UI.leerCampos = function (raiz) {
    var datos = {};
    U.$$('[data-campo]', raiz).forEach(function (el) {
      var k = el.getAttribute('data-campo');
      var v = el.type === 'checkbox' ? el.checked : el.value;
      if (v === 'true') v = true; else if (v === 'false') v = false;
      datos[k] = typeof v === 'string' ? v.trim() : v;
    });
    return datos;
  };
  UI.escribirCampos = function (raiz, datos) {
    Object.keys(datos || {}).forEach(function (k) {
      var el = U.$('[data-campo="' + k + '"]', raiz);
      if (el) el.value = datos[k] === null || datos[k] === undefined ? '' : datos[k];
    });
  };

  UI.etiquetaSync = function () {
    var s = CSN.sync;
    return '<span class="sync-pill ' + s.claseEstado() + '"><span class="dot"></span><span>' + U.escapeHtml(s.textoEstado()) + '</span></span>';
  };

  /* ---------- Historial ---------- */
  UI.listaHistorial = function (items, limite) {
    items = items || [];
    if (!items.length) return '<p class="muted small">Sin movimientos registrados.</p>';
    return '<div class="timeline">' + items.slice(0, limite || items.length).map(function (h) {
      var clase = h.estadoNuevo === 'Completada' ? 'ok' : (h.estadoNuevo === 'Vencida' ? 'danger' : (h.accion && /Vencim|atraso/i.test(h.accion) ? 'danger' : ''));
      var t = CSN.store.tarea(h.tareaId);
      return '<div class="tl-item ' + clase + '"><div class="tl-head"><span class="tl-date">' + U.fmtFecha(h.fecha) + ' ' + U.escapeHtml(h.hora || '') + '</span>' +
        '<span class="badge">' + U.escapeHtml(h.accion || '') + '</span>' +
        (h.estadoAnterior || h.estadoNuevo ? '<span class="small muted">' + U.escapeHtml((h.estadoAnterior || '—') + ' → ' + (h.estadoNuevo || '—')) + '</span>' : '') +
        '</div>' +
        '<div class="tl-body">' + (t ? '<b>' + U.escapeHtml(t.titulo) + '</b><br>' : '') + U.escapeHtml(h.comentario || '') + '</div>' +
        '<div class="tl-meta">👤 ' + U.escapeHtml(h.usuario || '') + ' · 💻 ' + U.escapeHtml(h.dispositivo || '') + '</div></div>';
    }).join('') + '</div>';
  };
})(typeof window !== 'undefined' ? window : globalThis);
