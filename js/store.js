/* ==========================================================================
   store.js – Capa de negocio y estado de la aplicación
   Responsabilidades:
     · Mantener el estado en memoria (carga inicial desde CSN.db)
     · Operaciones de negocio (crear / editar / desactivar / completar / buscar)
     · Registro automático del historial de modificaciones
     · Control de usuarios, sesión y permisos
     · Marcar vencidas automáticamente
     · Avisar a la interfaz y al sincronizador mediante eventos
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util, M = CSN.model;

  var ST = CSN.store = {};
  var cache = { comunidades: [], tareas: [], avances: [], archivos: [], usuarios: [], historial: [], config: [], conflictos: [], bitacora: [] };
  var sesion = null;
  var oyentes = {};

  /* ---------- Eventos ---------- */
  ST.on = function (evento, fn) { (oyentes[evento] = oyentes[evento] || []).push(fn); return fn; };
  ST.off = function (evento, fn) {
    oyentes[evento] = (oyentes[evento] || []).filter(function (f) { return f !== fn; });
  };
  ST.emitir = function (evento, datos) {
    (oyentes[evento] || []).forEach(function (f) { try { f(datos); } catch (e) { console.error('Error en oyente ' + evento, e); } });
  };
  function avisarCambio() { ST.emitir('cambio'); }

  /* ---------- Acceso al estado ---------- */
  ST.crudo = function () { return cache; };
  ST.todas = function (col) { return (cache[col] || []).filter(function (r) { return !r._deleted; }); };
  function porId(col, id) { return (cache[col] || []).filter(function (r) { return r.id === id && !r._deleted; })[0] || null; }

  ST.config = function () { return cache.config[0] || M.configPorDefecto(); };
  ST.sesion = function () { return sesion; };
  ST.usuarioActual = function () { return sesion; };

  /* ---------- Inicialización ---------- */
  ST.iniciar = function () {
    return CSN.db.iniciar().then(function (modo) {
      return Promise.all(Object.keys(cache).map(function (col) {
        return CSN.db.all(col).then(function (arr) { cache[col] = arr || []; });
      })).then(function () { return modo; });
    }).then(function (modo) {
      if (!cache.config.length) {
        return CSN.db.put('config', M.configPorDefecto()).then(function (c) { cache.config = [c]; });
      }
    }).then(function () {
      // Datos de demostración en el primer inicio
      if (!cache.comunidades.length && !cache.tareas.length) {
        return ST.cargarDemo(true);
      }
    }).then(function () {
      // Usuarios base si no existe ninguno
      if (!cache.usuarios.length) return crearUsuariosBase();
    }).then(function () {
      recuperarSesion();
      return marcarVencidas(true);
    }).then(function () {
      ST.emitir('listo');
      return true;
    });
  };

  function crearUsuariosBase() {
    var base = [
      { nombre: 'Administrador CSN', email: 'admin@csn.cl', clave: 'csn2026', perfil: 'Administrador', cargo: 'Administrador General' },
      { nombre: 'Supervisor de Terreno', email: 'supervisor@csn.cl', clave: 'supervisor2026', perfil: 'Supervisor', cargo: 'Supervisor de Mantención' },
      { nombre: 'Usuario Consulta', email: 'usuario@csn.cl', clave: 'usuario2026', perfil: 'Usuario', cargo: 'Asistente Administrativo' }
    ];
    return Promise.all(base.map(function (b) {
      return crearUsuarioConClave(b.nombre, b.email, b.clave, b.perfil, b.cargo);
    }));
  }

  function crearUsuarioConClave(nombre, email, clave, perfil, cargo) {
    var salt = U.uid('s');
    return CSN.crypto.sha256(salt + '::' + clave).then(function (hash) {
      var u = M.nuevoUsuario({ nombre: nombre, email: email.toLowerCase(), perfil: perfil, cargo: cargo || '', hash: hash, salt: salt });
      u._nuevo = false;
      return CSN.db.put('usuarios', u).then(function () {
        cache.usuarios.push(u);
        return u;
      });
    });
  }
  ST.crearUsuarioConClave = crearUsuarioConClave;

  /** Carga los datos de demostración (ATALAYA, LA ESPUELA, VISTA VERDE II) */
  ST.cargarDemo = function (silencioso) {
    var demo = M.datosDemo(sesion || { nombre: 'Administrador' });
    var ops = [];
    demo.comunidades.forEach(function (c) { ops.push(['comunidades', c]); });
    demo.tareas.forEach(function (t) { ops.push(['tareas', t]); });
    demo.avances.forEach(function (a) { ops.push(['avances', a]); });
    demo.historial.forEach(function (h) { ops.push(['historial', h]); });
    return Promise.all(ops.map(function (o) {
      cache[o[0]].push(o[1]);
      return CSN.db.put(o[0], o[1]);
    })).then(function () {
      ST.emitir('demo', demo.length);
      if (!silencioso) U.toast('Datos de demostración cargados', 'ok');
      return demo;
    });
  };

  /* ---------- Sesión y permisos ---------- */
  function recuperarSesion() {
    var raw = null;
    try { raw = global.localStorage.getItem('csn.sesion'); } catch (e) {}
    if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      var u = porId('usuarios', s.id);
      if (u && u.estado === 'Activo') { sesion = u; return u; }
    } catch (e) {}
    return null;
  }

  ST.login = function (email, clave) {
    var e = String(email || '').trim().toLowerCase();
    var u = ST.todas('usuarios').filter(function (x) { return String(x.email).toLowerCase() === e; })[0];
    if (!u) return Promise.reject(new Error('No existe un usuario con ese correo electrónico.'));
    if (u.estado !== 'Activo') return Promise.reject(new Error('El usuario se encuentra inactivo. Contacte al administrador.'));
    return CSN.crypto.sha256(u.salt + '::' + clave).then(function (hash) {
      if (hash !== u.hash) throw new Error('Contraseña incorrecta. Verifique e intente nuevamente.');
      sesion = u;
      u.ultimoAcceso = U.marca();
      return CSN.db.put('usuarios', u).then(function () {
        try { global.localStorage.setItem('csn.sesion', JSON.stringify({ id: u.id, nombre: u.nombre, perfil: u.perfil, ts: Date.now() })); } catch (err) {}
        registrarBitacora('Ingreso al sistema', u.nombre + ' inició sesión como ' + u.perfil + '.');
        ST.emitir('sesion', u);
        return u;
      });
    });
  };

  ST.salir = function () {
    registrarBitacora('Cierre de sesión', (sesion ? sesion.nombre : 'Usuario') + ' cerró sesión.');
    sesion = null;
    try { global.localStorage.removeItem('csn.sesion'); } catch (e) {}
    ST.emitir('sesion', null);
  };

  ST.nivel = function () { return sesion ? (M.PERFILES[sesion.perfil] || { nivel: 1 }).nivel : 0; };

  var PERMISOS = {
    'comunidad.crear': 2, 'comunidad.editar': 2, 'comunidad.eliminar': 3,
    'tarea.crear': 2, 'tarea.editar': 2, 'tarea.eliminar': 3, 'tarea.completar': 2,
    'avance.crear': 1, 'avance.eliminar': 2,
    'archivo.agregar': 1, 'archivo.eliminar': 2,
    'informe.generar': 1, 'exportar': 1,
    'usuario.gestionar': 3, 'config.editar': 3, 'sync.configurar': 3, 'datos.gestionar': 3
  };
  ST.puede = function (accion) { return ST.nivel() >= (PERMISOS[accion] || 3); };
  ST.PERMISOS = PERMISOS;

  function registrarBitacora(accion, detalle) {
    var b = { id: U.uid('bit'), accion: accion, detalle: detalle, usuario: sesion ? sesion.nombre : 'Sistema', marca: U.marca(), _ts: U.ms(), _deleted: false };
    cache.bitacora.unshift(b);
    if (cache.bitacora.length > 300) cache.bitacora = cache.bitacora.slice(0, 300);
    return CSN.db.put('bitacora', b);
  }
  ST.registrarBitacora = registrarBitacora;
  ST.bitacora = function () { return ST.todas('bitacora'); };

  /* ---------- Historial de modificaciones ---------- */
  function registrarHistorial(tarea, accion, estadoAnterior, estadoNuevo, comentario, extra) {
    var h = M.nuevoHistorial(Object.assign({
      tareaId: tarea ? tarea.id : '', comunidadId: tarea ? tarea.comunidadId : '',
      accion: accion, estadoAnterior: estadoAnterior || '', estadoNuevo: estadoNuevo || '',
      comentario: comentario || ''
    }, extra || {}), sesion);
    cache.historial.push(h);
    return CSN.db.put('historial', h).then(function () { return h; });
  }
  ST.registrarHistorial = registrarHistorial;
  /** Marca de orden con precisión de milisegundos (evita empates dentro del mismo minuto) */
  function marcaOrden(r) {
    return (r.fecha || '') + ' ' + (r.hora || '') + '|' + String(r._ts || 0).padStart(15, '0');
  }

  ST.historialDe = function (tareaId) {
    return U.ordenar(ST.todas('historial').filter(function (h) { return h.tareaId === tareaId; }), marcaOrden, 'desc');
  };
  ST.historialGlobal = function (filtro) {
    filtro = filtro || {};
    var arr = ST.todas('historial');
    if (filtro.comunidadId) arr = arr.filter(function (h) { return h.comunidadId === filtro.comunidadId; });
    if (filtro.tareaId) arr = arr.filter(function (h) { return h.tareaId === filtro.tareaId; });
    if (filtro.desde) arr = arr.filter(function (h) { return (h.fecha || '') >= filtro.desde; });
    if (filtro.hasta) arr = arr.filter(function (h) { return (h.fecha || '') <= filtro.hasta; });
    return U.ordenar(arr, marcaOrden, 'desc');
  };

  /* ---------- Guardado genérico ---------- */
  function guardar(col, rec) {
    rec._ts = U.ms();
    rec._marca = U.marca();
    rec._by = sesion ? sesion.nombre : 'Sistema';
    rec._dev = U.deviceId();
    rec._nuevo = true;               // hay cambios pendientes de sincronizar
    var lista = cache[col];
    var i = lista.map(function (x) { return x.id; }).indexOf(rec.id);
    if (i >= 0) lista[i] = rec; else lista.push(rec);
    return CSN.db.put(col, rec).then(function () { return rec; });
  }
  ST.guardar = guardar;

  /* ---------- Comunidades ---------- */
  ST.comunidades = function (incluirInactivas) {
    var arr = ST.todas('comunidades');
    if (!incluirInactivas) arr = arr.filter(function (c) { return c.estado !== 'Inactiva'; });
    return U.ordenar(arr, function (c) { return c.nombre; }, 'asc');
  };
  ST.comunidad = function (id) { return porId('comunidades', id); };
  ST.estadisticasComunidad = function (id) {
    var tareas = ST.tareasDe(id);
    return M.resumen(tareas, ST.config());
  };

  ST.guardarComunidad = function (datos) {
    var esNueva = !datos.id;
    if (esNueva && !ST.puede('comunidad.crear')) throw new Error('Su perfil no permite crear comunidades.');
    if (!esNueva && !ST.puede('comunidad.editar')) throw new Error('Su perfil no permite modificar comunidades.');
    var rec = esNueva ? M.nuevaComunidad(datos, sesion) : Object.assign({}, porId('comunidades', datos.id), datos);
    if (!String(rec.nombre || '').trim()) throw new Error('El nombre de la comunidad es obligatorio.');
    return guardar('comunidades', rec).then(function (r) {
      registrarBitacora(esNueva ? 'Comunidad creada' : 'Comunidad modificada', r.nombre + ' (' + (r.comuna || 'sin comuna') + ')');
      avisarCambio();
      return r;
    });
  };

  ST.desactivarComunidad = function (id, estado) {
    if (!ST.puede('comunidad.editar')) throw new Error('Su perfil no permite modificar comunidades.');
    var c = porId('comunidades', id);
    if (!c) throw new Error('Comunidad no encontrada.');
    c.estado = estado || (c.estado === 'Inactiva' ? 'Activa' : 'Inactiva');
    return guardar('comunidades', c).then(function () {
      registrarBitacora('Comunidad ' + (c.estado === 'Inactiva' ? 'desactivada' : 'activada'), c.nombre);
      avisarCambio(); return c;
    });
  };

  ST.eliminarComunidad = function (id) {
    if (!ST.puede('comunidad.eliminar')) throw new Error('Su perfil no permite eliminar comunidades.');
    var c = porId('comunidades', id);
    if (!c) throw new Error('Comunidad no encontrada.');
    c._deleted = true;
    return guardar('comunidades', c).then(function () {
      registrarBitacora('Comunidad eliminada', c.nombre);
      avisarCambio(); return true;
    });
  };

  /* ---------- Tareas ---------- */
  ST.tareasDe = function (comunidadId) {
    return ST.todas('tareas').filter(function (t) { return !comunidadId || t.comunidadId === comunidadId; });
  };
  ST.tarea = function (id) { return porId('tareas', id); };

  /**
   * Lista de tareas con filtros y ordenamiento
   * @param {{comunidadId,estado,prioridad,responsable,texto,desde,hasta,semaforo,vencidas,pendientes,completadas,urgentes}} f
   */
  ST.filtrarTareas = function (f) {
    f = f || {};
    var conf = ST.config();
    var arr = ST.todas('tareas');
    if (f.comunidadId && f.comunidadId !== 'todas') arr = arr.filter(function (t) { return t.comunidadId === f.comunidadId; });
    if (f.estado) {
      var ests = [].concat(f.estado);
      arr = arr.filter(function (t) { return ests.indexOf(t.estado) >= 0; });
    }
    if (f.prioridad) {
      var prs = [].concat(f.prioridad);
      arr = arr.filter(function (t) { return prs.indexOf(t.prioridad) >= 0; });
    }
    if (f.responsable) arr = arr.filter(function (t) { return U.norm(t.responsable).indexOf(U.norm(f.responsable)) >= 0; });
    if (f.desde) arr = arr.filter(function (t) { return (t.fechaLimite || t.fechaCreacion || '') >= f.desde; });
    if (f.hasta) arr = arr.filter(function (t) { return (t.fechaLimite || t.fechaCreacion || '') <= f.hasta; });
    if (f.vencidas) arr = arr.filter(function (t) { return M.semaforo(t, conf).color === 'rojo'; });
    if (f.proximas) arr = arr.filter(function (t) { return M.semaforo(t, conf).color === 'amarillo'; });
    if (f.pendientes) arr = arr.filter(function (t) { return t.estado === 'Pendiente' || t.estado === 'Vencida'; });
    if (f.completadas) arr = arr.filter(function (t) { return t.estado === 'Completada'; });
    if (f.urgentes) arr = arr.filter(function (t) { return t.prioridad === 'Urgente' && !M.esCerrada(t.estado); });
    if (f.abiertas) arr = arr.filter(function (t) { return !M.esCerrada(t.estado); });
    if (f.texto) {
      var q = U.norm(f.texto);
      arr = arr.filter(function (t) {
        var c = ST.comunidad(t.comunidadId);
        var blob = [t.titulo, t.descripcion, t.responsable, t.estado, t.prioridad, t.comentarioFinal,
          c ? c.nombre : '', c ? c.comuna : '', c ? c.direccion : ''].join(' ');
        return U.norm(blob).indexOf(q) >= 0;
      });
    }
    if (f.orden) return ordenarTareas(arr, f.orden, f.dir);
    return ordenarTareas(arr, 'semaforo', 'asc');
  };

  function ordenarTareas(arr, campo, dir) {
    var conf = ST.config();
    dir = dir || 'asc';
    var get = function (t) {
      switch (campo) {
        case 'semaforo': return M.semaforo(t, conf).orden;
        case 'titulo': return U.norm(t.titulo);
        case 'comunidad': var c = ST.comunidad(t.comunidadId); return U.norm(c ? c.nombre : '');
        case 'fecha': return t.fechaCreacion || '';
        case 'vencimiento': return t.fechaLimite || '9999-99-99';
        case 'prioridad': return -(['Baja', 'Media', 'Alta', 'Urgente'].indexOf(t.prioridad));
        case 'estado': return U.norm(t.estado);
        case 'avance': return +t.avance || 0;
        case 'responsable': return U.norm(t.responsable);
        default: return U.norm(t.titulo);
      }
    };
    return U.ordenar(arr, get, dir);
  }
  ST.ordenarTareas = ordenarTareas;

  ST.guardarTarea = function (datos) {
    var esNueva = !datos.id;
    if (esNueva && !ST.puede('tarea.crear')) throw new Error('Su perfil no permite crear tareas.');
    if (!esNueva && !ST.puede('tarea.editar')) throw new Error('Su perfil no permite modificar tareas.');

    var antes = esNueva ? null : Object.assign({}, porId('tareas', datos.id));
    var rec = esNueva ? M.nuevaTarea(datos, sesion) : Object.assign({}, antes, datos);
    // La validación se aplica sobre el registro final (permite ediciones parciales)
    if (!rec.comunidadId) throw new Error('Debe seleccionar la comunidad a la que pertenece la tarea.');
    if (!String(rec.titulo || '').trim()) throw new Error('El nombre de la tarea es obligatorio.');
    rec.avance = Math.max(0, Math.min(100, +rec.avance || 0));
    if (rec.estado === 'Vencida' && rec.fechaLimite && U.diasHasta(rec.fechaLimite) >= 0) {
      rec.estado = rec.estadoPrevio || 'Pendiente';
      rec.estadoPrevio = '';
    }
    if (rec.estado === 'Completada' && !rec.fechaCumplimiento) rec.fechaCumplimiento = U.hoy();
    if (rec.estado === 'Completada' && rec.avance < 100) rec.avance = 100;

    return guardar('tareas', rec).then(function (r) {
      var pasos = [];
      if (esNueva) {
        pasos.push(registrarHistorial(r, 'Creación de tarea', '', r.estado,
          'Tarea registrada: "' + r.titulo + '" (prioridad ' + r.prioridad + ', límite ' + (r.fechaLimite || 'sin fecha') + ').'));
      } else {
        var cambios = [];
        ['titulo', 'descripcion', 'fechaLimite', 'prioridad', 'estado', 'avance', 'responsable', 'comentarioFinal', 'fechaCumplimiento', 'comunidadId']
          .forEach(function (k) {
            if (String(antes[k] === undefined ? '' : antes[k]) !== String(r[k] === undefined ? '' : r[k])) {
              cambios.push(campoBonito(k) + ': "' + (antes[k] || '(vacío)') + '" → "' + (r[k] || '(vacío)') + '"');
            }
          });
        if (cambios.length) {
          pasos.push(registrarHistorial(r,
            antes.estado !== r.estado ? 'Cambio de estado' : 'Modificación de tarea',
            antes.estado, r.estado, cambios.join(' | ')));
        }
      }
      return Promise.all(pasos).then(function () {
        registrarBitacora(esNueva ? 'Tarea creada' : 'Tarea modificada', r.titulo);
        avisarCambio();
        return r;
      });
    });
  };

  function campoBonito(k) {
    return ({
      titulo: 'Nombre', descripcion: 'Descripción', fechaLimite: 'Fecha límite', prioridad: 'Prioridad',
      estado: 'Estado', avance: 'Avance', responsable: 'Responsable', comentarioFinal: 'Comentario final',
      fechaCumplimiento: 'Fecha de cumplimiento', comunidadId: 'Comunidad'
    })[k] || k;
  }
  ST.campoBonito = campoBonito;

  ST.cambiarEstado = function (id, nuevoEstado, comentario) {
    if (!ST.puede('tarea.editar')) throw new Error('Su perfil no permite modificar tareas.');
    var t = porId('tareas', id);
    if (!t) throw new Error('Tarea no encontrada.');
    var anterior = t.estado;
    t.estado = nuevoEstado;
    if (nuevoEstado === 'Completada') {
      t.avance = 100;
      t.fechaCumplimiento = t.fechaCumplimiento || U.hoy();
    }
    if (nuevoEstado !== 'Vencida') t.estadoPrevio = '';
    return guardar('tareas', t).then(function () {
      return registrarHistorial(t, 'Cambio de estado', anterior, nuevoEstado, comentario || '');
    }).then(function () {
      avisarCambio(); return t;
    });
  };

  /** Cierre de tarea con datos completos */
  ST.completarTarea = function (id, datos) {
    if (!ST.puede('tarea.completar')) throw new Error('Su perfil no permite completar tareas.');
    var t = porId('tareas', id);
    if (!t) throw new Error('Tarea no encontrada.');
    var anterior = t.estado;
    t.estado = 'Completada';
    t.fechaCumplimiento = datos.fechaCumplimiento || U.hoy();
    t.avance = Math.max(0, Math.min(100, datos.avance === undefined ? 100 : +datos.avance));
    if (t.avance < 100) t.avance = 100;
    t.comentarioFinal = datos.comentario || t.comentarioFinal || '';
    if (datos.responsable) t.responsable = datos.responsable;
    t.estadoPrevio = '';
    return guardar('tareas', t).then(function () {
      return registrarHistorial(t, 'Tarea completada', anterior, 'Completada',
        (datos.comentario || 'Tarea marcada como completada.') + ' | Fecha de cumplimiento: ' + U.fmtFecha(t.fechaCumplimiento) +
        ' | Avance final: ' + t.avance + '%');
    }).then(function () {
      return M.nuevoAvance({
        tareaId: t.id, fecha: t.fechaCumplimiento, porcentaje: t.avance,
        descripcion: 'Cierre de tarea' + (t.comentarioFinal ? ' — ' + t.comentarioFinal : ''),
        comentario: datos.comentario || '', usuario: (sesion ? sesion.nombre : 'Usuario')
      }, sesion);
    }).then(function (av) {
      cache.avances.push(av);
      return CSN.db.put('avances', av);
    }).then(function () {
      avisarCambio(); return t;
    });
  };

  ST.eliminarTarea = function (id) {
    if (!ST.puede('tarea.eliminar')) throw new Error('Su perfil no permite eliminar tareas.');
    var t = porId('tareas', id);
    if (!t) throw new Error('Tarea no encontrada.');
    t._deleted = true;
    return guardar('tareas', t).then(function () {
      registrarBitacora('Tarea eliminada', t.titulo);
      avisarCambio(); return true;
    });
  };

  ST.duplicarTarea = function (id) {
    var t = porId('tareas', id);
    if (!t) throw new Error('Tarea no encontrada.');
    var copia = M.nuevaTarea(Object.assign({}, t, { id: undefined, titulo: t.titulo + ' (copia)', estado: 'Pendiente', avance: 0, fechaCumplimiento: '', comentarioFinal: '' }), sesion);
    return guardar('tareas', copia).then(function () {
      return registrarHistorial(copia, 'Creación de tarea', '', 'Pendiente', 'Copia de la tarea "' + t.titulo + '".');
    }).then(function () { avisarCambio(); return copia; });
  };

  /* ---------- Avances ---------- */
  ST.avancesDe = function (tareaId) {
    return U.ordenar(ST.todas('avances').filter(function (a) { return a.tareaId === tareaId; }), marcaOrden, 'desc');
  };

  ST.agregarAvance = function (datos) {
    if (!ST.puede('avance.crear')) throw new Error('Su perfil no permite registrar avances.');
    if (!datos.tareaId) throw new Error('El avance debe estar asociado a una tarea.');
    var t = porId('tareas', datos.tareaId);
    if (!t) throw new Error('Tarea no encontrada.');
    var antesAvance = t.avance, antesEstado = t.estado;
    var av = M.nuevoAvance(datos, sesion);
    av.porcentaje = Math.max(0, Math.min(100, +av.porcentaje || 0));
    if (!av.usuario) av.usuario = sesion ? sesion.nombre : 'Usuario';
    cache.avances.push(av);

    // El avance actualiza el porcentaje de la tarea
    if (av.porcentaje >= antesAvance) t.avance = av.porcentaje;
    if (av.porcentaje > 0 && av.porcentaje < 100 && t.estado === 'Pendiente') { t.estado = 'En proceso'; }
    if (av.porcentaje >= 100 && !M.esCerrada(t.estado)) { t.estado = 'Completada'; t.fechaCumplimiento = t.fechaCumplimiento || av.fecha; }

    return CSN.db.put('avances', av).then(function () { return guardar('tareas', t); }).then(function () {
      return registrarHistorial(t, 'Registro de avance', antesEstado, t.estado,
        'Avance ' + av.porcentaje + '% (' + U.fmtFecha(av.fecha) + ') — ' + (av.descripcion || 'sin descripción') +
        (av.comentario ? ' | ' + av.comentario : '') +
        (antesAvance !== t.avance ? ' | Porcentaje: ' + antesAvance + '% → ' + t.avance + '%' : ''));
    }).then(function () {
      avisarCambio(); return av;
    });
  };

  ST.eliminarAvance = function (id) {
    if (!ST.puede('avance.eliminar')) throw new Error('Su perfil no permite eliminar avances.');
    var a = porId('avances', id);
    if (!a) throw new Error('Avance no encontrado.');
    a._deleted = true;
    return guardar('avances', a).then(function () {
      registrarBitacora('Avance eliminado', 'Tarea ' + a.tareaId);
      avisarCambio(); return true;
    });
  };

  /* ---------- Archivos ---------- */
  ST.archivosDe = function (tareaId) {
    return U.ordenar(ST.todas('archivos').filter(function (a) { return a.tareaId === tareaId; }),
      function (a) { return (a.fecha || '') + ' ' + (a.hora || ''); }, 'desc');
  };
  ST.archivosDeAvance = function (avanceId) {
    return ST.todas('archivos').filter(function (a) { return a.avanceId === avanceId; });
  };
  ST.fotosDe = function (tareaId) {
    return ST.archivosDe(tareaId).filter(function (a) { return /^image\//.test(a.tipo || ''); });
  };
  ST.documentosDe = function (tareaId) {
    return ST.archivosDe(tareaId).filter(function (a) { return !/^image\//.test(a.tipo || ''); });
  };

  ST.agregarArchivo = function (datos) {
    if (!ST.puede('archivo.agregar')) throw new Error('Su perfil no permite adjuntar archivos.');
    var f = M.nuevoArchivo(datos, sesion);
    cache.archivos.push(f);
    return CSN.db.put('archivos', f).then(function () {
      return registrarHistorial(porId('tareas', f.tareaId), 'Archivo adjuntado',
        '', '', (f.rol === 'fotografia' ? 'Fotografía' : 'Documento') + ' adjuntado: ' + f.nombre + ' (' + U.peso(f.peso || 0) + ')');
    }).then(function () {
      avisarCambio(); return f;
    });
  };

  ST.eliminarArchivo = function (id) {
    if (!ST.puede('archivo.eliminar')) throw new Error('Su perfil no permite eliminar archivos.');
    var f = porId('archivos', id);
    if (!f) throw new Error('Archivo no encontrado.');
    f._deleted = true;
    return guardar('archivos', f).then(function () { avisarCambio(); return true; });
  };

  /* ---------- Usuarios ---------- */
  ST.usuarios = function () { return U.ordenar(ST.todas('usuarios'), function (u) { return u.nombre; }, 'asc'); };

  ST.guardarUsuario = function (datos, clave) {
    if (!ST.puede('usuario.gestionar')) throw new Error('Su perfil no permite administrar usuarios.');
    var esNuevo = !datos.id;
    if (!String(datos.email || '').trim()) throw new Error('El correo electrónico es obligatorio.');
    var dup = ST.todas('usuarios').filter(function (u) {
      return String(u.email).toLowerCase() === String(datos.email).toLowerCase() && u.id !== datos.id;
    })[0];
    if (dup) throw new Error('Ya existe un usuario registrado con ese correo electrónico.');

    var rec = esNuevo ? M.nuevoUsuario(datos, sesion) : Object.assign({}, porId('usuarios', datos.id), datos);
    rec.email = String(rec.email).toLowerCase();
    var paso = Promise.resolve(rec);
    if (clave) {
      var salt = U.uid('s');
      paso = CSN.crypto.sha256(salt + '::' + clave).then(function (hash) {
        rec.hash = hash; rec.salt = salt; return rec;
      });
    } else if (esNuevo) {
      throw new Error('Debe definir una contraseña para el nuevo usuario.');
    }
    return paso.then(function (r) { return guardar('usuarios', r); }).then(function (r) {
      registrarBitacora(esNuevo ? 'Usuario creado' : 'Usuario modificado', r.nombre + ' (' + r.email + ') — perfil ' + r.perfil);
      avisarCambio(); return r;
    });
  };

  ST.eliminarUsuario = function (id) {
    if (!ST.puede('usuario.gestionar')) throw new Error('Su perfil no permite administrar usuarios.');
    if (sesion && sesion.id === id) throw new Error('No puede eliminar el usuario con el que está conectado.');
    var u = porId('usuarios', id);
    if (!u) throw new Error('Usuario no encontrado.');
    u._deleted = true;
    return guardar('usuarios', u).then(function () { avisarCambio(); return true; });
  };

  ST.restablecerClavesDemo = function () {
    if (!ST.puede('usuario.gestionar')) throw new Error('Su perfil no permite administrar usuarios.');
    var base = [
      { email: 'admin@csn.cl', clave: 'csn2026' },
      { email: 'supervisor@csn.cl', clave: 'supervisor2026' },
      { email: 'usuario@csn.cl', clave: 'usuario2026' }
    ];
    return Promise.all(base.map(function (b) {
      var u = ST.todas('usuarios').filter(function (x) { return x.email === b.email; })[0];
      if (!u) return crearUsuarioConClave('Usuario ' + b.email, b.email, b.clave, 'Usuario');
      var salt = U.uid('s');
      return CSN.crypto.sha256(salt + '::' + b.clave).then(function (hash) {
        u.hash = hash; u.salt = salt; return guardar('usuarios', u);
      });
    })).then(function () { U.toast('Credenciales de demostración restablecidas', 'ok'); });
  };

  /* ---------- Configuración ---------- */
  /**
   * Guarda la configuración.
   * @param patch                cambios a aplicar
   * @param opts.silencioso      no registra bitácora ni redibuja la interfaz
   * @param opts.soloLocal       no marca el registro como pendiente de enviar
   *                             (se usa para datos propios del dispositivo:
   *                              última sincronización, credenciales y claves)
   */
  ST.guardarConfig = function (patch, opts) {
    if (opts === undefined || opts === true || opts === false) opts = { silencioso: !!opts };
    var c = Object.assign({}, ST.config(), patch || {});
    c.id = 'config';
    c._ts = U.ms(); c._by = sesion ? sesion.nombre : 'Sistema'; c._dev = U.deviceId();
    if (!opts.soloLocal) c._nuevo = true;
    cache.config = [c];
    return CSN.db.put('config', c).then(function () {
      if (!opts.silencioso) { registrarBitacora('Configuración modificada', Object.keys(patch || {}).join(', ')); avisarCambio(); }
      return c;
    });
  };
  /** Cambios que sólo afectan a este dispositivo (no viajan a la nube) */
  ST.guardarConfigLocal = function (patch) { return ST.guardarConfig(patch, { silencioso: true, soloLocal: true }); };

  /* ---------- Vencimientos automáticos ---------- */
  function marcarVencidas(silencioso) {
    var cambios = [];
    ST.todas('tareas').forEach(function (t) {
      if (M.esCerrada(t.estado)) return;
      if (t.estado === 'Vencida') return;
      if (t.fechaLimite && U.diasHasta(t.fechaLimite) < 0) {
        var anterior = t.estado;
        t.estadoPrevio = anterior;
        t.estado = 'Vencida';
        cambios.push(guardar('tareas', t).then(function () {
          return registrarHistorial(t, 'Vencimiento automático del plazo', anterior, 'Vencida',
            'La tarea superó la fecha límite (' + U.fmtFecha(t.fechaLimite) + ') sin estar completada. Estado cambiado automáticamente a Vencida.');
        }));
      }
    });
    if (!cambios.length) return Promise.resolve(0);
    return Promise.all(cambios).then(function (r) {
      if (!silencioso) U.toast(r.length + ' tarea(s) marcada(s) como VENCIDA(S)', 'warn');
      avisarCambio();
      return r.length;
    });
  }
  ST.marcarVencidas = marcarVencidas;

  /* ---------- Búsqueda global ---------- */
  ST.buscar = function (termino, filtro) {
    filtro = filtro || {};
    var q = U.norm(termino);
    if (!q) return [];
    var res = [];
    ST.todas('tareas').forEach(function (t) {
      if (filtro.comunidadId && filtro.comunidadId !== 'todas' && t.comunidadId !== filtro.comunidadId) return;
      var c = ST.comunidad(t.comunidadId);
      var avances = ST.avancesDe(t.id);
      var archivos = ST.archivosDe(t.id);
      var campos = [
        { k: 'Tarea', v: t.titulo },
        { k: 'Descripción', v: t.descripcion },
        { k: 'Responsable', v: t.responsable },
        { k: 'Estado', v: t.estado },
        { k: 'Prioridad', v: t.prioridad },
        { k: 'Comentario final', v: t.comentarioFinal },
        { k: 'Comunidad', v: c ? c.nombre : '' },
        { k: 'Comuna', v: c ? c.comuna : '' },
        { k: 'Dirección', v: c ? (c.direccion + ' ' + (c.numero || '')) : '' },
        { k: 'Presidente', v: c ? c.presidente : '' },
        { k: 'Avances', v: avances.map(function (a) { return a.descripcion + ' ' + a.comentario + ' ' + a.usuario; }).join(' ') },
        { k: 'Archivos', v: archivos.map(function (a) { return a.nombre; }).join(' ') }
      ];
      var coincidencias = [];
      campos.forEach(function (f) {
        if (f.v && U.norm(f.v).indexOf(q) >= 0) coincidencias.push(f.k);
      });
      if (coincidencias.length) res.push({ tarea: t, comunidad: c, campos: coincidencias, avances: avances.length, archivos: archivos.length });
    });
    return res;
  };

  /* ---------- Conflictos ---------- */
  ST.conflictos = function (soloAbiertos) {
    var arr = ST.todas('conflictos');
    if (soloAbiertos) arr = arr.filter(function (c) { return !c.resuelto; });
    return U.ordenar(arr, function (c) { return c.id; }, 'desc');
  };
  ST.registrarConflicto = function (datos) {
    var c = M.nuevoConflicto(datos);
    cache.conflictos.push(c);
    return CSN.db.put('conflictos', c).then(function () {
      ST.emitir('conflicto', c);
      U.toast('Conflicto de sincronización detectado', 'warn');
      return c;
    });
  };
  ST.resolverConflicto = function (id, opcion) {
    var c = porId('conflictos', id);
    if (!c) throw new Error('Conflicto no encontrado.');
    var aplicar = opcion === 'remota' ? c.versionRemota : c.versionLocal;
    if (!aplicar) throw new Error('La versión seleccionada no está disponible.');
    var col = c.coleccion;
    var rec = Object.assign({}, aplicar);
    rec._ts = U.ms();
    rec._by = (sesion ? sesion.nombre : 'Sistema');
    rec._dev = U.deviceId();
    rec._nuevo = true;
    var lista = cache[col];
    var i = lista.map(function (x) { return x.id; }).indexOf(rec.id);
    if (i >= 0) lista[i] = rec; else lista.push(rec);
    c.resuelto = true;
    c.resolucion = 'Se aplicó la versión ' + (opcion === 'remota' ? 'remota' : 'local') + ' el ' + U.marca();
    return CSN.db.put(col, rec).then(function () { return guardar('conflictos', c); }).then(function () {
      registrarBitacora('Conflicto resuelto', c.coleccion + ' ' + c.registroId + ' — ' + c.resolucion);
      avisarCambio(); return true;
    });
  };

  /* ---------- Respaldos ---------- */
  ST.respaldo = function () {
    return CSN.db.volcar().then(function (volcado) {
      return {
        app: 'GESTIÓN DE TAREAS – CSN', version: 1, generado: U.marca(), dispositivo: U.deviceId(),
        usuario: sesion ? sesion.nombre : 'Sistema', datos: volcado
      };
    });
  };
  ST.restaurar = function (paquete, reemplazar) {
    if (!ST.puede('datos.gestionar')) throw new Error('Su perfil no permite restaurar respaldos.');
    var datos = paquete && paquete.datos ? paquete.datos : paquete;
    if (!datos || typeof datos !== 'object') throw new Error('El respaldo no tiene un formato válido.');
    if (reemplazar === false) {
      // Fusión: agrega o reemplaza registros tomando el más reciente
      var cols = Object.keys(datos);
      return cols.reduce(function (p, col) {
        return p.then(function () {
          return CSN.db.all(col).then(function (locales) {
            var mapa = {};
            locales.forEach(function (r) { mapa[r.id] = r; });
            (datos[col] || []).forEach(function (r) {
              var l = mapa[r.id];
              if (!l || (r._ts || 0) > (l._ts || 0)) mapa[r.id] = r;
            });
            return CSN.db.bulkPut(col, Object.keys(mapa).map(function (k) { return mapa[k]; }));
          });
        });
      }, Promise.resolve()).then(function () { return recargar(); });
    }
    return CSN.db.restaurar(datos).then(function () { return recargar(); });
  };

  ST.borrarTodo = function () {
    if (!ST.puede('datos.gestionar')) throw new Error('Su perfil no permite eliminar los datos.');
    return CSN.db.borrarTodo().then(function () {
      Object.keys(cache).forEach(function (k) { cache[k] = []; });
      return ST.iniciar();
    });
  };

  function recargar() {
    return Promise.all(Object.keys(cache).map(function (col) {
      return CSN.db.all(col).then(function (arr) { cache[col] = arr || []; });
    })).then(function () {
      avisarCambio();
      ST.emitir('recargado');
      return true;
    });
  }
  ST.recargar = recargar;

  /* ---------- Registros pendientes de sincronizar ---------- */
  ST.pendientes = function () {
    var cols = ['comunidades', 'tareas', 'avances', 'archivos', 'usuarios', 'historial', 'config'];
    var cuenta = 0, total = 0;
    cols.forEach(function (c) {
      cache[c].forEach(function (r) { total++; if (r._nuevo) cuenta++; });
    });
    return { pendientes: cuenta, total: total };
  };
  ST.marcarSincronizados = function (ids) {
    var cols = ['comunidades', 'tareas', 'avances', 'archivos', 'usuarios', 'historial', 'config'];
    var ops = [];
    cols.forEach(function (c) {
      cache[c].forEach(function (r) {
        if (r._nuevo && (!ids || ids.indexOf(r.id) >= 0)) {
          r._nuevo = false;
          ops.push(CSN.db.put(c, r));
        }
      });
    });
    return Promise.all(ops).then(function () { return ops.length; });
  };

  /* ---------- Estadísticas globales ---------- */
  ST.resumenGlobal = function () {
    var conf = ST.config();
    var tareas = ST.todas('tareas');
    var r = M.resumen(tareas, conf);
    r.comunidades = ST.comunidades(true).filter(function (c) { return c.estado !== 'Inactiva'; }).length;
    r.comunidadesTotales = ST.comunidades(true).length;
    r.usuarios = ST.todas('usuarios').length;
    r.porEstado = M.porEstado(tareas);
    r.porPrioridad = M.porPrioridad(tareas);
    r.porComunidad = ST.comunidades(true).map(function (c) {
      var ts = tareas.filter(function (t) { return t.comunidadId === c.id; });
      var res = M.resumen(ts, conf);
      res.comunidad = c;
      return res;
    });
    return r;
  };

  ST.stats = { cache: cache };
})(typeof window !== 'undefined' ? window : globalThis);
