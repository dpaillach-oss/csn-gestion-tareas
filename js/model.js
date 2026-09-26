/* ==========================================================================
   model.js – Modelo de datos y reglas de negocio
   Define constantes, fábricas de registros, cálculo del semáforo de
   vencimientos, indicadores y datos de demostración.
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util;
  var M = CSN.model = {};

  /* ---------- Constantes de negocio ---------- */
  M.PRIORIDADES = [
    { id: 'Baja', clase: 'b-baja', peso: 1 },
    { id: 'Media', clase: 'b-media', peso: 2 },
    { id: 'Alta', clase: 'b-alta', peso: 3 },
    { id: 'Urgente', clase: 'b-urgente', peso: 4 }
  ];
  M.ESTADOS = [
    { id: 'Pendiente', clase: 'b-pendiente', abierto: true },
    { id: 'En proceso', clase: 'b-proceso', abierto: true },
    { id: 'Pendiente de terceros', clase: 'b-terceros', abierto: true },
    { id: 'Completada', clase: 'b-completada', abierto: false },
    { id: 'Cancelada', clase: 'b-cancelada', abierto: false },
    { id: 'Vencida', clase: 'b-vencida', abierto: true }
  ];
  M.PERFILES = {
    'Administrador': { nivel: 3, desc: 'Acceso total: crea, edita, elimina, configura y administra usuarios.' },
    'Supervisor': { nivel: 2, desc: 'Puede consultar, crear y modificar tareas y avances de todas las comunidades.' },
    'Usuario': { nivel: 1, desc: 'Puede consultar las tareas asignadas y registrar avances, fotografías y documentos.' }
  };
  var MESES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  M.MESES_ABREV = MESES_ABREV;

  M.clasePrioridad = function (p) {
    var e = M.PRIORIDADES.filter(function (x) { return x.id === p; })[0];
    return e ? e.clase : 'b-media';
  };
  M.claseEstado = function (s) {
    var e = M.ESTADOS.filter(function (x) { return x.id === s; })[0];
    return e ? e.clase : 'b-pendiente';
  };
  M.esCerrada = function (s) { return s === 'Completada' || s === 'Cancelada'; };

  /* ---------- Metadatos de sincronización ---------- */
  M.sello = function (usuario, dispositivo) {
    var a = U.ahora();
    return { _ts: U.ms(), _marca: a.marca, _by: (usuario && usuario.nombre) || 'Sistema', _dev: dispositivo || U.deviceId() };
  };
  function conMeta(rec, usuario, dispositivo) {
    var s = M.sello(usuario, dispositivo);
    rec._ts = s._ts; rec._marca = s._marca; rec._by = s._by; rec._dev = s._dev;
    rec._deleted = false;
    rec._nuevo = true;           // pendiente de enviar a la nube
    return rec;
  }
  M.conMeta = conMeta;

  /* ---------- Configuración por defecto ---------- */
  M.configPorDefecto = function () {
    return {
      id: 'config',
      empresa: 'CSN Gestión de Activos Inmobiliarios SPA',
      nombreApp: 'GESTIÓN DE TAREAS',
      logo: 'assets/logo.png',
      colorPrincipal: '#003090',
      colorSecundario: '#60cc24',
      umbralDias: 3,
      zonaHoraria: 'America/Santiago',
      pieInforme: 'Documento generado automáticamente por el sistema de Gestión de Tareas.',
      firmante: 'Administrador',
      // Sincronización
      syncModo: 'local',              // local | gist | supabase
      syncClave: '',                  // clave de cifrado (gist)
      gistId: '',                     // identificador del Gist
      gistToken: '',                  // token de GitHub
      supabaseUrl: '',
      supabaseKey: '',
      supabaseTabla: 'csn_registros',
      syncIntervalo: 20,              // segundos entre sincronizaciones automáticas
      syncAuto: true,
      ultimaSync: '',
      ultimaSyncEstado: '',
      _ts: U.ms(), _by: 'Sistema', _dev: 'config', _deleted: false
    };
  };

  /* ---------- Fábricas ---------- */
  M.nuevaComunidad = function (datos, usuario) {
    var c = {
      id: U.uid('com'),
      nombre: '', direccion: '', numero: '', comuna: '', ciudad: '', telefono: '', email: '',
      presidente: '', contacto: '', observaciones: '', estado: 'Activa',
      fechaCreacion: U.hoy()
    };
    Object.keys(datos || {}).forEach(function (k) { c[k] = datos[k]; });
    return conMeta(c, usuario);
  };

  M.nuevaTarea = function (datos, usuario) {
    var t = {
      id: U.uid('tar'),
      comunidadId: '', titulo: '', descripcion: '',
      fechaCreacion: U.hoy(), fechaLimite: '', fechaProgramada: '',
      prioridad: 'Media', estado: 'Pendiente', avance: 0,
      responsable: '', fechaCumplimiento: '', comentarioFinal: '',
      estadoPrevio: '', ordenRuta: 0
    };
    Object.keys(datos || {}).forEach(function (k) { t[k] = datos[k]; });
    return conMeta(t, usuario);
  };

  M.nuevoAvance = function (datos, usuario) {
    var a = U.ahora();
    var r = {
      id: U.uid('ava'), tareaId: '', fecha: a.fecha, hora: a.hora,
      usuario: (usuario && usuario.nombre) || '', porcentaje: 0, descripcion: '', comentario: '', archivos: []
    };
    Object.keys(datos || {}).forEach(function (k) { r[k] = datos[k]; });
    return conMeta(r, usuario);
  };

  M.nuevoArchivo = function (datos, usuario) {
    var a = U.ahora();
    var f = {
      id: U.uid('arc'), tareaId: '', avanceId: '', nombre: '', tipo: '', peso: 0,
      contenido: '',          // dataURL (se almacena localmente y se sincroniza cifrado)
      remoto: '',             // URL en el almacenamiento en la nube (si aplica)
      rol: 'documento',       // adjunto | avance | cierre | fotografia
      usuario: (usuario && usuario.nombre) || '', fecha: a.fecha, hora: a.hora
    };
    Object.keys(datos || {}).forEach(function (k) { f[k] = datos[k]; });
    return conMeta(f, usuario);
  };

  M.nuevoUsuario = function (datos, usuario) {
    var u = {
      id: U.uid('usr'), nombre: '', email: '', perfil: 'Usuario', estado: 'Activo',
      telefono: '', cargo: '', comunidades: [], creado: U.hoy(), ultimoAcceso: '',
      hash: '', salt: ''
    };
    Object.keys(datos || {}).forEach(function (k) { u[k] = datos[k]; });
    return conMeta(u, usuario);
  };

  M.nuevoHistorial = function (datos, usuario) {
    var a = U.ahora();
    var h = {
      id: U.uid('his'), tareaId: '', comunidadId: '', usuario: (usuario && usuario.nombre) || 'Sistema',
      fecha: a.fecha, hora: a.hora, marca: a.marca, accion: '', estadoAnterior: '', estadoNuevo: '',
      comentario: '', dispositivo: U.deviceId(), origen: 'app'
    };
    Object.keys(datos || {}).forEach(function (k) { h[k] = datos[k]; });
    h._ts = U.ms(); h._by = h.usuario; h._dev = h.dispositivo; h._deleted = false;
    return h;
  };

  M.nuevoConflicto = function (datos) {
    var a = U.ahora();
    var c = {
      id: U.uid('cnf'), tipo: '', registroId: '', coleccion: '', fecha: a.fecha, hora: a.hora,
      dispositivoLocal: U.deviceId(), dispositivoRemoto: '', usuarioLocal: '', usuarioRemoto: '',
      detalle: '', versionLocal: null, versionRemota: null, resuelto: false
    };
    Object.keys(datos || {}).forEach(function (k) { c[k] = datos[k]; });
    c._ts = U.ms(); c._deleted = false;
    return c;
  };

  /* ---------- Semáforo de vencimientos ---------- */
  /**
   * Calcula el estado visual de una tarea.
   * @returns {{color:string, texto:string, dias:number|null, clase:string, orden:number}}
   *   color: verde | amarillo | rojo | gris
   */
  M.semaforo = function (tarea, config) {
    var umbral = (config && +config.umbralDias) || 3;
    if (!tarea) return { color: 'gris', texto: 'Sin información', dias: null, clase: 'sem-gris', orden: 9 };

    if (tarea.estado === 'Completada') {
      var atrasada = tarea.fechaCumplimiento && tarea.fechaLimite && tarea.fechaCumplimiento > tarea.fechaLimite;
      return atrasada
        ? { color: 'gris', texto: 'Cumplida con atraso', dias: null, clase: 'sem-gris', orden: 7 }
        : { color: 'verde', texto: 'Cumplida en plazo', dias: null, clase: 'sem-verde', orden: 8 };
    }
    if (tarea.estado === 'Cancelada') {
      return { color: 'gris', texto: 'Cancelada', dias: null, clase: 'sem-gris', orden: 9 };
    }
    if (!tarea.fechaLimite) {
      return { color: 'gris', texto: 'Sin fecha límite', dias: null, clase: 'sem-gris', orden: 6 };
    }
    var dias = U.diasHasta(tarea.fechaLimite);
    if (dias < 0) {
      return { color: 'rojo', texto: 'VENCIDA', dias: dias, clase: 'sem-rojo', orden: 0 };
    }
    if (dias <= umbral) {
      return {
        color: 'amarillo', dias: dias, orden: 1,
        texto: dias === 0 ? 'VENCE HOY' : (dias === 1 ? 'VENCE MAÑANA' : 'PRÓXIMA A VENCER (' + dias + ' días)'),
        clase: 'sem-amarillo'
      };
    }
    return { color: 'verde', texto: 'EN PLAZO' + (dias <= 30 ? ' (' + dias + ' días)' : ''), dias: dias, clase: 'sem-verde', orden: 2 };
  };

  /** ¿La tarea está "próxima a vencer"? */
  M.esProxima = function (tarea, config) {
    return M.semaforo(tarea, config).color === 'amarillo';
  };
  M.esVencida = function (tarea, config) {
    return M.semaforo(tarea, config).color === 'rojo';
  };

  /* ---------- Indicadores ---------- */
  M.resumen = function (tareas, config) {
    var r = {
      total: tareas.length, pendientes: 0, proceso: 0, terceros: 0, vencidas: 0, urgentes: 0,
      completadas: 0, canceladas: 0, proximas: 0, sinAvance: 0, cumplimiento: 0, avancePromedio: 0
    };
    var sumaAvance = 0, base = 0;
    tareas.forEach(function (t) {
      var sem = M.semaforo(t, config);
      if (t.estado === 'Pendiente' || t.estado === 'Vencida') r.pendientes++;
      if (t.estado === 'En proceso') r.proceso++;
      if (t.estado === 'Pendiente de terceros') r.terceros++;
      if (t.estado === 'Completada') r.completadas++;
      if (t.estado === 'Cancelada') r.canceladas++;
      if (sem.color === 'rojo') r.vencidas++;
      if (sem.color === 'amarillo') r.proximas++;
      if (t.prioridad === 'Urgente' && !M.esCerrada(t.estado)) r.urgentes++;
      if (!t.avance) r.sinAvance++;
      sumaAvance += (+t.avance || 0);
      if (!M.esCerrada(t.estado) || t.estado === 'Completada') base++;
    });
    r.cumplimiento = U.pct(r.completadas, r.total - r.canceladas);
    r.avancePromedio = r.total ? Math.round(sumaAvance / r.total) : 0;
    return r;
  };

  M.porComunidad = function (tareas) {
    var g = U.groupBy(tareas, function (t) { return t.comunidadId || 'sin'; });
    return g;
  };

  M.porEstado = function (tareas) {
    return M.ESTADOS.map(function (e) {
      return { estado: e.id, clase: e.clase, n: tareas.filter(function (t) { return t.estado === e.id; }).length };
    });
  };

  M.porPrioridad = function (tareas) {
    return M.PRIORIDADES.map(function (p) {
      return { prioridad: p.id, clase: p.clase, n: tareas.filter(function (t) { return t.prioridad === p.id; }).length };
    });
  };

  /* ---------- Datos de demostración ---------- */
  M.datosDemo = function (usuario) {
    var usr = usuario || { nombre: 'Administrador' };
    var hoy = U.hoy();
    var d = function (n) { return U.sumarDias(hoy, n); };

    var comunidades = [
      M.nuevaComunidad({
        id: 'com_demo_atalaya',
        nombre: 'ATALAYA', direccion: 'Av. Los Aromos', numero: '1450', comuna: 'Vitacura', ciudad: 'Santiago',
        telefono: '+56 2 2345 6789', email: 'administracion@atalaya.cl', presidente: 'Patricia Núñez',
        contacto: 'Conserjería 24 h — Sr. Hugo Ramos', observaciones: 'Condominio de 4 torres, 168 departamentos, 2 subterráneos.'
      }, usr),
      M.nuevaComunidad({
        id: 'com_demo_espuela',
        nombre: 'LA ESPUELA', direccion: 'Camino La Espuela', numero: '820', comuna: 'Lo Barnechea', ciudad: 'Santiago',
        telefono: '+56 2 2987 1122', email: 'contacto@laespuela.cl', presidente: 'Rodrigo Vergara',
        contacto: 'Sra. Marcela Soto (administración)', observaciones: 'Condominio de casas, 46 unidades, áreas verdes amplias.'
      }, usr),
      M.nuevaComunidad({
        id: 'com_demo_vistaverde',
        nombre: 'VISTA VERDE II', direccion: 'Pasaje Vista Verde', numero: '77', comuna: 'Colina', ciudad: 'Santiago',
        telefono: '+56 2 2765 4433', email: 'vistaverde2@csn.cl', presidente: 'Claudia Reyes',
        contacto: 'Sra. Teresa Fuentes (comité)', observaciones: 'Edificio único de 8 pisos, 64 departamentos, sala de eventos.'
      }, usr)
    ];
    var atalaya = comunidades[0], espuela = comunidades[1], vista = comunidades[2];

    var tareas = [
      // ATALAYA – vencida
      M.nuevaTarea({
        comunidadId: atalaya.id, titulo: 'Reparación filtración estacionamiento subterráneo',
        descripcion: 'Filtración detectada en muro perimetral del subterráneo -2, sector norte. Se requiere diagnóstico de especialista, sello de fisuras y reposición de pintura.',
        fechaCreacion: d(-42), fechaLimite: d(-9), prioridad: 'Urgente', estado: 'En proceso', avance: 60,
        responsable: 'Constructora Andes Ltda. / Juan Pérez'
      }, usr),
      // ATALAYA – próxima a vencer (amarillo)
      M.nuevaTarea({
        comunidadId: atalaya.id, titulo: 'Mantención anual ascensor torre B',
        descripcion: 'Mantención preventiva semestral de ascensor torre B: revisión de cables, frenos, puertas y certificación vigente.',
        fechaCreacion: d(-20), fechaLimite: d(2), prioridad: 'Alta', estado: 'Pendiente', avance: 25,
        responsable: 'Ascensores Vertical S.A.'
      }, usr),
      // ATALAYA – en plazo
      M.nuevaTarea({
        comunidadId: atalaya.id, titulo: 'Limpieza y mantención de piscina',
        descripcion: 'Cambio de arena del filtro, ajuste químico y limpieza profunda de piscina antes de la temporada de verano.',
        fechaCreacion: d(-12), fechaLimite: d(24), prioridad: 'Media', estado: 'En proceso', avance: 40,
        responsable: 'Servicios Acuáticos SpA'
      }, usr),
      // ATALAYA – completada
      M.nuevaTarea({
        comunidadId: atalaya.id, titulo: 'Reparación portón acceso vehicular',
        descripcion: 'Reemplazo de motor y cremallera del portón automático de acceso vehicular principal.',
        fechaCreacion: d(-55), fechaLimite: d(-20), prioridad: 'Alta', estado: 'Completada', avance: 100,
        responsable: 'Automatización Rojas', fechaCumplimiento: d(-22),
        comentarioFinal: 'Motor reemplazado y programado. Se entregaron 2 controles adicionales a conserjería. Garantía 12 meses.'
      }, usr),
      // LA ESPUELA – pendiente de terceros
      M.nuevaTarea({
        comunidadId: espuela.id, titulo: 'Poda de árboles sector acceso',
        descripcion: 'Poda de 8 árboles de alto porte y retiro de desechos vegetales. Requiere autorización municipal previa.',
        fechaCreacion: d(-18), fechaLimite: d(9), prioridad: 'Media', estado: 'Pendiente de terceros', avance: 15,
        responsable: 'Municipalidad de Lo Barnechea / Jardines del Valle'
      }, usr),
      // LA ESPUELA – vencida
      M.nuevaTarea({
        comunidadId: espuela.id, titulo: 'Cambio de luminarias exteriores por LED',
        descripcion: 'Reemplazo de 24 luminarias exteriores por tecnología LED para reducir consumo eléctrico del condominio.',
        fechaCreacion: d(-70), fechaLimite: d(-4), prioridad: 'Alta', estado: 'Pendiente', avance: 10,
        responsable: 'Eléctrica Núñez'
      }, usr),
      // LA ESPUELA – en plazo
      M.nuevaTarea({
        comunidadId: espuela.id, titulo: 'Inspección trimestral red de agua potable',
        descripcion: 'Revisión de medidores, llaves de paso y detección de fugas en la red de agua potable del condominio.',
        fechaCreacion: d(-6), fechaLimite: d(38), prioridad: 'Baja', estado: 'Pendiente', avance: 0,
        responsable: 'Administración CSN'
      }, usr),
      // VISTA VERDE II – urgente próxima a vencer
      M.nuevaTarea({
        comunidadId: vista.id, titulo: 'Reparación de ascensor principal detenido',
        descripcion: 'Ascensor principal fuera de servicio. Se requiere atención inmediata de la empresa mantenedora y certificación posterior.',
        fechaCreacion: d(-3), fechaLimite: d(1), prioridad: 'Urgente', estado: 'En proceso', avance: 55,
        responsable: 'Ascensores Vertical S.A. / Conserjería'
      }, usr),
      // VISTA VERDE II – completada
      M.nuevaTarea({
        comunidadId: vista.id, titulo: 'Certificación de extintores y red húmeda',
        descripcion: 'Recarga de 18 extintores, prueba de red húmeda y entrega de certificados a la administración.',
        fechaCreacion: d(-40), fechaLimite: d(-10), prioridad: 'Alta', estado: 'Completada', avance: 100,
        responsable: 'Prevención Total Ltda.', fechaCumplimiento: d(-12),
        comentarioFinal: '18 extintores recargados y certificados. Prueba de red húmeda conforme. Certificados archivados en carpeta de la comunidad.'
      }, usr),
      // VISTA VERDE II – cancelada
      M.nuevaTarea({
        comunidadId: vista.id, titulo: 'Instalación de quincho en azotea',
        descripcion: 'Proyecto de habilitación de quincho comunitario en azotea. Evaluación estructural pendiente.',
        fechaCreacion: d(-30), fechaLimite: d(40), prioridad: 'Baja', estado: 'Cancelada', avance: 0,
        responsable: 'Comité / Administración',
        comentarioFinal: 'Proyecto suspendido por acuerdo de asamblea hasta contar con informe estructural.'
      }, usr)
    ];

    // Identificadores estables para los datos de demostración (evita duplicados entre dispositivos)
    tareas.forEach(function (t, i) { t.id = 'tar_demo_' + (i + 1); });

    // Avances de ejemplo
    var avances = [
      M.nuevoAvance({ tareaId: tareas[0].id, fecha: d(-30), hora: '10:15', porcentaje: 20, descripcion: 'Se realizó inspección visual con especialista.', comentario: 'Se detectó fisura activa en muro norte, con escurrimiento permanente.', usuario: 'Administrador' }, usr),
      M.nuevoAvance({ tareaId: tareas[0].id, fecha: d(-18), hora: '16:40', porcentaje: 40, descripcion: 'Se identificó el origen del problema.', comentario: 'Origen: junta de dilatación sin sello hidrófugo. Se solicitó cotización de reparación.', usuario: 'Supervisor' }, usr),
      M.nuevoAvance({ tareaId: tareas[0].id, fecha: d(-5), hora: '09:05', porcentaje: 60, descripcion: 'Inicio de trabajos de sellado e inyección de resina.', comentario: 'Trabajos en ejecución, se informa avance semanal al comité.', usuario: 'Supervisor' }, usr),
      M.nuevoAvance({ tareaId: tareas[1].id, fecha: d(-6), hora: '12:20', porcentaje: 25, descripcion: 'Solicitud de visita técnica enviada a la empresa mantenedora.', comentario: 'Confirmada visita para la próxima semana.', usuario: 'Administrador' }, usr),
      M.nuevoAvance({ tareaId: tareas[2].id, fecha: d(-4), hora: '11:30', porcentaje: 40, descripcion: 'Vaciado y limpieza de piscina ejecutado.', comentario: 'Pendiente cambio de arena del filtro.', usuario: 'Supervisor' }, usr),
      M.nuevoAvance({ tareaId: tareas[7].id, fecha: d(-1), hora: '08:10', porcentaje: 55, descripcion: 'Técnico en terreno, se reemplazó tarjeta de control.', comentario: 'Ascensor en pruebas de funcionamiento. Se informó a los copropietarios.', usuario: 'Administrador' }, usr),
      M.nuevoAvance({ tareaId: tareas[5].id, fecha: d(-25), hora: '15:00', porcentaje: 10, descripcion: 'Se recibió cotización de 24 luminarias LED.', comentario: 'Pendiente aprobación del comité.', usuario: 'Administrador' }, usr)
    ];

    // Historial de ejemplo
    var historial = [];
    tareas.forEach(function (t) {
      historial.push(M.nuevoHistorial({
        tareaId: t.id, comunidadId: t.comunidadId, accion: 'Creación de tarea', estadoAnterior: '', estadoNuevo: 'Pendiente',
        comentario: 'Tarea registrada en el sistema por ' + usr.nombre + '.', usuario: usr.nombre, fecha: t.fechaCreacion, hora: '09:00'
      }, usr));
    });
    historial.push(M.nuevoHistorial({
      tareaId: tareas[0].id, comunidadId: tareas[0].comunidadId, accion: 'Cambio de estado', estadoAnterior: 'Pendiente', estadoNuevo: 'En proceso',
      comentario: 'Se autoriza inicio de trabajos por acuerdo del comité.', usuario: 'Supervisor', fecha: d(-20), hora: '11:45'
    }, usr));
    historial.push(M.nuevoHistorial({
      tareaId: tareas[5].id, comunidadId: tareas[5].comunidadId, accion: 'Cambio de fecha límite', estadoAnterior: 'Pendiente', estadoNuevo: 'Pendiente',
      comentario: 'Plazo original ampliado a solicitud del comité.', usuario: 'Administrador', fecha: d(-15), hora: '17:20'
    }, usr));
    historial.push(M.nuevoHistorial({
      tareaId: tareas[3].id, comunidadId: tareas[3].comunidadId, accion: 'Tarea completada', estadoAnterior: 'En proceso', estadoNuevo: 'Completada',
      comentario: 'Motor reemplazado y programado. Se entregaron 2 controles adicionales.', usuario: usr.nombre, fecha: tareas[3].fechaCumplimiento, hora: '18:30'
    }, usr));
    // Identificadores e indicadores de sincronización de los datos de demostración
    avances.forEach(function (a, i) { a.id = 'ava_demo_' + (i + 1); a._nuevo = false; });
    historial.forEach(function (h, i) { h.id = 'his_demo_' + (i + 1); h._nuevo = false; });

    var usuarios = [
      M.nuevoUsuario({ nombre: 'Administrador CSN', email: 'admin@csn.cl', perfil: 'Administrador', cargo: 'Administrador General' }, usr),
      M.nuevoUsuario({ nombre: 'Supervisor de Terreno', email: 'supervisor@csn.cl', perfil: 'Supervisor', cargo: 'Supervisor de Mantención' }, usr),
      M.nuevoUsuario({ nombre: 'Usuario Consulta', email: 'usuario@csn.cl', perfil: 'Usuario', cargo: 'Asistente Administrativo' }, usr)
    ];
    comunidades.forEach(function (c) {
      c._nuevo = false;
      c.fechaCreacion = d(-90);
    });
    tareas.forEach(function (t) { t._nuevo = false; });

    return { comunidades: comunidades, tareas: tareas, avances: avances, historial: historial, usuarios: usuarios };
  };
})(typeof window !== 'undefined' ? window : globalThis);
