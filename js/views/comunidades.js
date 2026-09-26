/* ==========================================================================
   views/comunidades.js – Módulo COMUNIDADES y panel individual de cada una
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util, M = CSN.model, UI = CSN.ui;
  var V = CSN.views = CSN.views || {};

  var Vc = V.comunidades = {};

  /* ================= Listado ================= */
  Vc.render = function (cont, params) {
    params = params || {};
    var texto = params.texto || '';
    var comunidades = CSN.store.comunidades(true);
    if (texto) {
      var q = U.norm(texto);
      comunidades = comunidades.filter(function (c) {
        return U.norm([c.nombre, c.direccion, c.comuna, c.ciudad, c.presidente, c.contacto, c.email].join(' ')).indexOf(q) >= 0;
      });
    }
    var conf = CSN.store.config();

    var tarjetas = comunidades.map(function (c) {
      var r = CSN.store.estadisticasComunidad(c.id);
      return '<div class="card" data-comunidad="' + U.attr(c.id) + '" style="cursor:pointer">' +
        '<div class="card-h"><h3>' + U.escapeHtml(c.nombre) + '</h3>' +
        '<span class="badge ' + (c.estado === 'Inactiva' ? 'b-inactiva' : 'b-activa') + '">' + U.escapeHtml(c.estado) + '</span></div>' +
        '<div class="small muted mb">📍 ' + U.escapeHtml((c.direccion || '') + (c.numero ? ' ' + c.numero : '') + (c.comuna ? ', ' + c.comuna : '') + (c.ciudad ? ' · ' + c.ciudad : '')) + '</div>' +
        '<div class="grid grid-4" style="gap:.4rem">' +
        '<div class="card tight center"><div class="small muted">Tareas</div><b>' + r.total + '</b></div>' +
        '<div class="card tight center"><div class="small muted">Vencidas</div><b style="color:var(--c-danger)">' + r.vencidas + '</b></div>' +
        '<div class="card tight center"><div class="small muted">Próximas</div><b style="color:var(--c-warn)">' + r.proximas + '</b></div>' +
        '<div class="card tight center"><div class="small muted">Cumpl.</div><b style="color:var(--c-ok)">' + r.cumplimiento + '%</b></div>' +
        '</div>' +
        '<div class="btn-group mt">' +
        '<button class="btn btn-sm btn-primary" data-accion="panel" data-id="' + U.attr(c.id) + '">Ver panel</button>' +
        (CSN.store.puede('comunidad.editar') ? '<button class="btn btn-sm" data-accion="editar" data-id="' + U.attr(c.id) + '">✏️ Editar</button>' +
          '<button class="btn btn-sm" data-accion="estado" data-id="' + U.attr(c.id) + '">' + (c.estado === 'Inactiva' ? '✅ Activar' : '🚫 Desactivar') + '</button>' : '') +
        (CSN.store.puede('comunidad.eliminar') ? '<button class="btn btn-sm btn-danger" data-accion="eliminar" data-id="' + U.attr(c.id) + '">🗑</button>' : '') +
        '</div></div>';
    }).join('');

    cont.innerHTML = UI.encabezado('COMUNIDADES',
      'Registro de comunidades administradas. <b>' + comunidades.length + '</b> registradas. Umbral de «próxima a vencer»: <b>' + conf.umbralDias + ' días</b>.',
      (CSN.store.puede('comunidad.crear') ? '<button class="btn btn-primary" data-accion="nueva">+ NUEVA COMUNIDAD</button>' : '') +
      '<button class="btn" data-accion="informe">📊 INFORME GENERAL</button>') +
      '<div class="card tight mb"><div class="filters">' +
      '<div class="field grow"><label>Buscar comunidad</label><input type="search" data-campo="texto" value="' + U.attr(texto) + '" placeholder="Nombre, dirección, comuna, presidente…"></div>' +
      '</div></div>' +
      (comunidades.length ? '<div class="grid grid-auto">' + tarjetas + '</div>' : UI.vacio('No hay comunidades registradas.', '🏢'));

    var inp = U.$('[data-campo="texto"]', cont);
    if (inp) inp.oninput = U.debounce(function () { Vc.render(cont, { texto: inp.value }); }, 300);

    cont.onclick = function (e) {
      var b = e.target.closest('[data-accion]');
      if (!b) return;
      var accion = b.getAttribute('data-accion');
      var id = b.getAttribute('data-id');
      if (accion === 'nueva') Vc.formulario(null, function () { Vc.render(cont, params); });
      else if (accion === 'editar') Vc.formulario(id, function () { Vc.render(cont, params); });
      else if (accion === 'panel') CSN.app.ir('comunidad', { id: id });
      else if (accion === 'estado') {
        CSN.store.desactivarComunidad(id).then(function (c) {
          U.toast('Comunidad ' + c.nombre + ' ahora está ' + c.estado.toLowerCase(), 'ok');
          Vc.render(cont, params);
        }).catch(function (err) { U.toast(err.message, 'err'); });
      } else if (accion === 'eliminar') {
        var c = CSN.store.comunidad(id);
        U.Modal.confirmar({
          titulo: 'Eliminar comunidad', peligro: true, textoOk: 'Eliminar',
          mensaje: '¿Eliminar la comunidad «' + (c ? c.nombre : '') + '»?',
          detalle: 'Las tareas asociadas dejarán de mostrarse en el listado. Se recomienda desactivarla en lugar de eliminarla.'
        }).then(function (ok) {
          if (!ok) return;
          CSN.store.eliminarComunidad(id).then(function () {
            U.toast('Comunidad eliminada', 'ok'); Vc.render(cont, params);
          }).catch(function (err) { U.toast(err.message, 'err'); });
        });
      } else if (accion === 'informe') CSN.views.informes.vista({ comunidadId: 'todas' });
    };
  };

  /* ================= Panel individual de la comunidad ================= */
  Vc.renderPanel = function (cont, params) {
    var c = CSN.store.comunidad(params.id);
    if (!c) { cont.innerHTML = '<div class="alert-box alert-danger">La comunidad no está disponible.</div>'; return; }
    var conf = CSN.store.config();
    var tareas = CSN.store.tareasDe(c.id);
    var r = M.resumen(tareas, conf);
    var orden = params.orden || 'semaforo', dir = params.dir || 'asc';
    var listado = CSN.store.ordenarTareas(tareas, orden, dir);
    var proximas = CSN.store.ordenarTareas(tareas.filter(function (t) {
      var s = M.semaforo(t, conf); return s.color === 'amarillo' || s.color === 'rojo';
    }), 'vencimiento', 'asc').slice(0, 6);

    cont.innerHTML = '' +
      UI.encabezado('COMUNIDAD ' + c.nombre,
        '📍 ' + U.escapeHtml((c.direccion || '') + (c.numero ? ' ' + c.numero : '') + (c.comuna ? ', ' + c.comuna : '') + (c.ciudad ? ' · ' + c.ciudad : '')) +
        ' · <span class="badge ' + (c.estado === 'Inactiva' ? 'b-inactiva' : 'b-activa') + '">' + U.escapeHtml(c.estado) + '</span>',
        '<button class="btn" data-accion="volver">← Comunidades</button>' +
        (CSN.store.puede('tarea.crear') ? '<button class="btn btn-primary" data-accion="nueva-tarea">+ NUEVA TAREA</button>' : '') +
        '<button class="btn" data-accion="pdf">📄 PDF</button>' +
        '<button class="btn" data-accion="excel">📊 EXCEL</button>' +
        (CSN.store.puede('comunidad.editar') ? '<button class="btn" data-accion="editar">✏️ Editar comunidad</button>' : '')) +

      UI.kpiCuadricula([
        { label: 'Tareas pendientes', valor: r.pendientes, clase: 'k-primary', pista: 'Incluye vencidas' },
        { label: 'En proceso', valor: r.proceso + r.terceros, clase: 'k-info', pista: r.terceros + ' pendiente(s) de terceros' },
        { label: 'Vencidas', valor: r.vencidas, clase: 'k-danger', pista: 'Plazo superado sin completar' },
        { label: 'Completadas', valor: r.completadas, clase: 'k-ok', pista: 'Historial conservado' },
        { label: 'Urgentes', valor: r.urgentes, clase: 'k-accent', pista: 'Prioridad urgente abiertas' },
        { label: 'Próximos vencimientos', valor: r.proximas, clase: 'k-warn', pista: 'Dentro de ' + conf.umbralDias + ' días' },
        { label: 'Total de tareas', valor: r.total, clase: 'k-primary', pista: 'Todas las registradas' },
        { label: 'Cumplimiento', valor: r.cumplimiento + '%', clase: 'k-ok', pista: 'Avance promedio: ' + r.avancePromedio + '%' }
      ]) +

      '<div class="grid grid-2 mt-lg">' +
      '<div class="card"><div class="card-h"><h2>Distribución por estado</h2></div>' +
      UI.anillo(M.ESTADOS.map(function (e) {
        return { etiqueta: e.id, valor: tareas.filter(function (t) { return t.estado === e.id; }).length, color: UI.COLORES_ESTADO[e.id] };
      }), 'Tareas por estado', 'tareas') + '</div>' +
      '<div class="card"><div class="card-h"><h2>Focos de atención</h2></div>' +
      (proximas.length ? '<div class="stack">' + proximas.map(function (t) {
        return '<div class="task-card ' + M.semaforo(t, conf).clase + '" data-tarea="' + U.attr(t.id) + '">' +
          '<div class="tc-title">' + U.escapeHtml(t.titulo) + '</div>' +
          '<div class="tc-meta">' + UI.semaforo(t) + UI.badgePrioridad(t.prioridad) + UI.badgeEstado(t.estado) + '</div></div>';
      }).join('') + '</div>' : '<p class="muted small">No hay tareas vencidas ni próximas a vencer. 👍</p>') + '</div>' +
      '</div>' +

      '<div class="card mt-lg"><div class="card-h"><h2>Tareas de la comunidad</h2>' +
      '<div class="actions"><div class="chip-row" data-grupo="estado">' +
      '<button class="chip' + (!params.estado ? ' active' : '') + '" data-filtro="estado" data-valor="">Todas</button>' +
      '<button class="chip' + (params.estado === 'abiertas' ? ' active' : '') + '" data-filtro="estado" data-valor="abiertas">Abiertas</button>' +
      '<button class="chip' + (params.estado === 'vencidas' ? ' active' : '') + '" data-filtro="estado" data-valor="vencidas">Vencidas</button>' +
      '<button class="chip' + (params.estado === 'Completada' ? ' active' : '') + '" data-filtro="estado" data-valor="Completada">Completadas</button>' +
      '</div></div></div>' +
      '<div id="panel-tareas">' + UI.listaTareas(filtrarPanel(tareas, params), { orden: orden, dir: dir }) + '</div></div>' +

      '<div class="grid grid-2 mt-lg">' +
      '<div class="card"><div class="card-h"><h2>Antecedentes de la comunidad</h2>' +
      (CSN.store.puede('comunidad.editar') ? '<button class="btn btn-sm" data-accion="editar">✏️</button>' : '') + '</div>' +
      '<dl class="kv">' +
      '<dt>ID de comunidad</dt><dd class="mono">' + U.escapeHtml(c.id) + '</dd>' +
      '<dt>Dirección</dt><dd>' + U.escapeHtml((c.direccion || '—') + (c.numero ? ' ' + c.numero : '')) + '</dd>' +
      '<dt>Comuna</dt><dd>' + U.escapeHtml(c.comuna || '—') + '</dd>' +
      '<dt>Ciudad</dt><dd>' + U.escapeHtml(c.ciudad || '—') + '</dd>' +
      '<dt>Teléfono</dt><dd>' + U.escapeHtml(c.telefono || '—') + '</dd>' +
      '<dt>Correo</dt><dd>' + U.escapeHtml(c.email || '—') + '</dd>' +
      '<dt>Presidente del Comité</dt><dd>' + U.escapeHtml(c.presidente || '—') + '</dd>' +
      '<dt>Contacto principal</dt><dd>' + U.escapeHtml(c.contacto || '—') + '</dd>' +
      '<dt>Fecha de creación</dt><dd>' + U.fmtFecha(c.fechaCreacion) + '</dd>' +
      '<dt>Observaciones</dt><dd>' + U.escapeHtml(c.observaciones || '—') + '</dd>' +
      '<dt>Última modificación</dt><dd>' + U.escapeHtml((c._marca || '—') + ' · ' + (c._by || '')) + '</dd>' +
      '</dl></div>' +
      '<div class="card"><div class="card-h"><h2>Actividad reciente</h2></div>' +
      UI.listaHistorial(CSN.store.historialGlobal({ comunidadId: c.id }), 12) + '</div>' +
      '</div>';

    // Filtros rápidos del panel
    U.$$('[data-filtro]', cont).forEach(function (chip) {
      chip.onclick = function () {
        var p = Object.assign({}, params, { estado: chip.getAttribute('data-valor') || undefined });
        Vc.renderPanel(cont, p);
      };
    });
    U.$$('th.sortable', cont).forEach(function (th) {
      th.onclick = function () {
        var campo = th.getAttribute('data-orden');
        Vc.renderPanel(cont, Object.assign({}, params, {
          orden: campo, dir: (params.orden === campo && params.dir === 'asc') ? 'desc' : 'asc'
        }));
      };
    });
    cont.onclick = function (e) {
      var b = e.target.closest('[data-accion]');
      if (!b) return;
      var a = b.getAttribute('data-accion');
      if (a === 'volver') CSN.app.ir('comunidades');
      else if (a === 'nueva-tarea') V.tareas.formulario({ comunidadId: c.id, onListo: function () { Vc.renderPanel(cont, params); } });
      else if (a === 'editar') Vc.formulario(c.id, function () { Vc.renderPanel(cont, params); });
      else if (a === 'pdf') CSN.views.informes.vista({ comunidadId: c.id });
      else if (a === 'excel') CSN.views.informes.vista({ comunidadId: c.id });
    };
  };

  function filtrarPanel(tareas, params) {
    var conf = CSN.store.config();
    if (params.estado === 'abiertas') return tareas.filter(function (t) { return !M.esCerrada(t.estado); });
    if (params.estado === 'vencidas') return tareas.filter(function (t) { return M.semaforo(t, conf).color === 'rojo'; });
    if (params.estado === 'completadas') return tareas.filter(function (t) { return t.estado === 'Completada'; });
    if (params.estado) return tareas.filter(function (t) { return t.estado === params.estado; });
    return tareas;
  }

  /* ================= Formulario ================= */
  Vc.formulario = function (id, cb) {
    var c = id ? CSN.store.comunidad(id) : M.nuevaComunidad({}, CSN.store.sesion());
    if (id && !c) { U.toast('Comunidad no encontrada', 'err'); return; }
    U.Modal.abrir({
      title: id ? 'Editar comunidad' : 'Nueva comunidad', icon: '🏢', wide: true,
      body: '<form id="form-comunidad" class="form-grid">' +
        UI.campo({ nombre: 'nombre', label: 'Nombre de la comunidad', requerido: true, valor: c.nombre, placeholder: 'Ej: ATALAYA', ancho: 2 }) +
        UI.campo({ nombre: 'direccion', label: 'Dirección', valor: c.direccion, placeholder: 'Calle o avenida' }) +
        UI.campo({ nombre: 'numero', label: 'Número', valor: c.numero }) +
        UI.campo({ nombre: 'comuna', label: 'Comuna', valor: c.comuna }) +
        UI.campo({ nombre: 'ciudad', label: 'Ciudad', valor: c.ciudad }) +
        UI.campo({ nombre: 'telefono', label: 'Teléfono', tipo: 'tel', valor: c.telefono }) +
        UI.campo({ nombre: 'email', label: 'Correo electrónico', tipo: 'email', valor: c.email }) +
        UI.campo({ nombre: 'presidente', label: 'Presidente del Comité', valor: c.presidente }) +
        UI.campo({ nombre: 'contacto', label: 'Contacto principal', valor: c.contacto, placeholder: 'Nombre y cargo del contacto' }) +
        UI.campo({ nombre: 'estado', label: 'Estado', tipo: 'select', valor: c.estado, opcionesHtml: "<option value='Activa'>Activa</option><option value='Inactiva'>Inactiva</option>" }) +
        UI.campo({ nombre: 'observaciones', label: 'Observaciones', tipo: 'textarea', valor: c.observaciones, ancho: 2, placeholder: 'Número de unidades, torres, particularidades, etc.' }) +
        (id ? '<div class="field col-2"><label>Identificador</label><input type="text" value="' + U.attr(c.id) + '" disabled></div>' : '') +
        '</form>',
      footer: '<button class="btn" data-x="cancelar">Cancelar</button><button class="btn btn-primary" data-x="guardar">' + (id ? 'Guardar cambios' : 'CREAR COMUNIDAD') + '</button>',
      onOpen: function (modal) {
        modal.querySelector('[data-x="cancelar"]').onclick = function () { U.Modal.cerrar(); };
        var btn = modal.querySelector('[data-x="guardar"]');
        btn.onclick = function () {
          var datos = UI.leerCampos(modal.querySelector('#form-comunidad'));
          if (id) datos.id = id;
          btn.disabled = true;
          Promise.resolve().then(function () { return CSN.store.guardarComunidad(datos); })
            .then(function (r) {
              U.Modal.cerrar();
              U.toast(id ? 'Comunidad actualizada' : 'Comunidad creada: ' + r.nombre, 'ok');
              if (cb) cb(r);
            }).catch(function (e) { btn.disabled = false; U.toast(e.message, 'err'); });
        };
      }
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
