/* ==========================================================================
   report.js – Informes: vista previa, exportación a PDF y a Excel
   · El PDF se genera con formato profesional (hoja carta) e incluye logotipo,
     identificación de la comunidad, período, resumen, detalle, avances,
     comentarios y fotografías.
   · El Excel (.xlsx real) respeta los filtros aplicados y contiene hojas de
     tareas, resumen por comunidad, avances e historial.
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util, M = CSN.model;
  var R = CSN.report = {};

  /* ---------- Filtro por defecto ---------- */
  R.filtroVacio = function () {
    var hoy = U.hoy();
    return {
      comunidadId: 'todas', desde: U.sumarDias(hoy, -30), hasta: hoy,
      estado: '', prioridad: '', semaforo: '',
      incluirAvances: true, incluirFotos: true, incluirHistorial: false
    };
  };

  /** Selecciona las tareas del informe aplicando los filtros indicados */
  R.tareasDelInforme = function (f) {
    f = f || {};
    var filtro = {
      comunidadId: f.comunidadId || 'todas',
      estado: f.estado || '', prioridad: f.prioridad || '', texto: f.texto || ''
    };
    if (f.semaforo === 'vencidas') filtro.vencidas = true;
    if (f.semaforo === 'proximas') filtro.proximas = true;
    if (f.fechas === 'vencimiento') {
      filtro.desde = f.desde; filtro.hasta = f.hasta;
    }
    var tareas = CSN.store.filtrarTareas(filtro);
    if (f.fechas !== 'vencimiento' && (f.desde || f.hasta)) {
      tareas = tareas.filter(function (t) {
        var ref = t.fechaCreacion || '';
        return (!f.desde || ref >= f.desde) && (!f.hasta || ref <= f.hasta);
      });
    }
    // Orden: comunidad, luego semáforo (vencidas primero) y fecha límite
    var conf = CSN.store.config();
    return U.ordenar(tareas, function (t) {
      var c = CSN.store.comunidad(t.comunidadId);
      return U.norm(c ? c.nombre : '') + '|' + M.semaforo(t, conf).orden + '|' + (t.fechaLimite || '9999-99-99');
    }, 'asc');
  };

  R.textoPeriodo = function (f) {
    if (!f.desde && !f.hasta) return 'Todos los registros';
    if (f.desde && f.hasta) return 'Del ' + U.fmtFecha(f.desde) + ' al ' + U.fmtFecha(f.hasta);
    return f.desde ? 'Desde el ' + U.fmtFecha(f.desde) : 'Hasta el ' + U.fmtFecha(f.hasta);
  };

  /* ---------- Bloques HTML ---------- */
  function semaforoHtml(t, conf) {
    var s = M.semaforo(t, conf);
    return '<span class="rpt-sem sem-' + s.color + '"></span>' + U.escapeHtml(s.texto);
  }
  function badge(clase, texto) {
    return '<span class="rpt-badge">' + U.escapeHtml(texto) + '</span>';
  }

  function cabeceraHtml(titulo, subtitulo) {
    var c = CSN.store.config();
    var logo = c.logo || 'assets/logo.png';
    return '' +
      '<div class="rpt-head">' +
      '<div class="rpt-brand">' +
      '<div class="rpt-emp">' + U.escapeHtml(c.empresa) + '</div>' +
      '<div class="rpt-sub">' + U.escapeHtml(c.nombreApp || 'Gestión de Tareas') + ' · Sistema de control y seguimiento de tareas</div>' +
      '<div class="rpt-doc">' + U.escapeHtml(titulo) + '</div>' +
      (subtitulo ? '<div class="rpt-sub">' + U.escapeHtml(subtitulo) + '</div>' : '') +
      '</div>' +
      '<div class="rpt-logo"><img src="' + U.attr(logo) + '" alt="Logotipo"></div>' +
      '</div>';
  }

  function kpisHtml(res) {
    var k = [
      { l: 'Total tareas', v: res.total, c: '' },
      { l: 'Pendientes', v: res.pendientes, c: '' },
      { l: 'En proceso', v: res.proceso, c: '' },
      { l: 'Vencidas', v: res.vencidas, c: 'danger' },
      { l: 'Próximas a vencer', v: res.proximas, c: 'warn' },
      { l: 'Completadas', v: res.completadas, c: 'ok' },
      { l: 'Urgentes', v: res.urgentes, c: 'danger' },
      { l: 'Cumplimiento', v: res.cumplimiento + '%', c: 'ok' }
    ];
    return '<div class="rpt-kpis">' + k.map(function (x) {
      return '<div class="rpt-kpi ' + x.c + '"><div class="l">' + U.escapeHtml(x.l) + '</div><div class="v">' + x.v + '</div></div>';
    }).join('') + '</div>';
  }

  function tablaResumenHtml(filas) {
    return '<table class="rpt-table"><thead><tr>' +
      '<th>Comunidad</th><th>Dirección</th><th>Total</th><th>Pend.</th><th>En proc.</th>' +
      '<th>Vencidas</th><th>Próx.</th><th>Compl.</th><th>Cumplimiento</th></tr></thead><tbody>' +
      filas.map(function (r) {
        var c = r.comunidad;
        return '<tr><td><b>' + U.escapeHtml(c.nombre) + '</b></td>' +
          '<td>' + U.escapeHtml((c.direccion || '') + (c.numero ? ' ' + c.numero : '') + (c.comuna ? ', ' + c.comuna : '')) + '</td>' +
          '<td>' + r.total + '</td><td>' + r.pendientes + '</td><td>' + r.proceso + '</td>' +
          '<td>' + r.vencidas + '</td><td>' + r.proximas + '</td><td>' + r.completadas + '</td>' +
          '<td><b>' + r.cumplimiento + '%</b></td></tr>';
      }).join('') +
      '</tbody></table>';
  }

  function tablaDetalleHtml(tareas, conf) {
    if (!tareas.length) return '<p class="rpt-note">No se registran tareas para los filtros seleccionados.</p>';
    return '<table class="rpt-table"><thead><tr>' +
      '<th style="width:22%">Tarea</th><th>Comunidad</th><th>Responsable</th><th>Creada</th><th>Límite</th>' +
      '<th>Prioridad</th><th>Estado</th><th>Avance</th><th>Semáforo</th></tr></thead><tbody>' +
      tareas.map(function (t) {
        var c = CSN.store.comunidad(t.comunidadId);
        return '<tr>' +
          '<td><b>' + U.escapeHtml(t.titulo) + '</b></td>' +
          '<td>' + U.escapeHtml(c ? c.nombre : '—') + '</td>' +
          '<td>' + U.escapeHtml(t.responsable || '—') + '</td>' +
          '<td>' + U.fmtFecha(t.fechaCreacion) + '</td>' +
          '<td>' + U.fmtFecha(t.fechaLimite) + '</td>' +
          '<td>' + U.escapeHtml(t.prioridad) + '</td>' +
          '<td>' + U.escapeHtml(t.estado) + '</td>' +
          '<td>' + (+t.avance || 0) + '%</td>' +
          '<td>' + semaforoHtml(t, conf) + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function fichaTareaHtml(t, conf, f) {
    var c = CSN.store.comunidad(t.comunidadId);
    var avances = f.incluirAvances ? CSN.store.avancesDe(t.id).slice().reverse() : [];
    var archivos = CSN.store.archivosDe(t.id);
    var fotos = archivos.filter(function (a) { return /^image\//.test(a.tipo || '') && (a.contenido || a.remoto); });
    var docs = archivos.filter(function (a) { return !/^image\//.test(a.tipo || ''); });
    var sem = M.semaforo(t, conf);

    var html = '<div class="rpt-task sem-' + sem.color + '">' +
      '<h4>' + U.escapeHtml(t.titulo) + '</h4>' +
      '<div class="rt-line"><b>Comunidad:</b> ' + U.escapeHtml(c ? c.nombre : '—') +
      ' &nbsp;·&nbsp; <b>Prioridad:</b> ' + U.escapeHtml(t.prioridad) +
      ' &nbsp;·&nbsp; <b>Estado:</b> ' + U.escapeHtml(t.estado) +
      ' &nbsp;·&nbsp; <b>Avance:</b> ' + (+t.avance || 0) + '%' +
      ' &nbsp;·&nbsp; <b>Semáforo:</b> ' + sem.texto + '</div>' +
      '<div class="rt-line"><b>Responsable:</b> ' + U.escapeHtml(t.responsable || 'Sin asignar') +
      ' &nbsp;·&nbsp; <b>Creada:</b> ' + U.fmtFecha(t.fechaCreacion) +
      ' &nbsp;·&nbsp; <b>Fecha límite:</b> ' + U.fmtFecha(t.fechaLimite) +
      (t.fechaCumplimiento ? ' &nbsp;·&nbsp; <b>Cumplida:</b> ' + U.fmtFecha(t.fechaCumplimiento) : '') + '</div>' +
      (t.descripcion ? '<div class="rt-line"><b>Descripción:</b> ' + U.escapeHtml(t.descripcion) + '</div>' : '') +
      (t.comentarioFinal ? '<div class="rt-line"><b>Comentario final:</b> ' + U.escapeHtml(t.comentarioFinal) + '</div>' : '');

    if (avances.length) {
      html += '<div class="rt-line" style="margin-top:1.5mm"><b>Seguimiento de avances</b></div>';
      avances.forEach(function (a) {
        html += '<div class="rpt-adv"><span class="ra">' + U.fmtFecha(a.fecha) + ' — ' + (+a.porcentaje || 0) + '%</span>' +
          ' · ' + U.escapeHtml(a.usuario || '') + '<br>' +
          U.escapeHtml(a.descripcion || '') + (a.comentario ? '<br><i>' + U.escapeHtml(a.comentario) + '</i>' : '') + '</div>';
      });
    }
    if (docs.length) {
      html += '<div class="rt-line" style="margin-top:1.5mm"><b>Documentos adjuntos:</b> ' +
        docs.map(function (d) { return U.escapeHtml(d.nombre); }).join(' · ') + '</div>';
    }
    if (f.incluirFotos && fotos.length) {
      html += '<div class="rpt-photos">' + fotos.slice(0, 8).map(function (p) {
        return '<figure><img src="' + U.attr(p.remoto || p.contenido) + '" alt="' + U.attr(p.nombre) + '">' +
          '<figcaption>' + U.escapeHtml(U.truncar(p.nombre, 34)) + ' · ' + U.fmtFecha(p.fecha) + '</figcaption></figure>';
      }).join('') + '</div>';
      if (fotos.length > 8) html += '<div class="rt-line rpt-note">Se incluyen 8 de ' + fotos.length + ' fotografías. El resto está disponible en el sistema.</div>';
    }
    return html + '</div>';
  }

  /* ---------- Cuerpo del informe ---------- */
  R.htmlInforme = function (f) {
    f = Object.assign(R.filtroVacio(), f || {});
    var conf = CSN.store.config();
    var tareas = R.tareasDelInforme(f);
    var esGeneral = !f.comunidadId || f.comunidadId === 'todas';
    var comunidad = esGeneral ? null : CSN.store.comunidad(f.comunidadId);
    var res = M.resumen(tareas, conf);

    var titulo = esGeneral ? 'Informe general de tareas' : 'Informe de tareas de la comunidad';
    var subtitulo = esGeneral
      ? 'Todas las comunidades administradas'
      : comunidad.nombre + ' — ' + (comunidad.direccion || '') + (comunidad.numero ? ' ' + comunidad.numero : '') +
        (comunidad.comuna ? ', ' + comunidad.comuna : '');

    var html = cabeceraHtml(titulo, subtitulo);
    var nComunidades = Object.keys(U.groupBy(tareas, function (t) { return t.comunidadId; })).length;

    // Identificación
    html += '<table class="rpt-meta">' +
      '<tr><td class="k">Comunidad</td><td>' + U.escapeHtml(esGeneral ? 'TODAS LAS COMUNIDADES' : comunidad.nombre) + '</td>' +
      '<td class="k">Período informado</td><td>' + U.escapeHtml(R.textoPeriodo(f)) + '</td></tr>' +
      '<tr><td class="k">Dirección</td><td>' + U.escapeHtml(esGeneral
        ? ('Comunidades incluidas en este informe: ' + nComunidades)
        : ((comunidad.direccion || '') + (comunidad.numero ? ' ' + comunidad.numero : ''))) + '</td>' +
      '<td class="k">Fecha de emisión</td><td>' + U.marca() + '</td></tr>' +
      '<tr><td class="k">Comuna / Ciudad</td><td>' + U.escapeHtml(esGeneral ? 'Varias' : ((comunidad.comuna || '') + ' / ' + (comunidad.ciudad || ''))) + '</td>' +
      '<td class="k">Filtros aplicados</td><td>' + U.escapeHtml([
        f.estado ? 'Estado: ' + f.estado : '', f.prioridad ? 'Prioridad: ' + f.prioridad : '',
        f.semaforo ? 'Semáforo: ' + f.semaforo : ''
      ].filter(Boolean).join(' · ') || 'Sin filtros adicionales') + '</td></tr>' +
      '<tr><td class="k">Emitido por</td><td>' + U.escapeHtml((CSN.store.sesion() || {}).nombre || 'Sistema') + '</td>' +
      '<td class="k">Contacto comunidad</td><td>' + U.escapeHtml(esGeneral ? '—' : [comunidad.presidente ? 'Presidente: ' + comunidad.presidente : '', comunidad.contacto || '', comunidad.telefono || ''].filter(Boolean).join(' · ')) + '</td></tr>' +
      '</table>';

    // Resumen
    html += '<div class="rpt-title">Resumen de tareas</div>' + kpisHtml(res);
    if (esGeneral) {
      var filasResumen = CSN.store.comunidades(true).map(function (cc) {
        var ts = tareas.filter(function (t) { return t.comunidadId === cc.id; });
        if (!ts.length) return null;
        var rr = M.resumen(ts, conf);
        rr.comunidad = cc;
        return rr;
      }).filter(Boolean);
      if (filasResumen.length) {
        html += '<div class="rpt-title">Resumen por comunidad</div>' + tablaResumenHtml(filasResumen);
      }
    }

    // Detalle en tabla
    html += '<div class="rpt-title">Detalle de tareas (' + tareas.length + ')</div>' + tablaDetalleHtml(tareas, conf);

    // Fichas con seguimiento
    if (tareas.length && (f.incluirAvances || f.incluirFotos)) {
      html += '<div class="rpt-title">Seguimiento detallado, avances y respaldo fotográfico</div>';
      html += tareas.map(function (t) { return fichaTareaHtml(t, conf, f); }).join('');
    }

    // Historial de modificaciones
    if (f.incluirHistorial && tareas.length) {
      html += '<div class="rpt-title">Historial de modificaciones</div>';
      html += '<table class="rpt-table"><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Tarea</th><th>Acción</th><th>Estado anterior</th><th>Estado nuevo</th><th>Comentario</th></tr></thead><tbody>' +
        tareas.reduce(function (acc, t) {
          return acc.concat(CSN.store.historialDe(t.id));
        }, []).map(function (h) {
          var t = CSN.store.tarea(h.tareaId);
          return '<tr><td>' + U.escapeHtml(h.fecha + ' ' + (h.hora || '')) + '</td><td>' + U.escapeHtml(h.usuario || '') + '</td>' +
            '<td>' + U.escapeHtml(t ? t.titulo : '—') + '</td><td>' + U.escapeHtml(h.accion || '') + '</td>' +
            '<td>' + U.escapeHtml(h.estadoAnterior || '—') + '</td><td>' + U.escapeHtml(h.estadoNuevo || '—') + '</td>' +
            '<td>' + U.escapeHtml(U.truncar(h.comentario || '', 120)) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }

    // Pie y firma
    html += '<div class="rpt-sign"><div>Firma Administración<br>' + U.escapeHtml(conf.firmante || 'Administrador') + '</div>' +
      '<div>Firma Comité / Presidencia<br>' + U.escapeHtml(esGeneral ? '' : (comunidad.presidente || '')) + '</div></div>';
    html += '<div class="rpt-foot"><span>' + U.escapeHtml(conf.pieInforme || '') + '</span>' +
      '<span>' + U.escapeHtml(conf.empresa) + ' · Emitido el ' + U.marca() + '</span></div>';

    return html;
  };

  /* ---------- Vista previa ---------- */
  R.vistaPrevia = function (f) {
    f = Object.assign(R.filtroVacio(), f || {});
    var html = R.htmlInforme(f);
    U.Modal.abrir({
      title: 'Vista previa del informe', icon: '📄', wide: true,
      body: '<div class="small muted mb">Revise el contenido antes de exportar. El PDF se genera en hoja carta vertical con el logotipo de la empresa.</div>' +
        '<div style="border:1px solid var(--c-line);border-radius:8px;padding:1rem;background:#fff;max-height:62vh;overflow:auto">' +
        '<div class="informe-preview">' + html + '</div></div>',
      footer: '<button class="btn" data-x="cerrar">Cerrar</button>' +
        '<button class="btn" data-x="excel">📊 EXPORTAR EXCEL</button>' +
        '<button class="btn btn-primary" data-x="pdf">📄 EXPORTAR PDF</button>',
      onOpen: function (modal) {
        modal.querySelector('[data-x="cerrar"]').onclick = function () { U.Modal.cerrar(); };
        modal.querySelector('[data-x="pdf"]').onclick = function () { U.Modal.cerrar(); R.exportarPDF(f); };
        modal.querySelector('[data-x="excel"]').onclick = function () { R.exportarExcel(f); };
      }
    });
  };

  /* ---------- Exportar PDF (impresión en hoja carta) ---------- */
  R.exportarPDF = function (f) {
    f = Object.assign(R.filtroVacio(), f || {});
    var root = U.$('#report-root');
    root.innerHTML = R.htmlInforme(f);
    var conf = CSN.store.config();
    var titulo = document.title;
    document.title = nombreArchivo(f, 'Informe');
    var restaurar = function () {
      document.title = titulo;
      root.innerHTML = '';
      global.removeEventListener('afterprint', restaurar);
    };
    global.addEventListener('afterprint', restaurar);
    setTimeout(function () {
      global.print();
      setTimeout(restaurar, 4000);
    }, 180);
    CSN.store.registrarBitacora('Informe PDF generado', R.descripcionFiltro(f));
    U.toast('Se abrió el diálogo de impresión. Seleccione «Guardar como PDF».', 'ok', 6000);
  };
  R.imprimirPDF = R.exportarPDF;

  R.descripcionFiltro = function (f) {
    f = f || {};
    var c = (!f.comunidadId || f.comunidadId === 'todas') ? 'Todas las comunidades' : ((CSN.store.comunidad(f.comunidadId) || {}).nombre || '');
    return c + ' · ' + R.textoPeriodo(f) + (f.estado ? ' · Estado: ' + f.estado : '') + (f.prioridad ? ' · Prioridad: ' + f.prioridad : '');
  };

  function nombreArchivo(f, prefijo) {
    var c = (!f.comunidadId || f.comunidadId === 'todas') ? 'General' : U.slug((CSN.store.comunidad(f.comunidadId) || {}).nombre || '');
    return prefijo + '_' + c + '_' + U.hoy();
  }

  /* ---------- Exportar Excel ---------- */
  R.libroExcel = function (f) {
    f = Object.assign(R.filtroVacio(), f || {});
    var conf = CSN.store.config();
    var tareas = R.tareasDelInforme(f);
    var esGeneral = !f.comunidadId || f.comunidadId === 'todas';
    var comunidad = esGeneral ? null : CSN.store.comunidad(f.comunidadId);

    var hojaTareas = {
      nombre: 'Tareas',
      subtitulo: R.descripcionFiltro(f),
      columnas: [
        { t: 'Comunidad', w: 18 }, { t: 'Tarea', w: 42 }, { t: 'Descripción', w: 46 },
        { t: 'Fecha creación', w: 14 }, { t: 'Fecha vencimiento', w: 16 }, { t: 'Prioridad', w: 11 },
        { t: 'Estado', w: 20 }, { t: 'Responsable', w: 26 }, { t: 'Avance (%)', w: 11 },
        { t: 'Fecha cumplimiento', w: 17 }, { t: 'Semáforo', w: 20 }, { t: 'Comentarios', w: 46 },
        { t: 'N° avances', w: 11 }, { t: 'N° fotos', w: 10 }, { t: 'Documentos', w: 26 }
      ],
      filas: tareas.map(function (t) {
        var c = CSN.store.comunidad(t.comunidadId);
        var arch = CSN.store.archivosDe(t.id);
        var fotos = arch.filter(function (a) { return /^image\//.test(a.tipo || ''); });
        var docs = arch.filter(function (a) { return !/^image\//.test(a.tipo || ''); });
        return [
          c ? c.nombre : '—', t.titulo, t.descripcion || '', U.fmtFecha(t.fechaCreacion), U.fmtFecha(t.fechaLimite),
          t.prioridad, t.estado, t.responsable || '', +t.avance || 0,
          t.fechaCumplimiento ? U.fmtFecha(t.fechaCumplimiento) : '',
          M.semaforo(t, conf).texto, t.comentarioFinal || '',
          CSN.store.avancesDe(t.id).length, fotos.length, docs.map(function (d) { return d.nombre; }).join(' · ')
        ];
      }),
      totales: (function () {
        var fila = [];
        fila[0] = 'TOTAL DE TAREAS';
        fila[1] = tareas.length;
        fila[8] = tareas.length ? Math.round(tareas.reduce(function (a, t) { return a + (+t.avance || 0); }, 0) / tareas.length) : 0;
        return fila;
      })()
    };

    var hojaResumen = {
      nombre: 'Resumen',
      subtitulo: R.descripcionFiltro(f),
      columnas: [
        { t: 'Comunidad', w: 20 }, { t: 'Dirección', w: 34 }, { t: 'Comuna', w: 16 },
        { t: 'Total', w: 9 }, { t: 'Pendientes', w: 12 }, { t: 'En proceso', w: 12 },
        { t: 'Pend. terceros', w: 15 }, { t: 'Vencidas', w: 11 }, { t: 'Próximas', w: 11 },
        { t: 'Urgentes', w: 11 }, { t: 'Completadas', w: 13 }, { t: 'Canceladas', w: 12 },
        { t: 'Cumplimiento (%)', w: 17 }, { t: 'Avance promedio (%)', w: 19 }
      ],
      filas: (esGeneral ? CSN.store.comunidades(true) : [comunidad]).filter(Boolean).map(function (c) {
        var ts = tareas.filter(function (t) { return t.comunidadId === c.id; });
        var r = M.resumen(ts, conf);
        return [c.nombre, (c.direccion || '') + (c.numero ? ' ' + c.numero : ''), c.comuna || '', r.total, r.pendientes, r.proceso,
          r.terceros, r.vencidas, r.proximas, r.urgentes, r.completadas, r.canceladas, r.cumplimiento, r.avancePromedio];
      })
    };
    if (esGeneral) {
      var rt = M.resumen(tareas, conf);
      hojaResumen.totales = ['TOTAL GENERAL', '', '', rt.total, rt.pendientes, rt.proceso, rt.terceros, rt.vencidas,
        rt.proximas, rt.urgentes, rt.completadas, rt.canceladas, rt.cumplimiento, rt.avancePromedio];
    }

    var hojas = [hojaTareas, hojaResumen];

    if (f.incluirAvances) {
      var avances = [];
      tareas.forEach(function (t) {
        CSN.store.avancesDe(t.id).forEach(function (a) {
          var c = CSN.store.comunidad(t.comunidadId);
          avances.push([c ? c.nombre : '', t.titulo, U.fmtFecha(a.fecha), a.hora || '', a.usuario || '', +a.porcentaje || 0,
            a.descripcion || '', a.comentario || '', CSN.store.archivosDeAvance(a.id).length]);
        });
      });
      avances.sort(function (a, b) { return String(b[2] + b[3]).localeCompare(String(a[2] + a[3])); });
      hojas.push({
        nombre: 'Avances',
        subtitulo: 'Seguimiento cronológico de avances · ' + R.descripcionFiltro(f),
        columnas: [{ t: 'Comunidad', w: 18 }, { t: 'Tarea', w: 40 }, { t: 'Fecha', w: 13 }, { t: 'Hora', w: 9 },
          { t: 'Usuario', w: 22 }, { t: 'Avance (%)', w: 11 }, { t: 'Descripción', w: 46 }, { t: 'Comentario', w: 46 }, { t: 'Archivos', w: 10 }],
        filas: avances
      });
    }

    if (f.incluirHistorial) {
      var historial = [];
      tareas.forEach(function (t) {
        CSN.store.historialDe(t.id).forEach(function (h) {
          var c = CSN.store.comunidad(t.comunidadId);
          historial.push([U.fmtFecha(h.fecha), h.hora || '', h.usuario || '', c ? c.nombre : '', t.titulo, h.accion || '',
            h.estadoAnterior || '', h.estadoNuevo || '', h.comentario || '', h.dispositivo || '']);
        });
      });
      hojas.push({
        nombre: 'Historial',
        subtitulo: 'Historial de modificaciones · ' + R.descripcionFiltro(f),
        columnas: [{ t: 'Fecha', w: 12 }, { t: 'Hora', w: 8 }, { t: 'Usuario', w: 22 }, { t: 'Comunidad', w: 18 },
          { t: 'Tarea', w: 40 }, { t: 'Acción', w: 30 }, { t: 'Estado anterior', w: 18 }, { t: 'Estado nuevo', w: 18 },
          { t: 'Comentario', w: 52 }, { t: 'Dispositivo', w: 20 }],
        filas: historial
      });
    }

    return {
      titulo: 'Gestión de Tareas — ' + R.descripcionFiltro(f),
      empresa: conf.empresa,
      hojas: hojas
    };
  };

  R.exportarExcel = function (f) {
    f = Object.assign(R.filtroVacio(), f || {});
    var libro = R.libroExcel(f);
    return CSN.xlsx.descargar(libro, nombreArchivo(f, 'Informe') + '.xlsx').then(function (blob) {
      CSN.store.registrarBitacora('Informe Excel generado', R.descripcionFiltro(f));
      U.toast('Planilla Excel generada (' + libro.hojas.length + ' hojas)', 'ok');
      return blob;
    }).catch(function (e) {
      U.toast('No fue posible generar el Excel: ' + e.message, 'err');
      throw e;
    });
  };

  /* ---------- Exportar la ficha de una tarea ---------- */
  R.informeTarea = function (tareaId) {
    var t = CSN.store.tarea(tareaId);
    if (!t) { U.toast('Tarea no encontrada', 'err'); return; }
    var conf = CSN.store.config();
    var c = CSN.store.comunidad(t.comunidadId);
    var html = cabeceraHtml('Ficha de tarea',
      (c ? c.nombre + ' — ' : '') + t.titulo);
    html += '<table class="rpt-meta">' +
      '<tr><td class="k">Comunidad</td><td>' + U.escapeHtml(c ? c.nombre : '—') + '</td><td class="k">Fecha de emisión</td><td>' + U.marca() + '</td></tr>' +
      '<tr><td class="k">Tarea</td><td>' + U.escapeHtml(t.titulo) + '</td><td class="k">Prioridad</td><td>' + U.escapeHtml(t.prioridad) + '</td></tr>' +
      '</table>';
    html += fichaTareaHtml(t, conf, { incluirAvances: true, incluirFotos: true });
    if (CSN.store.historialDe(t.id).length) {
      html += '<div class="rpt-title">Historial de modificaciones</div><table class="rpt-table"><thead><tr>' +
        '<th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Anterior</th><th>Nuevo</th><th>Comentario</th></tr></thead><tbody>' +
        CSN.store.historialDe(t.id).map(function (h) {
          return '<tr><td>' + U.escapeHtml(h.fecha + ' ' + (h.hora || '')) + '</td><td>' + U.escapeHtml(h.usuario || '') + '</td>' +
            '<td>' + U.escapeHtml(h.accion || '') + '</td><td>' + U.escapeHtml(h.estadoAnterior || '—') + '</td>' +
            '<td>' + U.escapeHtml(h.estadoNuevo || '—') + '</td><td>' + U.escapeHtml(h.comentario || '') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    html += '<div class="rpt-foot"><span>' + U.escapeHtml(conf.pieInforme || '') + '</span><span>' + U.escapeHtml(conf.empresa) + '</span></div>';
    var root = U.$('#report-root');
    root.innerHTML = html;
    var titulo = document.title;
    document.title = 'Ficha_' + U.slug(t.titulo) + '_' + U.hoy();
    var restaurar = function () { document.title = titulo; root.innerHTML = ''; global.removeEventListener('afterprint', restaurar); };
    global.addEventListener('afterprint', restaurar);
    setTimeout(function () { global.print(); setTimeout(restaurar, 4000); }, 160);
  };
})(typeof window !== 'undefined' ? window : globalThis);
