/* ==========================================================================
   tests/model.test.js – Reglas de negocio: semáforo, indicadores y datos demo
   Ejecutar:  node tests/model.test.js
   ========================================================================== */
'use strict';
const H = require('./harness');
const env = H.crearEntorno({ sinApp: true });
const { CSN } = env;
const U = CSN.util, M = CSN.model;

H.grupo('1. Utilidades de fecha');
H.igual(U.pad2(7), '07', 'pad2 rellena con cero');
H.ok(/^\d{4}-\d{2}-\d{2}$/.test(U.hoy()), 'hoy() entrega formato YYYY-MM-DD');
H.igual(U.diasHasta(U.hoy()), 0, 'diasHasta(hoy) = 0');
H.igual(U.diasHasta(U.sumarDias(U.hoy(), 5)), 5, 'diasHasta(+5 días) = 5');
H.igual(U.diasHasta(U.sumarDias(U.hoy(), -3)), -3, 'diasHasta(-3 días) = -3');
H.igual(U.fmtFecha('2026-09-05'), '05/09/2026', 'fmtFecha en formato dd/mm/aaaa');
H.igual(U.txtVencimiento(0), 'Vence hoy', 'Texto «vence hoy»');
H.igual(U.txtVencimiento(-2), 'Vencida hace 2 días', 'Texto «vencida hace N días»');
H.igual(U.norm('Filtración ASCENSOR Ñuñoa'), 'filtracion ascensor nunoa', 'norm quita tildes y ñ');
H.igual(U.peso(2048), '2 KB', 'Formato de peso');
H.igual(U.iniciales('Juan Pérez'), 'JP', 'Iniciales del nombre');

H.grupo('2. Semáforo de vencimientos');
const conf = M.configPorDefecto();
const tarea = (extra) => Object.assign(M.nuevaTarea({ titulo: 'Prueba', fechaLimite: U.hoy() }, { nombre: 'Test' }), extra);

H.igual(M.semaforo(tarea({ fechaLimite: U.sumarDias(U.hoy(), 10) }), conf).color, 'verde', 'Más de 3 días → VERDE en plazo');
H.igual(M.semaforo(tarea({ fechaLimite: U.sumarDias(U.hoy(), 3) }), conf).color, 'amarillo', '3 días → AMARILLO (umbral 3)');
H.igual(M.semaforo(tarea({ fechaLimite: U.sumarDias(U.hoy(), 1) }), conf).color, 'amarillo', '1 día → AMARILLO');
H.igual(M.semaforo(tarea({ fechaLimite: U.hoy() }), conf).texto, 'VENCE HOY', 'Vence hoy muestra el texto correspondiente');
H.igual(M.semaforo(tarea({ fechaLimite: U.sumarDias(U.hoy(), -1) }), conf).color, 'rojo', 'Fecha pasada → ROJO vencida');
H.igual(M.semaforo(tarea({ fechaLimite: U.sumarDias(U.hoy(), -1) }), conf).texto, 'VENCIDA', 'Texto VENCIDA');
H.igual(M.semaforo(tarea({ fechaLimite: '' }), conf).color, 'gris', 'Sin fecha límite → sin semáforo');
H.igual(M.semaforo(tarea({ fechaLimite: U.hoy(), estado: 'Completada', fechaCumplimiento: U.hoy() }), conf).texto, 'Cumplida en plazo', 'Completada dentro del plazo');
H.igual(M.semaforo(tarea({ fechaLimite: U.sumarDias(U.hoy(), -5), estado: 'Completada', fechaCumplimiento: U.hoy() }), conf).texto, 'Cumplida con atraso', 'Completada con atraso');
H.igual(M.semaforo(tarea({ fechaLimite: U.hoy(), estado: 'Cancelada' }), conf).texto, 'Cancelada', 'Tarea cancelada no entra al semáforo');

H.grupo('3. Umbral configurable');
const conf7 = Object.assign({}, conf, { umbralDias: 7 });
H.igual(M.semaforo(tarea({ fechaLimite: U.sumarDias(U.hoy(), 5) }), conf7).color, 'amarillo', 'Con umbral 7, 5 días es AMARILLO');
H.igual(M.semaforo(tarea({ fechaLimite: U.sumarDias(U.hoy(), 8) }), conf7).color, 'verde', 'Con umbral 7, 8 días es VERDE');
H.ok(M.esProxima(tarea({ fechaLimite: U.sumarDias(U.hoy(), 2) }), conf), 'esProxima() identifica próximas a vencer');
H.ok(M.esVencida(tarea({ fechaLimite: U.sumarDias(U.hoy(), -2) }), conf), 'esVencida() identifica vencidas');

