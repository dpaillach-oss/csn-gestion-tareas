/* ==========================================================================
   views/informes.js – Módulo INFORMES
   Selección de comunidad, período, estado, prioridad y semáforo. Genera la
   vista previa y exporta a PDF (hoja carta con logotipo) y a Excel (.xlsx).
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util, M = CSN.model, UI = CSN.ui;
  var V = CSN.views = CSN.views || {};

  var f = CSN.report.filtroVacio();
  f.fechas = 'creacion';

  var Vi = V.informes = { estado: f };

  Vi.render = function (cont, params) {
    params = params || {};
    if (params.comunidadId) f.comunidadId = params.comunidadId;

    var tareas = CSN.report.tareasDelInforme(f);
    var conf = CSN.store.config();
    var res = M.resumen(tareas, conf);

    cont.innerHTML = '' +
      UI.encabezado('INFORMES',
        'Seleccione los criterios y exporte el informe en PDF (formato profesional con logotipo) o Excel (planilla con filtros aplicados).',
        '<button class="btn" data-i="limpiar">Limpiar filtros</button>' +
        '<button class="btn" data-i="excel">📊 EXPORTAR EXCEL</button>' +
        '<button class="btn btn-primary" data-i="pdf">📄 EXPORTAR PDF</button>') +

      '<div class="card mb"><div class="card-h"><h2>1. Criterios del informe</h2></div>' +
      '<div class="filters">' +
      '<div class="field"><label>Comunidad</label>' + UI.selectComunidades(f.comunidadId, true) + '</div>' +
      '<div class="field"><label>Desde</label><input type="date" data-i="desde" value="' + U.attr(f.desde) + '"></div>' +
      '<div class="field"><label>Hasta</label><input type="date" data-i="hasta" value="' + U.attr(f.hasta) + '"></div>' +
      '<div class="field"><label>Fechas según</label><select data-i="fechas">' +
      '<option value="creacion"' + (f.fechas === 'creacion' ? ' selected' : '') + '>Fecha de creación</option>' +
      '<option value="vencimiento"' + (f.fechas === 'vencimiento' ? ' selected' : '') + '>Fecha de vencimiento</option>' +
      '</select></div>' +
      '<div class="field"><label>Estado</label>' + UI.selectEstados(f.estado, 'Todos los estados') + '</div>' +
      '<div class="field"><label>Prioridad</label>' + UI.selectPrioridades(f.prioridad, 'Todas') + '</div>' +
      '<div class="field"><label>Semáforo</label><select data-campo="semaforo">' +
      '<option value="">Todos</option><option value="proximas"' + (f.semaforo === 'proximas' ? ' selected' : '') + '>🟡 Próximas a vencer</option>' +
      '<option value="vencidas"' + (f.semaforo === 'vencidas' ? ' selected' : '') + '>🔴 Vencidas</option></select></div>' +
      '</div>' +
      '<div class="chip-row mt">' +
      chip('incluirAvances', 'Incluir avances y comentarios', f.incluirAvances) +
      chip('incluirFotos', 'Incluir fotografías', f.incluirFotos) +
      chip('incluirHistorial', 'Incluir historial de modificaciones', f.incluirHistorial) +
      '</div></div>' +

      '<div class="card mb"><div class="card-h"><h2>2. Resumen</h2></div>' +
      UI.kpiCuadricula([
        { label: 'Tareas incluidas', valor: res.total, clase: 'k-primary' },
        { label: 'Pendientes', valor: res.pendientes, clase: 'k-primary' },
        { label: 'En proceso', valor: res.proceso, clase: 'k-info' },
        { label: 'Vencidas', valor: res.vencidas, clase: 'k-danger' },
        { label: 'Próximas', valor: res.proximas, clase: 'k-warn' },
        { label: 'Completadas', valor: res.completadas, clase: 'k-ok' },
        { label: 'Urgentes', valor: res.urgentes, clase: 'k-accent' },
        { label: 'Cumplimiento', valor: res.cumplimiento + '%', clase: 'k-ok' }
      ]) + '</div>' +

      '<div class="card mb"><div class="card-h"><h2>3. Informes rápidos</h2>' +
      '<span class="small muted actions">Úselos como punto de partida</span></div>' +
      '<div class="btn-group">' +
      '<button class="btn" data-r="vencidas">🔴 Todas las tareas vencidas</button>' +
      '<button class="btn" data-r="proximas">🟡 Próximas a vencer</button>' +
      '<button class="btn" data-r="pendientes">📋 Todas las pendientes</button>' +
      '<button class="btn" data-r="mes">📅 Últimos 30 días</button>' +
      '<button class="btn" data-r="semestre">🗓️ Últimos 6 meses</button>' +
      '<button class="btn" data-r="general">🏢 Informe general completo</button>' +
      '</div></div>' +

      '<div class="card"><div class="card-h"><h2>4. Vista previa del informe</h2>' +
      '<span class="small muted actions">' + U.escapeHtml(CSN.report.descripcionFiltro(f)) + '</span></div>' +
      '<div id="informe-preview" style="border:1px solid var(--c-line);border-radius:8px;padding:1rem;background:#fff;max-height:70vh;overflow:auto">' +
      CSN.report.htmlInforme(f) + '</div>' +
      '<div class="btn-group mt">' +
      '<button class="btn btn-primary btn-lg" data-i="pdf">📄 EXPORTAR PDF</button>' +
      '<button class="btn btn-lg" data-i="excel">📊 EXPORTAR EXCEL</button>' +
      '<button class="btn btn-lg" data-i="imprimir-tarea" style="display:none"></button>' +
      '</div>' +
      '<div class="small muted mt">El PDF se genera en hoja carta vertical con el logotipo, nombre de la empresa, comunidad, fecha de emisión, período, resumen, detalle, estados, avances, comentarios y fotografías. ' +
      'En el diálogo de impresión seleccione <b>Guardar como PDF</b> (destino).</div></div>';

    function chip(campo, texto, activo) {
      return '<button class="chip' + (activo ? ' active' : '') + '" data-campo="' + campo + '" data-valor="' + (activo ? 'true' : 'false') + '">' + texto + '</button>';
    }

    function refrescar() { Vi.render(cont, params); }

    U.$$('[data-campo]', cont).forEach(function (el) {
      var campo = el.getAttribute('data-campo');
      if (el.tagName === 'BUTTON') {
        el.onclick = function () {
          f[campo] = !f[campo];
          U.toast((f[campo] ? 'Se incluirá' : 'No se incluirá') + ': ' + el.textContent.trim().toLowerCase(), 'ok', 2000);
          refrescar();
        };
      } else {
        el.onchange = function () { f[campo] = el.value; refrescar(); };
      }
    });
    U.$$('[data-i]', cont).forEach(function (el) {
      var campo = el.getAttribute('data-i');
      if (el.tagName === 'INPUT') el.onchange = function () { f[campo] = el.value; refrescar(); };
      else if (el.getAttribute('data-i') === 'pdf') el.onclick = function () { CSN.report.exportarPDF(f); };
      else if (el.getAttribute('data-i') === 'excel') el.onclick = function () { CSN.report.exportarExcel(f); };
      else if (el.getAttribute('data-i') === 'limpiar') {
        el.onclick = function () {
          var nuevo = CSN.report.filtroVacio(); nuevo.fechas = 'creacion';
          Object.keys(f).forEach(function (k) { delete f[k]; });
          Object.assign(f, nuevo);
          refrescar();
        };
      }
    });
    U.$$('[data-r]', cont).forEach(function (el) {
      el.onclick = function () {
        var r = el.getAttribute('data-r');
        var hoy = U.hoy();
        Object.assign(f, {
          estado: '', prioridad: '', semaforo: '', fechas: 'creacion',
          desde: U.sumarDias(hoy, -30), hasta: hoy, comunidadId: f.comunidadId
        });
        if (r === 'vencidas') { f.semaforo = 'vencidas'; f.desde = ''; f.hasta = ''; }
        if (r === 'proximas') { f.semaforo = 'proximas'; f.desde = ''; f.hasta = ''; }
        if (r === 'pendientes') { f.estado = 'Pendiente'; f.desde = ''; f.hasta = ''; }
        if (r === 'mes') { f.desde = U.sumarDias(hoy, -30); f.hasta = hoy; }
        if (r === 'semestre') { f.desde = U.sumarDias(hoy, -182); f.hasta = hoy; }
        if (r === 'general') { f.desde = ''; f.hasta = ''; f.comunidadId = 'todas'; }
        refrescar();
      };
    });
  };

  /** Abre el módulo de informes con los filtros recibidos (usado desde Tareas) */
  Vi.abrirConFiltro = function (filtrosTareas) {
    Object.keys(f).forEach(function (k) { delete f[k]; });
    Object.assign(f, CSN.report.filtroVacio(), {
      comunidadId: filtrosTareas.comunidadId || 'todas',
      estado: filtrosTareas.estado || '',
      prioridad: filtrosTareas.prioridad || '',
      semaforo: filtrosTareas.semaforo === 'completadas' ? '' : (filtrosTareas.semaforo || ''),
      desde: '', hasta: '', fechas: 'creacion'
    });
    CSN.app.ir('informes');
  };

  /** Vista previa en ventana modal (usada desde Comunidades) */
  Vi.vista = function (filtro) {
    var base = CSN.report.filtroVacio();
    Object.assign(base, filtro || {}, { desde: '', hasta: '' });
    CSN.report.vistaPrevia(base);
  };
})(typeof window !== 'undefined' ? window : globalThis);
