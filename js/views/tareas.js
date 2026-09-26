/* ==========================================================================
   views/tareas.js – Módulo TAREAS
   Listado con filtros y ordenamiento, ficha completa de la tarea, registro de
   avances, fotografías, documentos, cierre de tarea e historial.
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util, M = CSN.model, UI = CSN.ui;
  var V = CSN.views = CSN.views || {};

  var filtros = {
    comunidadId: 'todas', estado: '', prioridad: '', semaforo: '', texto: '',
    orden: 'semaforo', dir: 'asc'
  };

  var Vt = V.tareas = {
    filtros: filtros,
    reiniciarFiltros: function (patch) {
      filtros = V.tareas.filtros = Object.assign({
        comunidadId: 'todas', estado: '', prioridad: '', semaforo: '', texto: '', orden: 'semaforo', dir: 'asc'
      }, patch || {});
      return filtros;
    }
  };

  /* ================= Listado ================= */
  Vt.render = function (cont, params) {
    params = params || {};
    if (params.comunidadId) filtros.comunidadId = params.comunidadId;
    if (params.estado) filtros.estado = params.estado;
    if (params.prioridad) filtros.prioridad = params.prioridad;
    if (params.semaforo) filtros.semaforo = params.semaforo;
    if (params.pendientes) filtros.semaforo = '';
    if (params.texto !== undefined) filtros.texto = params.texto;

    var filtro = {
      comunidadId: filtros.comunidadId, estado: filtros.estado, prioridad: filtros.prioridad,
      texto: filtros.texto, orden: filtros.orden, dir: filtros.dir
    };
    if (filtros.semaforo === 'vencidas') filtro.vencidas = true;
    if (filtros.semaforo === 'proximas') filtro.proximas = true;
    if (filtros.semaforo === 'completadas') filtro.completadas = true;
    if (filtros.semaforo === 'abiertas') filtro.abiertas = true;
    if (params.pendientes) filtro.pendientes = true;
    if (params.abiertas) filtro.abiertas = true;
    if (params.urgentes) filtro.urgentes = true;
    if (params.vencidas) filtro.vencidas = true;
    if (params.completadas) filtro.completadas = true;

    var tareas = CSN.store.filtrarTareas(filtro);
    var conf = CSN.store.config();

    cont.innerHTML = UI.encabezado(
      params.titulo || 'TAREAS',
      'Control y seguimiento de todas las tareas de las comunidades administradas. ' +
      '<b>' + tareas.length + '</b> tarea(s) con los filtros aplicados.',
      (CSN.store.puede('tarea.crear') ? '<button class="btn btn-primary" data-accion="nueva">+ NUEVA TAREA</button>' : '') +
      '<button class="btn" data-accion="informe">📊 INFORME</button>'
    ) +
      '<div class="card tight mb">' +
      '<div class="filters">' +
      '<div class="field"><label>Comunidad</label>' + UI.selectComunidades(filtros.comunidadId, true) + '</div>' +
      '<div class="field"><label>Estado</label>' + UI.selectEstados(filtros.estado, 'Todos los estados') + '</div>' +
      '<div class="field"><label>Prioridad</label>' + UI.selectPrioridades(filtros.prioridad, 'Todas') + '</div>' +
      '<div class="field grow"><label>Buscar en tareas</label><input type="search" data-campo="texto" value="' + U.attr(filtros.texto) + '" placeholder="Título, descripción, responsable, comentario…"></div>' +
      '<div class="field"><label>Semáforo</label><select data-campo="semaforo">' +
      [['', 'Todos'], ['abiertas', 'Abiertas'], ['proximas', '🟡 Próximas a vencer'], ['vencidas', '🔴 Vencidas'], ['completadas', '✔ Completadas']]
        .map(function (o) { return '<option value="' + o[0] + '"' + (filtros.semaforo === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></div>' +
      '<button class="btn" data-accion="limpiar">Limpiar</button>' +
      '</div></div>' +
      '<div id="lista-tareas">' + UI.listaTareas(tareas, { orden: filtros.orden, dir: filtros.dir }) + '</div>';

    // Filtros
    U.$$('[data-campo]', cont).forEach(function (el) {
      el.onchange = function () {
        filtros[el.getAttribute('data-campo')] = el.value;
        Vt.render(cont, params);
      };
      if (el.type === 'search') {
        el.oninput = U.debounce(function () { filtros.texto = el.value; Vt.render(cont, params); }, 320);
      }
    });
    // Ordenamiento por columna
    U.$$('th.sortable', cont).forEach(function (th) {
      th.onclick = function () {
        var campo = th.getAttribute('data-orden');
        if (filtros.orden === campo) filtros.dir = filtros.dir === 'asc' ? 'desc' : 'asc';
        else { filtros.orden = campo; filtros.dir = 'asc'; }
        Vt.render(cont, params);
      };
    });
    // Acciones
    var mapa = {
      nueva: function () { Vt.formulario({ onListo: function () { Vt.render(cont, params); } }); },
      limpiar: function () { Vt.reiniciarFiltros(); Vt.render(cont, params); },
      informe: function () { CSN.views.informes.abrirConFiltro(filtros); }
    };
    cont.onclick = function (e) {
      var b = e.target.closest('[data-accion]');
      if (b && mapa[b.getAttribute('data-accion')]) { mapa[b.getAttribute('data-accion')](); return; }
    };
  };

  /* ================= Ficha de la tarea ================= */
  Vt.ficha = function (id) {
    var m = U.Modal.abrir({
      title: 'Ficha de la tarea', icon: '📋', wide: true,
      body: '<div id="ficha-tarea"></div>',
      footer: '<button class="btn" data-x="cerrar">Cerrar</button>' +
        '<button class="btn" data-x="editar">✏️ Editar</button>' +
        '<button class="btn btn-primary" data-x="pdf">📄 FICHA PDF</button>',
      onOpen: function (modal) {
        modal.querySelector('[data-x="cerrar"]').onclick = function () { U.Modal.cerrar(); };
        modal.querySelector('[data-x="editar"]').onclick = function () {
          if (!CSN.store.puede('tarea.editar')) { U.toast('Su perfil no permite editar tareas', 'warn'); return; }
          Vt.formulario({ id: id, onListo: function () { pintar(id); } });
        };
        modal.querySelector('[data-x="pdf"]').onclick = function () { CSN.report.informeTarea(id); };
      }
    });
    pintar(id);

    function pintar(tid) {
      var cont = U.$('#ficha-tarea', m.modal);
      var t = CSN.store.tarea(tid);
      if (!t) { cont.innerHTML = '<div class="alert-box alert-danger">La tarea ya no está disponible.</div>'; return; }
      var c = CSN.store.comunidad(t.comunidadId);
      var conf = CSN.store.config();
      var sem = M.semaforo(t, conf);
      var avances = CSN.store.avancesDe(t.id);
      var archivos = CSN.store.archivosDe(t.id);
      var fotos = archivos.filter(function (a) { return /^image\//.test(a.tipo || ''); });
      var docs = archivos.filter(function (a) { return !/^image\//.test(a.tipo || ''); });
      var puedeEditar = CSN.store.puede('tarea.editar');

      var html = '' +
        '<div class="flex between items-center gap mb flex-wrap">' +
        '<div><h2 style="margin-bottom:.15rem">' + U.escapeHtml(t.titulo) + '</h2>' +
        '<div class="small muted">🏢 ' + U.escapeHtml(c ? c.nombre : 'Sin comunidad') +
        (c ? ' · ' + U.escapeHtml((c.direccion || '') + (c.numero ? ' ' + c.numero : '') + (c.comuna ? ', ' + c.comuna : '')) : '') + '</div></div>' +
        '<div>' + UI.badgeEstado(t.estado) + ' ' + UI.badgePrioridad(t.prioridad) + '</div></div>' +
        (t._conflicto ? '<div class="alert-box alert-warn mb"><b>⚠ Este registro tuvo un conflicto de sincronización.</b> Revise <b>Configuración → Conflictos</b> para comparar versiones.</div>' : '') +
        '<div class="grid grid-4 mb">' +
        '<div class="card tight"><div class="small muted">Semáforo</div>' + UI.semaforo(t) + '</div>' +
        '<div class="card tight"><div class="small muted">Fecha límite</div><b>' + U.fmtFecha(t.fechaLimite) + '</b>' +
        (sem.dias !== null ? '<div class="small muted">' + U.escapeHtml(U.txtVencimiento(sem.dias)) + '</div>' : '') + '</div>' +
        '<div class="card tight"><div class="small muted">Responsable</div><b>' + U.escapeHtml(t.responsable || 'Sin asignar') + '</b></div>' +
        '<div class="card tight"><div class="small muted">Creada</div><b>' + U.fmtFecha(t.fechaCreacion) + '</b>' +
        (t.fechaCumplimiento ? '<div class="small muted">Cumplida: ' + U.fmtFecha(t.fechaCumplimiento) + '</div>' : '') + '</div>' +
        '</div>' +
        '<div class="card tight mb"><div class="small muted mb">Avance general</div>' + UI.avance(t) + '</div>' +
        '<div class="btn-group mb">' +
        '<button class="btn btn-accent" data-f="avance">+ AGREGAR AVANCE</button>' +
        '<button class="btn" data-f="foto">📷 TOMAR FOTOGRAFÍA</button>' +
        '<button class="btn" data-f="galeria">🖼️ SELECCIONAR FOTOGRAFÍA</button>' +
        '<button class="btn" data-f="adjunto">📎 ADJUNTAR ARCHIVO</button>' +
        (puedeEditar && !M.esCerrada(t.estado) ? '<button class="btn btn-primary" data-f="completar">✓ COMPLETAR TAREA</button>' : '') +
        (puedeEditar ? '<button class="btn" data-f="estado">🔄 Cambiar estado</button>' : '') +
        (CSN.store.puede('tarea.eliminar') ? '<button class="btn btn-danger" data-f="eliminar">🗑 Eliminar</button>' : '') +
        '</div>' +
        '<div class="section-title">Descripción</div>' +
        '<p style="white-space:pre-wrap">' + (t.descripcion ? U.escapeHtml(t.descripcion) : '<span class="muted">Sin descripción registrada.</span>') + '</p>' +
        (t.comentarioFinal ? '<div class="alert-box alert-ok mb"><b>Comentario final:</b> ' + U.escapeHtml(t.comentarioFinal) + '</div>' : '') +
        '<div class="section-title">Seguimiento de avances (' + avances.length + ')</div>' +
        (avances.length ? '<div class="timeline">' + avances.map(function (a) {
          var arch = CSN.store.archivosDeAvance(a.id);
          return '<div class="tl-item ' + (a.porcentaje >= 100 ? 'ok' : '') + '">' +
            '<div class="tl-head"><span class="tl-date">' + U.fmtFecha(a.fecha) + ' ' + U.escapeHtml(a.hora || '') + '</span>' +
            '<span class="badge b-proceso">' + (a.porcentaje || 0) + '%</span>' +
            '<span class="small muted">👤 ' + U.escapeHtml(a.usuario || '') + '</span>' +
            (CSN.store.puede('avance.eliminar') ? '<button class="btn btn-ghost btn-sm" data-f="borrar-avance" data-id="' + U.attr(a.id) + '" title="Eliminar avance">🗑</button>' : '') +
            '</div>' +
            '<div class="tl-body">' + U.escapeHtml(a.descripcion || '') + (a.comentario ? '<br><i>' + U.escapeHtml(a.comentario) + '</i>' : '') + '</div>' +
            (arch.length ? '<div class="thumbs mt">' + arch.map(function (f, i) {
              return /^image\//.test(f.tipo || '')
                ? '<div class="thumb" data-f="ver-foto" data-id="' + U.attr(f.id) + '"><img src="' + U.attr(CSN.archivos.url(f)) + '" alt="' + U.attr(f.nombre) + '" loading="lazy"></div>'
                : '<div class="file-item"><span class="fi-ico">' + U.iconoArchivo(f.tipo, f.nombre) + '</span><span class="fi-name">' + U.escapeHtml(f.nombre) + '</span></div>';
            }).join('') + '</div>' : '') +
            '</div>';
        }).join('') + '</div>' : '<p class="muted small">Aún no se han registrado avances.</p>') +
        '<div class="section-title">Fotografías (' + fotos.length + ')</div>' +
        (fotos.length ? '<div class="thumbs">' + fotos.map(function (f, i) {
          return '<div class="thumb" data-f="ver-foto" data-id="' + U.attr(f.id) + '">' +
            '<img src="' + U.attr(CSN.archivos.url(f)) + '" alt="' + U.attr(f.nombre) + '" loading="lazy">' +
            '<span class="tag">' + U.escapeHtml(f.rol === 'cierre' ? 'Cierre' : (f.rol === 'avance' ? 'Avance' : 'Tarea')) + '</span>' +
            (CSN.store.puede('archivo.eliminar') ? '<button class="del" data-f="borrar-archivo" data-id="' + U.attr(f.id) + '" title="Eliminar">✕</button>' : '') +
            '</div>';
        }).join('') + '</div>' : '<p class="muted small">Sin fotografías adjuntas.</p>') +
        '<div class="section-title">Documentos (' + docs.length + ')</div>' +
        (docs.length ? '<div class="stack">' + docs.map(function (f) { return CSN.archivos.documentoHtml(f); }).join('') + '</div>' +
          '<div class="small muted mt">📄 Para ver los documentos en el informe PDF, expórtelo desde la sección Informes con la opción de documentos incluida.</div>'
          : '<p class="muted small">Sin documentos adjuntos.</p>') +
        '<div class="section-title">Historial de modificaciones</div>' +
        UI.listaHistorial(CSN.store.historialDe(t.id), 40);

      cont.innerHTML = html;

      cont.onclick = function (e) {
        var btn = e.target.closest('[data-f]');
        if (!btn) return;
        var accion = btn.getAttribute('data-f');
        var id2 = btn.getAttribute('data-id');
        if (accion === 'avance') Vt.agregarAvance(t.id, function () { pintar(t.id); });
        else if (accion === 'foto') {
          CSN.archivos.tomarFotografia(t.id, t.estado === 'Completada' ? 'cierre' : 'fotografia').then(function () { pintar(t.id); });
        } else if (accion === 'galeria') {
          CSN.archivos.seleccionarFotografias(t.id, t.estado === 'Completada' ? 'cierre' : 'fotografia').then(function () { pintar(t.id); });
        } else if (accion === 'adjunto') {
          CSN.archivos.adjuntarDocumento(t.id).then(function () { pintar(t.id); });
        } else if (accion === 'completar') Vt.completar(t.id, function () { pintar(t.id); });
        else if (accion === 'estado') Vt.cambiarEstado(t.id, function () { pintar(t.id); });
        else if (accion === 'eliminar') {
          U.Modal.confirmar({
            titulo: 'Eliminar tarea', peligro: true, textoOk: 'Eliminar',
            mensaje: '¿Eliminar la tarea «' + t.titulo + '»?',
            detalle: 'La tarea y su seguimiento dejarán de mostrarse. El historial se conserva en el registro de auditoría.'
          }).then(function (ok) {
            if (!ok) return;
            CSN.store.eliminarTarea(t.id).then(function () {
              U.Modal.cerrar(); U.toast('Tarea eliminada', 'ok');
            }).catch(function (err) { U.toast(err.message, 'err'); });
          });
        } else if (accion === 'ver-foto') {
          CSN.archivos.ver(fotos, fotos.map(function (x) { return x.id; }).indexOf(id2));
        } else if (accion === 'borrar-archivo') {
          U.Modal.confirmar({ mensaje: '¿Eliminar este archivo?', peligro: true, textoOk: 'Eliminar' }).then(function (ok) {
            if (ok) CSN.store.eliminarArchivo(id2).then(function () { pintar(t.id); });
          });
        } else if (accion === 'borrar-avance') {
          U.Modal.confirmar({ mensaje: '¿Eliminar este avance del seguimiento?', peligro: true, textoOk: 'Eliminar' }).then(function (ok) {
            if (ok) CSN.store.eliminarAvance(id2).then(function () { pintar(t.id); });
          });
        } else if (btn.hasAttribute('data-bajar')) {
          var f = CSN.store.todas('archivos').filter(function (x) { return x.id === btn.getAttribute('data-bajar'); })[0];
          if (f) CSN.archivos.descargar(f);
        }
      };
      U.$$('[data-bajar]', cont).forEach(function (b) {
        b.onclick = function () {
          var f = CSN.store.todas('archivos').filter(function (x) { return x.id === b.getAttribute('data-bajar'); })[0];
          if (f) CSN.archivos.descargar(f);
        };
      });
    }
  };

  /* ================= Formulario de tarea ================= */
  Vt.formulario = function (opts) {
    opts = opts || {};
    if (!CSN.store.puede('tarea.crear') && !opts.id) { U.toast('Su perfil no permite crear tareas', 'warn'); return; }
    var t = opts.id ? CSN.store.tarea(opts.id) : null;
    if (opts.id && !t) { U.toast('Tarea no encontrada', 'err'); return; }
    if (!CSN.store.comunidades(true).length) {
      U.Modal.aviso('Sin comunidades', 'Antes de crear tareas debe registrar al menos una comunidad.', '🏢');
      return;
    }
    var d = t || M.nuevaTarea({ comunidadId: opts.comunidadId || '', fechaLimite: U.sumarDias(U.hoy(), 7) }, CSN.store.sesion());

    var cuerpo = '<form id="form-tarea" class="form-grid">' +
      UI.campo({ nombre: 'comunidadId', label: 'Comunidad', tipo: 'select', requerido: true, valor: d.comunidadId, opcionesHtml: UI.opcionesComunidades(d.comunidadId, false), ancho: 2 }) +
      UI.campo({ nombre: 'titulo', label: 'Nombre de la tarea', requerido: true, valor: d.titulo, placeholder: 'Ej: Reparación filtración estacionamiento', ancho: 2 }) +
      UI.campo({ nombre: 'descripcion', label: 'Descripción', tipo: 'textarea', filas: 3, valor: d.descripcion, ancho: 2, placeholder: 'Detalle del problema, alcance del trabajo, antecedentes…' }) +
      UI.campo({ nombre: 'fechaCreacion', label: 'Fecha de creación', tipo: 'date', valor: d.fechaCreacion }) +
      UI.campo({ nombre: 'fechaLimite', label: 'Fecha límite (vencimiento)', tipo: 'date', valor: d.fechaLimite, ayuda: 'Al superarla sin completar, la tarea pasa automáticamente a VENCIDA.' }) +
      UI.campo({ nombre: 'prioridad', label: 'Prioridad', tipo: 'select', valor: d.prioridad, opcionesHtml: UI.opciones(M.PRIORIDADES, d.prioridad, 'Seleccione…') }) +
      UI.campo({ nombre: 'estado', label: 'Estado', tipo: 'select', valor: d.estado, opcionesHtml: UI.opciones(M.ESTADOS, d.estado, 'Seleccione…') }) +
      UI.campo({ nombre: 'responsable', label: 'Responsable', valor: d.responsable, placeholder: 'Nombre, cargo o empresa responsable' }) +
      UI.campo({ nombre: 'avance', label: 'Porcentaje de avance', tipo: 'range', valor: d.avance || 0 }) +
      UI.campo({ nombre: 'fechaCumplimiento', label: 'Fecha de cumplimiento', tipo: 'date', valor: d.fechaCumplimiento, ayuda: 'Sólo si la tarea está completada.' }) +
      UI.campo({ nombre: 'comentarioFinal', label: 'Comentario final', tipo: 'textarea', valor: d.comentarioFinal, ancho: 2 }) +
      '</form>';

    U.Modal.abrir({
      title: opts.id ? 'Editar tarea' : 'Nueva tarea', icon: '📝', wide: true,
      body: cuerpo,
      footer: '<button class="btn" data-x="cancelar">Cancelar</button>' +
        '<button class="btn btn-primary" data-x="guardar">' + (opts.id ? 'Guardar cambios' : 'GUARDAR TAREA') + '</button>',
      onOpen: function (modal) {
        modal.querySelector('[data-x="cancelar"]').onclick = function () { U.Modal.cerrar(); };
        var guardarBtn = modal.querySelector('[data-x="guardar"]');
        guardarBtn.onclick = function () {
          var form = modal.querySelector('#form-tarea');
          var datos = UI.leerCampos(form);
          if (!datos.comunidadId) { U.toast('Seleccione la comunidad', 'err'); return; }
          if (!datos.titulo) { U.toast('Ingrese el nombre de la tarea', 'err'); return; }
          if (opts.id) datos.id = opts.id;
          guardarBtn.disabled = true;
          Promise.resolve().then(function () {
            return CSN.store.guardarTarea(datos);
          }).then(function (r) {
            U.Modal.cerrar();
            U.toast(opts.id ? 'Tarea actualizada' : 'Tarea creada: ' + r.titulo, 'ok');
            if (opts.onListo) opts.onListo(r);
          }).catch(function (e) {
            guardarBtn.disabled = false;
            U.toast(e.message, 'err');
          });
        };
      }
    });
  };

  /* ================= Registro de avance ================= */
  Vt.agregarAvance = function (tareaId, cb) {
    if (!CSN.store.puede('avance.crear')) { U.toast('Su perfil no permite registrar avances', 'warn'); return; }
    var t = CSN.store.tarea(tareaId);
    if (!t) return;
    var a = U.ahora();
    var temporales = [];

    U.Modal.abrir({
      title: 'Agregar avance', icon: '📈', wide: true,
      body: '<div class="small muted mb"><b>' + U.escapeHtml(t.titulo) + '</b> · avance actual ' + (+t.avance || 0) + '%</div>' +
        '<form id="form-avance" class="form-grid">' +
        UI.campo({ nombre: 'fecha', label: 'Fecha', tipo: 'date', requerido: true, valor: a.fecha }) +
        UI.campo({ nombre: 'hora', label: 'Hora', tipo: 'time', valor: a.hora }) +
        UI.campo({ nombre: 'porcentaje', label: 'Porcentaje de avance', tipo: 'range', valor: t.avance || 0, ancho: 2 }) +
        UI.campo({ nombre: 'descripcion', label: 'Descripción del avance', tipo: 'textarea', requerido: true, valor: '', ancho: 2, placeholder: 'Ej: Se realizó inspección con especialista.' }) +
        UI.campo({ nombre: 'comentario', label: 'Comentario', tipo: 'textarea', valor: '', ancho: 2, placeholder: 'Observaciones, acuerdos, próximos pasos…' }) +
        UI.campo({ nombre: 'usuario', label: 'Responsable', valor: (CSN.store.sesion() || {}).nombre || '', ancho: 2 }) +
        '</form>' +
        '<div class="section-title">Respaldo fotográfico y documental</div>' +
        '<div class="btn-group mb"><button class="btn" data-x="foto">📷 TOMAR FOTOGRAFÍA</button>' +
        '<button class="btn" data-x="galeria">🖼️ SELECCIONAR FOTOGRAFÍA</button>' +
        '<button class="btn" data-x="adjunto">📎 ADJUNTAR ARCHIVO</button></div>' +
        '<div id="avance-temporales" class="thumbs"></div>',
      footer: '<button class="btn" data-x="cancelar">Cancelar</button><button class="btn btn-primary" data-x="guardar">GUARDAR AVANCE</button>',
      onOpen: function (modal) {
        var cont = modal.querySelector('#avance-temporales');
        function pintarTemp() {
          cont.innerHTML = temporales.map(function (f, i) {
            return '<div class="thumb">' +
              (/^image\//.test(f.tipo) ? '<img src="' + U.attr(f.contenido) + '">' : '<div class="file-item" style="height:100%">' + U.iconoArchivo(f.tipo, f.nombre) + '</div>') +
              '<span class="tag">' + U.escapeHtml(U.truncar(f.nombre, 12)) + '</span>' +
              '<button class="del" data-quitar="' + i + '">✕</button></div>';
          }).join('');
          U.$$('[data-quitar]', cont).forEach(function (b) {
            b.onclick = function () { temporales.splice(+b.getAttribute('data-quitar'), 1); pintarTemp(); };
          });
        }
        modal.querySelector('[data-x="foto"]').onclick = function () {
          CSN.archivos.recolectar('imagen', true).then(function (items) { temporales = temporales.concat(items); pintarTemp(); });
        };
        modal.querySelector('[data-x="galeria"]').onclick = function () {
          CSN.archivos.recolectar('galeria', true).then(function (items) { temporales = temporales.concat(items); pintarTemp(); });
        };
        modal.querySelector('[data-x="adjunto"]').onclick = function () {
          CSN.archivos.recolectar('documento', true).then(function (items) { temporales = temporales.concat(items); pintarTemp(); });
        };
        modal.querySelector('[data-x="cancelar"]').onclick = function () { U.Modal.cerrar(); };
        var btn = modal.querySelector('[data-x="guardar"]');
        btn.onclick = function () {
          var datos = UI.leerCampos(modal.querySelector('#form-avance'));
          if (!datos.descripcion) { U.toast('Ingrese la descripción del avance', 'err'); return; }
          btn.disabled = true;
          datos.tareaId = tareaId;
          datos.porcentaje = +datos.porcentaje || 0;
          CSN.store.agregarAvance(datos).then(function (av) {
            // Guarda los respaldos asociados al avance
            return temporales.reduce(function (p, f) {
              return p.then(function () {
                return CSN.store.agregarArchivo({
                  tareaId: tareaId, avanceId: av.id, nombre: f.nombre, tipo: f.tipo, peso: f.peso,
                  contenido: f.contenido, rol: /^image\//.test(f.tipo) ? 'avance' : 'adjunto'
                });
              });
            }, Promise.resolve()).then(function () { return av; });
          }).then(function () {
            U.Modal.cerrar();
            U.toast('Avance registrado correctamente', 'ok');
            if (cb) cb();
          }).catch(function (e) {
            btn.disabled = false;
            U.toast(e.message, 'err');
          });
        };
      }
    });
  };

  /* ================= Cierre de tarea ================= */
  Vt.completar = function (tareaId, cb) {
    if (!CSN.store.puede('tarea.completar')) { U.toast('Su perfil no permite completar tareas', 'warn'); return; }
    var t = CSN.store.tarea(tareaId);
    if (!t) return;
    var temporales = [];
    var hoy = U.hoy();

    U.Modal.abrir({
      title: 'Completar tarea', icon: '✅', wide: true,
      body: '<div class="small muted mb"><b>' + U.escapeHtml(t.titulo) + '</b></div>' +
        '<form id="form-cierre" class="form-grid">' +
        UI.campo({ nombre: 'fechaCumplimiento', label: 'Fecha de cumplimiento', tipo: 'date', requerido: true, valor: t.fechaCumplimiento || hoy }) +
        UI.campo({ nombre: 'responsable', label: 'Responsable del cierre', valor: t.responsable || '' }) +
        UI.campo({ nombre: 'avance', label: 'Porcentaje final', tipo: 'range', valor: 100, ancho: 2 }) +
        UI.campo({ nombre: 'comentario', label: 'Comentario de cierre', tipo: 'textarea', requerido: true, ancho: 2, valor: t.comentarioFinal || '', placeholder: 'Trabajo realizado, resultado obtenido, pendientes…' }) +
        '</form>' +
        '<div class="alert-box alert-info mb">Al completar la tarea se conservará todo el historial y el seguimiento de avances.</div>' +
        '<div class="section-title">Fotografía final y documento de respaldo</div>' +
        '<div class="btn-group mb"><button class="btn" data-x="foto">📷 FOTOGRAFÍA FINAL</button>' +
        '<button class="btn" data-x="galeria">🖼️ SELECCIONAR FOTOGRAFÍA</button>' +
        '<button class="btn" data-x="adjunto">📎 DOCUMENTO DE RESPALDO</button></div>' +
        '<div id="cierre-temporales" class="thumbs"></div>',
      footer: '<button class="btn" data-x="cancelar">Cancelar</button><button class="btn btn-primary" data-x="guardar">✓ COMPLETAR TAREA</button>',
      onOpen: function (modal) {
        var cont = modal.querySelector('#cierre-temporales');
        function pintarTemp() {
          cont.innerHTML = temporales.map(function (f, i) {
            return '<div class="thumb">' +
              (/^image\//.test(f.tipo) ? '<img src="' + U.attr(f.contenido) + '">' : '<div class="file-item" style="height:100%">' + U.iconoArchivo(f.tipo, f.nombre) + '</div>') +
              '<span class="tag">' + U.escapeHtml(U.truncar(f.nombre, 12)) + '</span>' +
              '<button class="del" data-quitar="' + i + '">✕</button></div>';
          }).join('');
          U.$$('[data-quitar]', cont).forEach(function (b) {
            b.onclick = function () { temporales.splice(+b.getAttribute('data-quitar'), 1); pintarTemp(); };
          });
        }
        modal.querySelector('[data-x="foto"]').onclick = function () { CSN.archivos.recolectar('imagen', true).then(function (i) { temporales = temporales.concat(i); pintarTemp(); }); };
        modal.querySelector('[data-x="galeria"]').onclick = function () { CSN.archivos.recolectar('galeria', true).then(function (i) { temporales = temporales.concat(i); pintarTemp(); }); };
        modal.querySelector('[data-x="adjunto"]').onclick = function () { CSN.archivos.recolectar('documento', true).then(function (i) { temporales = temporales.concat(i); pintarTemp(); }); };
        modal.querySelector('[data-x="cancelar"]').onclick = function () { U.Modal.cerrar(); };
        var btn = modal.querySelector('[data-x="guardar"]');
        btn.onclick = function () {
          var datos = UI.leerCampos(modal.querySelector('#form-cierre'));
          if (!datos.comentario) { U.toast('Ingrese el comentario de cierre', 'err'); return; }
          btn.disabled = true;
          CSN.store.completarTarea(tareaId, datos).then(function () {
            return temporales.reduce(function (p, f) {
              return p.then(function () {
                return CSN.store.agregarArchivo({
                  tareaId: tareaId, nombre: f.nombre, tipo: f.tipo, peso: f.peso,
                  contenido: f.contenido, rol: 'cierre'
                });
              });
            }, Promise.resolve());
          }).then(function () {
            U.Modal.cerrar();
            U.toast('Tarea completada y registrada en el historial', 'ok');
            if (cb) cb();
          }).catch(function (e) { btn.disabled = false; U.toast(e.message, 'err'); });
        };
      }
    });
  };

  /* ================= Cambio de estado ================= */
  Vt.cambiarEstado = function (tareaId, cb) {
    var t = CSN.store.tarea(tareaId);
    if (!t) return;
    U.Modal.abrir({
      title: 'Cambiar estado', icon: '🔄', slim: true,
      body: '<div class="small muted mb">Estado actual: ' + UI.badgeEstado(t.estado) + '</div>' +
        '<div class="field"><label>Nuevo estado</label><select data-campo="estado">' + UI.opciones(M.ESTADOS, t.estado, 'Seleccione…') + '</select></div>' +
        '<div class="field"><label>Comentario</label><textarea data-campo="comentario" rows="2" placeholder="Motivo del cambio de estado (queda en el historial)"></textarea></div>',
      footer: '<button class="btn" data-x="cancelar">Cancelar</button><button class="btn btn-primary" data-x="guardar">Guardar</button>',
      onOpen: function (modal) {
        modal.querySelector('[data-x="cancelar"]').onclick = function () { U.Modal.cerrar(); };
        modal.querySelector('[data-x="guardar"]').onclick = function () {
          var datos = UI.leerCampos(modal);
          if (datos.estado === 'Completada') { U.Modal.cerrar(); Vt.completar(tareaId, cb); return; }
          CSN.store.cambiarEstado(tareaId, datos.estado, datos.comentario).then(function () {
            U.Modal.cerrar();
            U.toast('Estado actualizado: ' + datos.estado, 'ok');
            if (cb) cb();
          }).catch(function (e) { U.toast(e.message, 'err'); });
        };
      }
    });
  };

  /* ================= Selector rápido de tarea ================= */
  Vt.selectorTarea = function (titulo, cb) {
    var abiertas = CSN.store.filtrarTareas({ abiertas: true });
    var html = '<div class="field"><input type="search" id="sel-buscar" placeholder="Buscar tarea por nombre, comunidad o responsable…"></div>' +
      '<div id="sel-lista" style="max-height:52vh;overflow:auto"></div>';
    U.Modal.abrir({
      title: titulo || 'Seleccionar tarea', icon: '🔎',
      body: html,
      footer: '<button class="btn" data-x="cancelar">Cancelar</button>',
      onOpen: function (modal) {
        var lista = modal.querySelector('#sel-lista');
        var input = modal.querySelector('#sel-buscar');
        function pintar(q) {
          var arr = abiertas.filter(function (t) {
            if (!q) return true;
            var c = CSN.store.comunidad(t.comunidadId);
            return U.norm([t.titulo, t.responsable, c ? c.nombre : ''].join(' ')).indexOf(U.norm(q)) >= 0;
          }).slice(0, 60);
          lista.innerHTML = arr.length ? '<div class="stack">' + arr.map(function (t) {
            var c = CSN.store.comunidad(t.comunidadId);
            return '<button class="task-card ' + M.semaforo(t, CSN.store.config()).clase + '" data-sel="' + U.attr(t.id) + '" style="text-align:left;width:100%">' +
              '<div class="tc-title">' + U.escapeHtml(t.titulo) + '</div>' +
              '<div class="tc-meta"><span>🏢 ' + U.escapeHtml(c ? c.nombre : '') + '</span>' + UI.badgeEstado(t.estado) + UI.semaforo(t, true) + '</div></button>';
          }).join('') + '</div>' : '<p class="muted small">No se encontraron tareas abiertas.</p>';
          U.$$('[data-sel]', lista).forEach(function (b) {
            b.onclick = function () { U.Modal.cerrar(); cb(b.getAttribute('data-sel')); };
          });
        }
        pintar('');
        input.oninput = U.debounce(function () { pintar(input.value); }, 200);
        modal.querySelector('[data-x="cancelar"]').onclick = function () { U.Modal.cerrar(); };
        setTimeout(function () { try { input.focus(); } catch (e) {} }, 120);
      }
    });
  };

  /* ================= Acción rápida: tomar fotografía ================= */
  Vt.fotoRapida = function () {
    Vt.selectorTarea('📷 ¿A qué tarea corresponde la fotografía?', function (tareaId) {
      CSN.archivos.tomarFotografia(tareaId, 'fotografia').then(function (archivos) {
        if (archivos && archivos.length) Vt.ficha(tareaId);
      });
    });
  };

  /* ================= Acción rápida: nuevo avance ================= */
  Vt.avanceRapido = function () {
    Vt.selectorTarea('📈 ¿A qué tarea corresponde el avance?', function (tareaId) {
      Vt.agregarAvance(tareaId, function () { Vt.ficha(tareaId); });
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
