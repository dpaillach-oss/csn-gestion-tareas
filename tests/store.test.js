/* ==========================================================================
   tests/store.test.js – Capa de negocio: CRUD, historial, vencimientos,
   búsqueda global, permisos por perfil y autenticación.
   Ejecutar:  node tests/store.test.js
   ========================================================================== */
'use strict';
const H = require('./harness');
const env = H.crearEntorno({ sinApp: true });
const { CSN } = env;
const U = CSN.util, M = CSN.model, S = CSN.store;

(async function main() {
  /* ---------- Inicio y datos iniciales ---------- */
  H.grupo('1. Inicio de la aplicación y datos iniciales');
  await S.iniciar();
  await S.login('admin@csn.cl', 'csn2026');   // las operaciones de negocio requieren sesión con permisos
  H.igual(S.comunidades().map((c) => c.nombre), ['ATALAYA', 'LA ESPUELA', 'VISTA VERDE II'], 'Se cargan las 3 comunidades de demostración');
  H.igual(S.todas('tareas').length, 10, 'Se cargan 10 tareas de ejemplo');
  H.igual(S.usuarios().length, 3, 'Se crean los 3 usuarios base');
  H.ok(!!S.config().empresa, 'La configuración tiene nombre de empresa');
  H.ok(['idb', 'local', 'memoria'].indexOf(CSN.db.modo) >= 0, 'Capa de almacenamiento inicializada (' + CSN.db.modo + ')');

  /* ---------- Vencimientos automáticos ---------- */
  H.grupo('2. Vencimiento automático de tareas');
  const vencidasAntes = S.todas('tareas').filter((t) => t.estado === 'Vencida');
  H.ok(vencidasAntes.length >= 2, 'Al iniciar, las tareas con plazo superado quedan como VENCIDA (' + vencidasAntes.length + ')');
  const primera = vencidasAntes[0];
  H.ok(S.historialDe(primera.id).some((h) => /Vencimiento automático/.test(h.accion)), 'El cambio automático queda registrado en el historial');
  H.ok(primera.estadoPrevio, 'Se conserva el estado anterior para poder revertirlo');
  // Una tarea cuya fecha límite se amplía vuelve a su estado anterior
  const tAmp = await S.guardarTarea({ id: primera.id, fechaLimite: U.sumarDias(U.hoy(), 10) });
  H.ok(tAmp.estado !== 'Vencida', 'Al ampliar el plazo la tarea deja de estar vencida');
  H.igual(tAmp.estadoPrevio, '', 'Se limpia el estado previo al revertir');

  /* ---------- Historial ---------- */
  H.grupo('3. Historial de modificaciones');
  const tH = await S.cambiarEstado(S.todas('tareas')[1].id, 'En proceso', 'Se autoriza inicio de trabajos');
  const hist1 = S.historialDe(tH.id);
  H.ok(hist1.length >= 1, 'El cambio de estado genera un registro de historial');
  const ultimo = hist1[0];
  H.igual(ultimo.accion, 'Cambio de estado', 'Se registra la acción');
  H.ok(!!ultimo.estadoAnterior && ultimo.estadoNuevo === 'En proceso', 'Se registran estado anterior y nuevo');
  H.igual(ultimo.comentario, 'Se autoriza inicio de trabajos', 'Se registra el comentario');
  H.ok(!!ultimo.usuario && !!ultimo.fecha && !!ultimo.hora, 'Se registran usuario, fecha y hora');
  H.ok(!!ultimo.dispositivo, 'Se registra el dispositivo que realizó el cambio');
  const tEdit = await S.guardarTarea({ id: tH.id, titulo: tH.titulo, descripcion: 'Descripción modificada en la prueba', prioridad: 'Alta' });
  const histEdit = S.historialDe(tEdit.id)[0];
  H.ok(/Descripción|Prioridad/.test(histEdit.comentario), 'La modificación de campos queda detallada en el historial');
  H.ok(/→/.test(histEdit.comentario), 'El historial muestra el valor anterior y el nuevo');

  /* ---------- Comunidades ---------- */
  H.grupo('4. Módulo de comunidades');
  const nuevaCom = await S.guardarComunidad({
    nombre: 'JARDINES DEL BOSQUE', direccion: 'Av. Central', numero: '1234', comuna: 'Ñuñoa', ciudad: 'Santiago',
    telefono: '+56 2 2000 0000', email: 'contacto@jardines.cl', presidente: 'Ana Silva', contacto: 'Conserjería'
  });
  H.ok(!!nuevaCom.id, 'Se crea una comunidad nueva con identificador propio');
  H.ok(nuevaCom._nuevo === true, 'La comunidad nueva queda marcada como pendiente de sincronizar');
  H.igual((await S.guardarComunidad({ id: nuevaCom.id, comuna: 'Providencia' })).comuna, 'Providencia', 'Se edita una comunidad existente');
  await H.esperar(() => S.comunidad(nuevaCom.id).comuna === 'Providencia', 1500);
  await S.desactivarComunidad(nuevaCom.id);
  H.falso(S.comunidades().some((c) => c.id === nuevaCom.id), 'La comunidad desactivada no aparece en el listado activo');
  H.ok(S.comunidades(true).some((c) => c.id === nuevaCom.id), 'La comunidad desactivada sí aparece al incluir inactivas');
  await S.desactivarComunidad(nuevaCom.id);
  H.ok(S.comunidades().some((c) => c.id === nuevaCom.id), 'Se puede reactivar la comunidad');
  H.lanza(() => S.guardarComunidad({ nombre: '' }), 'Se rechaza una comunidad sin nombre');

  /* ---------- Tareas ---------- */
  H.grupo('5. Módulo de tareas');
  H.lanza(() => S.guardarTarea({ titulo: 'Sin comunidad' }), 'Se rechaza una tarea sin comunidad');
  H.lanza(() => S.guardarTarea({ comunidadId: nuevaCom.id, titulo: '' }), 'Se rechaza una tarea sin nombre');
  const atalaya = S.comunidades().filter((c) => c.nombre === 'ATALAYA')[0];
  const tareaNueva = await S.guardarTarea({
    comunidadId: atalaya.id, titulo: 'Reparación filtración estacionamiento',
    descripcion: 'Filtración en muro norte del subterráneo', fechaLimite: U.sumarDias(U.hoy(), 5),
    prioridad: 'Urgente', responsable: 'Constructora Andes', avance: 0
  });
  H.igual(tareaNueva.comunidadId, atalaya.id, 'La tarea queda asociada a la comunidad');
  H.igual(tareaNueva.estado, 'Pendiente', 'Una tarea nueva nace Pendiente');
  H.ok(S.historialDe(tareaNueva.id).some((h) => h.accion === 'Creación de tarea'), 'La creación queda en el historial');
  H.ok(S.tareasDe(atalaya.id).some((t) => t.id === tareaNueva.id), 'La tarea aparece en el listado de la comunidad');

  /* ---------- Avances ---------- */
  H.grupo('6. Seguimiento de avances');
  const tareaAvance = S.todas('tareas').filter((t) => t.estado === 'Pendiente' && t.id !== tareaNueva.id)[0];
  const av1 = await S.agregarAvance({ tareaId: tareaAvance.id, porcentaje: 20, descripcion: 'Se realizó inspección', comentario: 'Origen detectado' });
  H.igual(S.tarea(tareaAvance.id).avance, 20, 'El avance de la tarea se actualiza al 20%');
  H.igual(S.tarea(tareaAvance.id).estado, 'En proceso', 'Al registrar avance la tarea pasa a En proceso');
  H.ok(S.historialDe(tareaAvance.id).some((h) => h.accion === 'Registro de avance'), 'El avance queda en el historial');
  await S.agregarAvance({ tareaId: tareaAvance.id, porcentaje: 50, descripcion: 'Se identificó el origen del problema' });
  const avancesOrden = S.avancesDe(tareaAvance.id);
  H.ok(avancesOrden.length >= 2, 'Los avances se almacenan cronológicamente');
  H.ok(avancesOrden[0].fecha >= avancesOrden[avancesOrden.length - 1].fecha, 'El avance más reciente aparece primero');
  H.igual(S.todas('avances').filter((a) => a.tareaId === tareaAvance.id).length, 2, 'Se registran los dos avances');
  H.igual(S.tarea(tareaAvance.id).avance, 50, 'El porcentaje de la tarea sigue el último avance');
  // Un avance menor no debe retroceder el porcentaje
  await S.agregarAvance({ tareaId: tareaAvance.id, porcentaje: 30, descripcion: 'Ajuste menor' });
  H.igual(S.tarea(tareaAvance.id).avance, 50, 'Un avance menor no disminuye el porcentaje acumulado');

  /* ---------- Archivos ---------- */
  H.grupo('7. Fotografías y documentos');
  const foto = await S.agregarArchivo({
    tareaId: tareaNueva.id, nombre: 'foto-inspeccion.jpg', tipo: 'image/jpeg', peso: 12345,
    contenido: 'data:image/jpeg;base64,UFJFQkE=', rol: 'fotografia'
  });
  const doc = await S.agregarArchivo({
    tareaId: tareaNueva.id, nombre: 'cotizacion.pdf', tipo: 'application/pdf', peso: 45000,
    contenido: 'data:application/pdf;base64,UFJFQkE=', rol: 'adjunto'
  });
  H.igual(S.fotosDe(tareaNueva.id).length, 1, 'La fotografía queda asociada a la tarea');
  H.igual(S.documentosDe(tareaNueva.id).length, 1, 'El documento queda asociado a la tarea');
  H.ok(S.historialDe(tareaNueva.id).some((h) => /Archivo adjuntado/.test(h.accion)), 'El archivo adjunto queda en el historial');
  H.igual(CSN.util.iconoArchivo('application/pdf', 'x.pdf'), '📕', 'Icono según tipo de archivo (PDF)');
  H.ok(!!foto.contenido && !!doc.contenido, 'El contenido de los archivos se almacena para sincronizarlo');

  /* ---------- Cierre de tarea ---------- */
  H.grupo('8. Cierre de tarea');
  const tareaCierre = S.todas('tareas').filter((t) => t.estado === 'En proceso')[0];
  await S.completarTarea(tareaCierre.id, {
    fechaCumplimiento: U.hoy(), avance: 100, comentario: 'Trabajo terminado y verificado', responsable: 'Empresa contratista'
  });
  const cerrada = S.tarea(tareaCierre.id);
  H.igual(cerrada.estado, 'Completada', 'La tarea queda Completada');
  H.igual(cerrada.avance, 100, 'El avance final queda en 100%');
  H.igual(cerrada.fechaCumplimiento, U.hoy(), 'Se registra la fecha de cumplimiento');
  H.igual(cerrada.comentarioFinal, 'Trabajo terminado y verificado', 'Se registra el comentario final');
  H.ok(S.historialDe(cerrada.id).some((h) => h.accion === 'Tarea completada'), 'El cierre queda en el historial con todo el seguimiento previo');
  H.ok(S.avancesDe(cerrada.id).length >= 1, 'Se registra un avance de cierre');
  H.ok(S.avancesDe(cerrada.id).some((a) => a.porcentaje === 100), 'El avance de cierre es del 100%');

  /* ---------- Filtros y ordenamiento ---------- */
  H.grupo('9. Filtros, ordenamiento y listados');
  H.igual(S.filtrarTareas({ comunidadId: atalaya.id }).every((t) => t.comunidadId === atalaya.id), true, 'Filtro por comunidad');
  H.ok(S.filtrarTareas({ vencidas: true }).every((t) => M.semaforo(t, S.config()).color === 'rojo'), 'Filtro de vencidas');
  H.ok(S.filtrarTareas({ proximas: true }).every((t) => M.semaforo(t, S.config()).color === 'amarillo'), 'Filtro de próximas a vencer');
  H.ok(S.filtrarTareas({ abiertas: true }).every((t) => !M.esCerrada(t.estado)), 'Filtro de tareas abiertas');
  H.ok(S.filtrarTareas({ urgentes: true }).every((t) => t.prioridad === 'Urgente'), 'Filtro de urgentes');
  H.ok(S.filtrarTareas({ estado: 'Completada' }).every((t) => t.estado === 'Completada'), 'Filtro por estado');
  const ord = S.filtrarTareas({ orden: 'vencimiento', dir: 'asc' });
  H.ok(ord[0].fechaLimite <= ord[ord.length - 1].fechaLimite, 'Ordenamiento ascendente por fecha de vencimiento');
  const ordSem = S.filtrarTareas({ orden: 'semaforo', dir: 'asc', abiertas: true });
  H.ok(ordSem.length === 0 || M.semaforo(ordSem[0], S.config()).orden <= M.semaforo(ordSem[ordSem.length - 1], S.config()).orden,
    'Ordenamiento por semáforo: lo más urgente primero');

  /* ---------- Búsqueda global ---------- */
  H.grupo('10. Buscador global');
  const rAsc = S.buscar('ascensor');
  H.ok(rAsc.length >= 2, 'La búsqueda «ASCENSOR» encuentra tareas de más de una comunidad (' + rAsc.length + ')');
  H.ok(new Set(rAsc.map((x) => x.comunidad ? x.comunidad.nombre : '')).size >= 2, 'Los resultados provienen de comunidades distintas');
  H.ok(S.buscar('ascensor', { comunidadId: atalaya.id }).every((x) => x.tarea.comunidadId === atalaya.id), 'La búsqueda respeta el filtro de comunidad');
  H.ok(S.buscar('FILTRACIÓN').length >= 1, 'La búsqueda ignora mayúsculas y tildes');
  H.ok(S.buscar('Constructora Andes').length >= 1, 'La búsqueda encuentra por responsable');
  H.ok(S.buscar('vencida').length >= 1 || S.buscar('Vencida').length >= 1, 'La búsqueda encuentra por estado');
  H.ok(S.buscar('urgente').length >= 1, 'La búsqueda encuentra por prioridad');
  H.ok(S.buscar('Origen detectado').length >= 1, 'La búsqueda encuentra palabras contenidas en los avances');
  H.ok(S.buscar('cotizacion.pdf').length >= 1, 'La búsqueda encuentra por nombre de archivo adjunto');
  H.ok(S.buscar('ATALAYA').length >= 1, 'La búsqueda encuentra por nombre de comunidad');
  H.igual(S.buscar(''), [], 'Sin término no devuelve resultados');
  H.igual(S.buscar('zzzzzz').length, 0, 'Sin coincidencias devuelve lista vacía');

  /* ---------- Eliminación lógica ---------- */
  H.grupo('11. Eliminación y desactivación');
  const tBorrar = tareaNueva;
  await S.eliminarTarea(tBorrar.id);
  H.igual(S.tarea(tBorrar.id), null, 'La tarea eliminada no se muestra');
  H.ok(S.todas('tareas').every((t) => t.id !== tBorrar.id), 'La tarea eliminada sale de los listados');
  const archivados = S.todas('archivos').filter((a) => a.tareaId === tBorrar.id);
  H.ok(archivados.length === 2, 'Los archivos de la tarea eliminada se conservan para el registro');

  /* ---------- Permisos y sesión ---------- */
  H.grupo('12. Usuarios, sesión y permisos');
  await H.esperar(() => S.usuarios().length === 3, 2000);
  let error = null;
  try { await S.login('admin@csn.cl', 'clave-incorrecta'); } catch (e) { error = e; }
  H.ok(error && /Contraseña incorrecta/.test(error.message), 'Se rechaza una contraseña incorrecta');
  error = null;
  try { await S.login('noexiste@csn.cl', 'x'); } catch (e) { error = e; }
  H.ok(error && /no existe/i.test(error.message), 'Se rechaza un correo no registrado');

  const admin = await S.login('admin@csn.cl', 'csn2026');
  H.igual(admin.perfil, 'Administrador', 'Ingreso como Administrador');
  H.ok(S.puede('tarea.crear') && S.puede('tarea.eliminar') && S.puede('usuario.gestionar') && S.puede('config.editar'), 'El Administrador tiene acceso total');

  await S.salir();
  await S.login('supervisor@csn.cl', 'supervisor2026');
  H.ok(S.puede('tarea.crear') && S.puede('tarea.editar') && S.puede('avance.crear'), 'El Supervisor puede crear y modificar tareas y avances');
  H.falso(S.puede('tarea.eliminar'), 'El Supervisor no puede eliminar tareas');
  H.falso(S.puede('usuario.gestionar'), 'El Supervisor no administra usuarios');
  H.falso(S.puede('config.editar'), 'El Supervisor no modifica la configuración');
  H.lanza(() => S.eliminarTarea(S.todas('tareas')[0].id), 'Al Supervisor se le impide eliminar tareas');

  await S.salir();
  await S.login('usuario@csn.cl', 'usuario2026');
  H.ok(S.puede('avance.crear') && S.puede('archivo.agregar'), 'El Usuario puede registrar avances y adjuntar archivos');
  H.falso(S.puede('tarea.crear'), 'El Usuario no puede crear tareas');
  H.falso(S.puede('tarea.editar'), 'El Usuario no puede modificar tareas');
  H.ok(S.sesion() && S.sesion().perfil === 'Usuario', 'La sesión queda activa con el perfil correcto');
  await S.salir();
  H.igual(S.sesion(), null, 'Al cerrar sesión no queda usuario activo');

  /* ---------- Configuración y respaldos ---------- */
  H.grupo('13. Configuración, respaldos y conflictos');
  await S.login('admin@csn.cl', 'csn2026');
  await S.guardarConfig({ umbralDias: 5, colorPrincipal: '#003090', syncModo: 'local' });
  H.igual(S.config().umbralDias, 5, 'La configuración se guarda (umbral de días)');
  const paquete = await S.respaldo();
  H.ok(paquete.datos && paquete.datos.tareas.length > 0, 'El respaldo incluye las tareas');
  H.ok(paquete.datos.comunidades.length >= 3, 'El respaldo incluye las comunidades');
  H.ok(paquete.generado && paquete.dispositivo, 'El respaldo incluye fecha y dispositivo');

  const cf = await S.registrarConflicto({
    tipo: 'Registro modificado en dos dispositivos', registroId: 'tar_demo_1', coleccion: 'tareas',
    usuarioLocal: 'Ana', usuarioRemoto: 'Luis', dispositivoLocal: 'dev-1', dispositivoRemoto: 'dev-2',
    detalle: 'Prueba de conflicto', versionLocal: { id: 'tar_demo_1', titulo: 'Local' }, versionRemota: { id: 'tar_demo_1', titulo: 'Remoto' }
  });
  H.igual(S.conflictos(true).length, 1, 'El conflicto queda registrado y visible');
  H.igual(S.conflictos(true)[0].dispositivoRemoto, 'dev-2', 'Se registra el dispositivo remoto');
  await S.resolverConflicto(cf.id, 'remota');
  H.igual(S.tarea('tar_demo_1').titulo, 'Remoto', 'Se aplica la versión elegida del conflicto');
  H.igual(S.conflictos(true).length, 0, 'El conflicto deja de estar pendiente');

  H.grupo('14. Bitácora de auditoría');
  const bit = S.bitacora();
  H.ok(bit.length > 0, 'La bitácora registra movimientos (' + bit.length + ')');
  H.ok(bit.some((b) => /Ingreso al sistema/.test(b.accion)), 'La bitácora registra los ingresos al sistema');
  H.ok(bit.every((b) => b.marca && b.usuario), 'Cada movimiento tiene fecha y usuario');

  H.resumen('store.test.js');
})().catch((e) => {
  console.error('\n✗ ERROR EN LA SUITE:', e);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 150);   // cierra los temporizadores de la aplicación
});