H.grupo('4. Indicadores y resumen');
const conjunto = [
  tarea({ titulo: 'A', fechaLimite: U.sumarDias(U.hoy(), 20), estado: 'Pendiente', prioridad: 'Media' }),
  tarea({ titulo: 'B', fechaLimite: U.sumarDias(U.hoy(), 2), estado: 'En proceso', prioridad: 'Urgente', avance: 40 }),
  tarea({ titulo: 'C', fechaLimite: U.sumarDias(U.hoy(), -4), estado: 'Pendiente', prioridad: 'Alta', avance: 10 }),
  tarea({ titulo: 'D', fechaLimite: U.sumarDias(U.hoy(), -10), estado: 'Completada', prioridad: 'Alta', avance: 100, fechaCumplimiento: U.sumarDias(U.hoy(), -12) }),
  tarea({ titulo: 'E', fechaLimite: U.sumarDias(U.hoy(), 30), estado: 'Cancelada', prioridad: 'Baja' })
];
const r = M.resumen(conjunto, conf);
H.igual(r.total, 5, 'Total de tareas');
H.igual(r.pendientes, 2, 'Pendientes = 2');
H.igual(r.proceso, 1, 'En proceso = 1');
H.igual(r.vencidas, 1, 'Vencidas = 1 (tarea C)');
H.igual(r.proximas, 1, 'Próximas a vencer = 1 (tarea B)');
H.igual(r.urgentes, 1, 'Urgentes abiertas = 1');
H.igual(r.completadas, 1, 'Completadas = 1');
H.igual(r.canceladas, 1, 'Canceladas = 1');
H.igual(r.cumplimiento, 25, 'Cumplimiento = 25% (1 de 4 vigentes)');
H.igual(r.avancePromedio, 30, 'Avance promedio = 30%');
H.igual(M.porEstado(conjunto).reduce((a, e) => a + e.n, 0), 5, 'porEstado() suma el total');
H.igual(M.porPrioridad(conjunto).reduce((a, p) => a + p.n, 0), 5, 'porPrioridad() suma el total');
H.igual(M.clasePrioridad('Urgente'), 'b-urgente', 'Clase visual de prioridad Urgente');
H.igual(M.claseEstado('Vencida'), 'b-vencida', 'Clase visual del estado Vencida');
H.ok(M.esCerrada('Completada') && M.esCerrada('Cancelada') && !M.esCerrada('Pendiente'), 'esCerrada() reconoce estados finales');

H.grupo('5. Datos de demostración');
const demo = M.datosDemo({ nombre: 'Administrador' });
H.igual(demo.comunidades.length, 3, 'Se crean 3 comunidades de demostración');
H.igual(demo.comunidades.map((c) => c.nombre), ['ATALAYA', 'LA ESPUELA', 'VISTA VERDE II'], 'Nombres de las comunidades de demostración');
H.igual(demo.tareas.length, 10, 'Se crean 10 tareas de ejemplo');
H.ok(demo.tareas.every((t) => t.comunidadId && demo.comunidades.some((c) => c.id === t.comunidadId)), 'Todas las tareas están asociadas a una comunidad');
H.igual(demo.tareas.filter((t) => t.estado === 'Completada').length, 2, 'Hay tareas completadas de ejemplo');
H.igual(demo.tareas.filter((t) => t.estado === 'Cancelada').length, 1, 'Hay una tarea cancelada de ejemplo');
H.ok(demo.tareas.some((t) => t.prioridad === 'Urgente' && M.semaforo(t, conf).color === 'amarillo'), 'Existe una tarea urgente próxima a vencer');
H.ok(demo.tareas.filter((t) => M.semaforo(t, conf).color === 'rojo').length >= 2, 'Existen tareas vencidas de ejemplo');
H.ok(demo.tareas.some((t) => t.estado === 'Pendiente de terceros'), 'Existe una tarea pendiente de terceros');
H.igual(demo.avances.length, 7, 'Se crean avances de ejemplo');
H.ok(demo.avances.every((a) => demo.tareas.some((t) => t.id === a.tareaId)), 'Los avances apuntan a tareas existentes');
H.ok(demo.historial.length >= 10, 'Se crea historial de ejemplo');
H.igual(demo.comunidades[0].id, 'com_demo_atalaya', 'Identificadores estables para evitar duplicados entre dispositivos');
H.igual(demo.tareas[0].id, 'tar_demo_1', 'Identificadores estables de las tareas de demostración');
H.igual(demo.avances[0].id, 'ava_demo_1', 'Identificadores estables de los avances de demostración');

H.grupo('6. Configuración y perfiles');
const def = M.configPorDefecto();
H.igual(def.umbralDias, 3, 'Umbral por defecto = 3 días');
H.igual(def.syncModo, 'local', 'Sincronización desactivada por defecto (se configura en la aplicación)');
H.igual(def.colorPrincipal, '#003090', 'Color principal corporativo del logotipo');
H.igual(def.colorSecundario, '#60cc24', 'Color secundario corporativo del logotipo');
H.igual(Object.keys(M.PERFILES).length, 3, 'Se definen 3 perfiles de usuario');
H.igual(M.PERFILES.Administrador.nivel, 3, 'El Administrador tiene nivel máximo');
H.ok(M.PERFILES.Supervisor.nivel === 2 && M.PERFILES.Usuario.nivel === 1, 'Supervisor y Usuario tienen niveles menores');

H.grupo('7. Metadatos de sincronización');
const t = M.nuevaTarea({ titulo: 'Con metadatos' }, { nombre: 'Ana' });
H.ok(t._ts > 0, 'La tarea nueva lleva marca de tiempo');
H.igual(t._by, 'Ana', 'La tarea nueva registra el usuario que la creó');
H.ok(!!t._dev, 'La tarea nueva registra el dispositivo');
H.igual(t._deleted, false, 'La tarea nueva no está eliminada');
const h = M.nuevoHistorial({ tareaId: 'x', accion: 'Prueba' }, { nombre: 'Ana' });
H.igual(h._by, 'Ana', 'El historial registra el usuario');

H.resumen('model.test.js');
