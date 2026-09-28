/* ==========================================================================
   tests/ui.test.js – Interfaz y flujos de trabajo reales
   Carga la aplicación completa (incluido app.js) en un navegador simulado y
   recorre las pantallas y los flujos: ingreso, panel, comunidades, tareas,
   ficha con avances y fotografías, calendario, informes, buscador y menú móvil.
   Ejecutar:  node tests/ui.test.js
   ========================================================================== */
'use strict';
const H = require('./harness');
const env = H.crearEntorno();          // app.js incluido: la aplicación arranca sola
const { w, CSN } = env;
const doc = w.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.prototype.slice.call(doc.querySelectorAll(s));

const clic = (el) => { if (!el) throw new Error('Elemento no encontrado para hacer clic'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };

(async function main() {
  /* ---------- 1. Arranque e ingreso ---------- */
  H.grupo('1. Arranque, encabezado y sistema de ingreso');
  await H.esperar(() => CSN.app && CSN.app.listo, 8000);
  H.ok(CSN.app.listo, 'La aplicación termina de iniciarse');
  H.ok(CSN.store.todas('comunidades').length === 3, 'Los datos de demostración se cargan al iniciar');
  H.falso($('#login-screen').classList.contains('hidden'), 'Se muestra la pantalla de ingreso');
  H.ok($('#app-shell').classList.contains('hidden'), 'La aplicación permanece oculta hasta ingresar');
  H.contiene($('#login-logo').getAttribute('src'), 'logo', 'La pantalla de ingreso muestra el logotipo');
  H.contiene($('#login-sub').textContent, 'CSN', 'La pantalla de ingreso identifica a la empresa');

  $('#login-email').value = 'admin@csn.cl';
  $('#login-password').value = 'clave-incorrecta';
  $('#login-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await H.esperar(() => !$('#login-error').classList.contains('hidden'), 4000);
  H.ok(!$('#login-error').classList.contains('hidden'), 'Se muestra el error cuando la contraseña es incorrecta');
  H.contiene($('#login-error').textContent, 'Contraseña incorrecta', 'El mensaje de error es claro para el usuario');

  $('#login-password').value = 'csn2026';
  $('#login-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await H.esperar(() => !$('#app-shell').classList.contains('hidden'), 6000);
  H.ok(!$('#app-shell').classList.contains('hidden'), 'El ingreso con credenciales válidas abre la aplicación');
  H.ok($('#login-screen').classList.contains('hidden'), 'La pantalla de ingreso se oculta');
  H.igual($('#brand-l1').textContent, 'GESTIÓN DE TAREAS', 'El encabezado muestra «GESTIÓN DE TAREAS» en la primera fila');
  H.contiene($('#brand-l2').textContent, 'CSN Gestión de Activos Inmobiliarios SPA', 'El encabezado muestra el nombre de la empresa en la segunda fila');
  H.contiene($('#header-logo').getAttribute('src'), 'logo', 'El logotipo aparece en la esquina superior derecha');
  H.contiene($('#user-name').textContent, 'Administrador', 'El encabezado identifica al usuario conectado');
  H.ok(!!$('#sync-pill'), 'Se muestra el indicador de sincronización');

  /* ---------- 2. Menú ---------- */
  H.grupo('2. Menú principal y navegación');
  const items = $$('#nav .nav-item').map((b) => b.textContent.trim());
  ['Dashboard', 'Comunidades', 'Tareas', 'Calendario', 'Pendientes', 'Vencidas', 'Informes', 'Buscar', 'Usuarios', 'Configuración']
    .forEach((m) => H.ok(items.some((t) => t.indexOf(m) >= 0), 'El menú incluye ' + m));
  H.igual($$('#bottom-nav button').length, 6, 'La navegación inferior del teléfono tiene 5 secciones + «Más»');
  H.ok(!!$('#nav .nav-sep'), 'El menú está organizado por grupos');
  const cuentaVencidas = $$('#nav .nav-item').filter((b) => /Vencidas/.test(b.textContent))[0];
  H.ok(!!cuentaVencidas.querySelector('.count.alert'), 'El menú destaca las tareas vencidas con un contador de alerta');

  /* ---------- 3. Dashboard ---------- */
  H.grupo('3. Dashboard general');
  CSN.app.ir('dashboard');
  await H.esperar(() => $$('#view-root .kpi').length >= 8, 3000);
  const kpis = $$('#view-root .kpi');
  H.ok(kpis.length >= 8, 'El panel muestra los 8 indicadores solicitados (' + kpis.length + ')');
  const etiquetas = kpis.map((k) => k.querySelector('.label').textContent.toUpperCase());
  ['TOTAL COMUNIDADES', 'TAREAS PENDIENTES', 'TAREAS VENCIDAS', 'TAREAS URGENTES', 'TAREAS COMPLETADAS', 'PRÓXIMAS A VENCER']
    .forEach((e) => H.ok(etiquetas.some((x) => x.indexOf(e) >= 0), 'Indicador presente: ' + e));
  H.ok(kpis.every((k) => /^\d+/.test(k.querySelector('.value').textContent.trim())), 'Todos los indicadores muestran valores numéricos');
  H.ok(!!$('#buscador-global'), 'El buscador global está visible desde el Dashboard');
  H.ok(!!$('#qa-comunidad') && !!$('#qa-tarea') && !!$('#qa-foto') && !!$('#qa-informes') && !!$('#qa-buscar'), 'Están disponibles las 5 acciones rápidas');
  H.ok($$('#view-root .chart-bars .bar-row').length >= 3, 'Se grafican las tareas por comunidad');
  H.ok(!!$('#view-root .donut'), 'Se grafica la distribución por estado');
  H.contiene($('#view-root').textContent, 'Próximos vencimientos', 'El panel muestra los próximos vencimientos');
  H.contiene($('#view-root').textContent, 'Últimas modificaciones', 'El panel muestra las últimas modificaciones');
  H.contiene($('#view-root').textContent, 'Porcentaje de cumplimiento', 'El panel muestra el porcentaje de cumplimiento');

  $('#buscador-global').value = 'ascensor';
  clic($('#btn-buscar'));
  await H.esperar(() => CSN.app.ruta === 'buscar' && $$('#resultados .task-card').length >= 2, 4000);
  H.igual(CSN.app.ruta, 'buscar', 'El buscador del panel lleva a la sección de búsqueda');
  H.ok($$('#resultados .task-card').length >= 2, 'El buscador encuentra las tareas de ascensor de todas las comunidades');

  /* ---------- 4. Comunidades ---------- */
  H.grupo('4. Comunidades y panel individual');
  CSN.app.ir('comunidades');
  await H.esperar(() => $$('#view-root .card[data-comunidad]').length === 3, 3000);
  H.igual($$('#view-root .card[data-comunidad]').length, 3, 'Se listan las 3 comunidades de demostración');
  ['ATALAYA', 'LA ESPUELA', 'VISTA VERDE II'].forEach((n) => {
    H.contiene($('#view-root').textContent, n, 'Aparece la comunidad ' + n);
  });
  H.contiene($('#view-root').textContent, 'Av. Los Aromos', 'Se muestra la dirección de la comunidad');

  const atalaya = CSN.store.comunidades().filter((c) => c.nombre === 'ATALAYA')[0];
  CSN.app.ir('comunidad', { id: atalaya.id });
  await H.esperar(() => /COMUNIDAD ATALAYA/.test($('#view-root').textContent), 3000);
  H.contiene($('#view-root').textContent, 'COMUNIDAD ATALAYA', 'Se abre el panel exclusivo de la comunidad');
  const kpisPanel = $$('#view-root .kpi').map((k) => k.querySelector('.label').textContent);
  ['Tareas pendientes', 'En proceso', 'Vencidas', 'Completadas', 'Urgentes', 'Próximos vencimientos']
    .forEach((e) => H.ok(kpisPanel.indexOf(e) >= 0, 'El panel de la comunidad muestra: ' + e));
  H.contiene($('#view-root').textContent, 'Tareas de la comunidad', 'El panel incluye el listado de tareas de la comunidad');
  H.contiene($('#view-root').textContent, 'Antecedentes de la comunidad', 'El panel incluye los antecedentes de la comunidad');
  H.ok(!!$('[data-accion="nueva-tarea"]'), 'El panel de la comunidad permite crear una tarea nueva');
  const filasPanel = $$('#view-root tbody tr');
  H.ok(filasPanel.length >= 3 && filasPanel.every((f) => /ATALAYA/.test(f.textContent) || !/LA ESPUELA|VISTA VERDE/.test(f.textContent)),
    'El listado del panel sólo contiene tareas de esa comunidad');

  /* ---------- 5. Listado de tareas ---------- */
  H.grupo('5. Listado de tareas, filtros y ordenamiento');
  CSN.views.tareas.reiniciarFiltros();
  CSN.app.ir('tareas');
  await H.esperar(() => $$('#view-root tbody tr').length >= 10, 3000);
  H.ok($$('#view-root tbody tr').length >= 10, 'Se listan todas las tareas registradas');
  H.ok($$('#view-root .mobile-only .task-card').length >= 10, 'Existe la versión en tarjetas para el teléfono');
  H.ok($$('#view-root thead th.sortable').length >= 6, 'La tabla permite ordenar por columna');
  const primeraFilaVencida = $$('#view-root tbody tr')[0];
  H.contiene(primeraFilaVencida.textContent, 'VENCIDA', 'Por defecto las tareas vencidas aparecen primero');

  const selComunidad = $('[data-campo="comunidadId"]');
  selComunidad.value = atalaya.id;
  selComunidad.dispatchEvent(new w.Event('change', { bubbles: true }));
  await H.esperar(() => $$('#view-root tbody tr').length > 0 && $$('#view-root tbody tr').length < 10, 3000);
  H.ok($$('#view-root tbody tr').every((f) => !/LA ESPUELA|VISTA VERDE/.test(f.textContent)), 'El filtro por comunidad funciona en el listado');

  const selSemaforo = $('[data-campo="semaforo"]');
  selSemaforo.value = 'vencidas';
  selSemaforo.dispatchEvent(new w.Event('change', { bubbles: true }));
  await H.esperar(() => $$('#view-root tbody tr').length >= 1, 3000);
  H.ok($$('#view-root tbody tr').every((f) => /VENCIDA/.test(f.textContent)), 'El filtro por semáforo muestra sólo tareas vencidas');

  CSN.views.tareas.reiniciarFiltros();
  CSN.app.ir('tareas');
  await H.esperar(() => $$('#view-root tbody tr').length >= 10, 3000);
  const inputTexto = $('[data-campo="texto"]');
  inputTexto.value = 'ascensor';
  inputTexto.dispatchEvent(new w.Event('input', { bubbles: true }));
  await H.esperar(() => $$('#view-root tbody tr').length === 2, 4000);
  H.igual($$('#view-root tbody tr').length, 2, 'La búsqueda dentro del listado filtra por palabra clave');

  const thVenc = $$('#view-root th.sortable').filter((t) => /Vencimiento/.test(t.textContent))[0];
  clic(thVenc);
  await H.esperar(() => !$('#view-root'), 2000).catch(() => {});
  H.ok(CSN.views.tareas.filtros.orden === 'vencimiento', 'Al pulsar la columna se ordena por vencimiento');
  /* ---------- 6. Ficha de tarea ---------- */
  H.grupo('6. Ficha de tarea: avances, fotografías, documentos y cierre');
  const tareaDemo = CSN.store.todas('tareas').filter((t) => /filtración estacionamiento/i.test(t.titulo))[0];
  CSN.views.tareas.ficha(tareaDemo.id);
  await H.esperar(() => !!$('#ficha-tarea'), 3000);
  const ficha = $('#ficha-tarea');
  H.contiene(ficha.textContent, tareaDemo.titulo, 'La ficha muestra el nombre de la tarea');
  H.contiene(ficha.textContent, 'ATALAYA', 'La ficha muestra la comunidad');
  ['avance', 'foto', 'galeria', 'adjunto', 'completar', 'estado'].forEach((a) => {
    H.ok(!!ficha.querySelector('[data-f="' + a + '"]'), 'La ficha incluye la acción «' + a + '»');
  });
  H.contiene(ficha.querySelector('[data-f="foto"]').textContent, '📷', 'Existe el botón «TOMAR FOTOGRAFÍA» con su icono');
  H.contiene(ficha.querySelector('[data-f="galeria"]').textContent, '🖼️', 'Existe el botón «SELECCIONAR FOTOGRAFÍA»');
  H.contiene(ficha.querySelector('[data-f="adjunto"]').textContent, '📎', 'Existe el botón «ADJUNTAR ARCHIVO»');
  H.contiene(ficha.querySelector('[data-f="completar"]').textContent, 'COMPLETAR TAREA', 'Existe el botón «COMPLETAR TAREA»');
  H.contiene(ficha.textContent, 'Seguimiento de avances', 'La ficha incluye el seguimiento cronológico de avances');
  H.contiene(ficha.textContent, 'Historial de modificaciones', 'La ficha incluye el historial de modificaciones');
  H.contiene(ficha.textContent, 'VENCIDA', 'La ficha muestra el semáforo correspondiente');

  // Registro de un avance a través del formulario real
  clic(ficha.querySelector('[data-f="avance"]'));
  await H.esperar(() => !!$('#form-avance'), 3000);
  H.ok(!!$('#form-avance'), 'Se abre el formulario de avance');
  const camposAvance = $$('#form-avance [data-campo]').map((e) => e.getAttribute('data-campo'));
  ['fecha', 'hora', 'porcentaje', 'descripcion', 'comentario', 'usuario'].forEach((c) => {
    H.ok(camposAvance.indexOf(c) >= 0, 'El formulario de avance incluye el campo «' + c + '»');
  });
  $('#form-avance [data-campo="porcentaje"]').value = 75;
  $('#form-avance [data-campo="descripcion"]').value = 'Avance registrado desde la interfaz';
  $('#form-avance [data-campo="comentario"]').value = 'Prueba automatizada de interfaz';
  const avancesAntes = CSN.store.avancesDe(tareaDemo.id).length;
  clic($$('#modal-root .modal-f .btn').filter((b) => /GUARDAR AVANCE/.test(b.textContent))[0]);
  await H.esperar(() => CSN.store.avancesDe(tareaDemo.id).length > avancesAntes && !$('#form-avance'), 4000);
  H.ok(CSN.store.avancesDe(tareaDemo.id).length > avancesAntes, 'El avance registrado desde la interfaz se guarda');
  H.igual(CSN.store.tarea(tareaDemo.id).avance, 75, 'El porcentaje de la tarea se actualiza desde la interfaz');
  await H.esperar(() => CSN.store.historialDe(tareaDemo.id).some((h) => /Registro de avance/.test(h.accion)), 4000);
  const histAvance = CSN.store.historialDe(tareaDemo.id).filter((h) => /Registro de avance/.test(h.accion))[0];
  H.ok(!!histAvance, 'El avance queda en el historial');
  H.ok(!!histAvance.usuario && !!histAvance.fecha && !!histAvance.hora, 'El historial del avance registra usuario, fecha y hora');
  await H.esperar(() => /Avance registrado desde la interfaz/.test($('#ficha-tarea').textContent), 4000);
  H.contiene($('#ficha-tarea').textContent, 'Avance registrado desde la interfaz', 'La ficha se actualiza y muestra el avance recién agregado');

  // Adjuntar un documento (ruta real de archivo)
  const antesDocs = CSN.store.documentosDe(tareaDemo.id).length;
  const archivo = new w.File([Buffer.from('%PDF-1.4 documento de prueba')], 'cotizacion-filtracion.pdf', { type: 'application/pdf' });
  await CSN.archivos.procesar(tareaDemo.id, [archivo], 'adjunto');
  H.ok(CSN.store.documentosDe(tareaDemo.id).length > antesDocs, 'El documento adjunto queda asociado a la tarea');
  H.ok(CSN.store.documentosDe(tareaDemo.id).some((d) => /cotizacion-filtracion\.pdf/.test(d.nombre)), 'El documento conserva su nombre original');
  H.ok(CSN.store.archivosDe(tareaDemo.id).every((a) => !!a.contenido), 'El contenido del documento se almacena para sincronizarlo');
  CSN.util.Modal.cerrar();
  await H.esperar(() => !$('#modal-root .overlay'), 3000);
  CSN.views.tareas.ficha(tareaDemo.id);
  await H.esperar(() => !!$('#ficha-tarea'), 3000);
  H.contiene($('#ficha-tarea').textContent, 'cotizacion-filtracion.pdf', 'La ficha muestra el documento adjunto');

  // Cierre de la tarea
  clic($('#ficha-tarea [data-f="completar"]'));
  await H.esperar(() => !!$('#form-cierre'), 3000);
  H.ok(!!$('#form-cierre'), 'Se abre el formulario de cierre de tarea');
  $('#form-cierre [data-campo="comentario"]').value = 'Trabajo terminado y verificado en terreno';
  clic($$('#modal-root .modal-f .btn').filter((b) => /COMPLETAR TAREA/.test(b.textContent))[0]);
  await H.esperar(() => CSN.store.tarea(tareaDemo.id).estado === 'Completada', 4000);
  H.igual(CSN.store.tarea(tareaDemo.id).estado, 'Completada', 'La tarea se completa desde la interfaz');
  H.igual(CSN.store.tarea(tareaDemo.id).avance, 100, 'Al completar, el avance queda en 100%');
  H.ok(!!CSN.store.tarea(tareaDemo.id).fechaCumplimiento, 'Se registra la fecha de cumplimiento');
  H.contiene(CSN.store.tarea(tareaDemo.id).comentarioFinal, 'Trabajo terminado', 'Se registra el comentario final');
  await H.esperar(() => CSN.store.historialDe(tareaDemo.id).some((h) => /Tarea completada/.test(h.accion)), 4000);
  const histCierre = CSN.store.historialDe(tareaDemo.id).filter((h) => /Tarea completada/.test(h.accion))[0];
  H.ok(!!histCierre, 'El cierre queda registrado en el historial');
  H.contiene(histCierre.comentario, 'Trabajo terminado y verificado', 'El historial guarda el comentario de cierre');
  H.contiene(histCierre.estadoNuevo, 'Completada', 'El historial registra el nuevo estado');
  CSN.util.Modal.cerrar();
  await H.esperar(() => !$('#modal-root .overlay'), 2000);

  /* ---------- 7. Calendario ---------- */
  H.grupo('7. Calendario');
  CSN.app.ir('calendario');
  await H.esperar(() => $$('#view-root .cal-cell').length > 27, 3000);
  H.igual($$('#view-root .cal-dow').length, 7, 'El calendario muestra los 7 días de la semana');
  H.ok($$('#view-root .cal-cell').length >= 28, 'El calendario muestra la grilla del mes');
  H.ok($$('#view-root .cal-ev').length >= 3, 'El calendario ubica las tareas en sus fechas');
  H.igual($$('#view-root .cal-ev.sem-rojo').length > 0, true, 'El calendario identifica las tareas vencidas con el semáforo');
  H.ok($$('#view-root .cal-cell.today').length === 1, 'El día de hoy aparece destacado');
  clic($$('#view-root [data-cal="vista"]').filter((b) => b.getAttribute('data-valor') === 'semana')[0]);
  await H.esperar(() => CSN.views.calendario.estado.vista === 'semana', 2000);
  H.igual(CSN.views.calendario.estado.vista, 'semana', 'Se puede cambiar a la vista semanal');
  clic($$('#view-root [data-cal="vista"]').filter((b) => b.getAttribute('data-valor') === 'dia')[0]);
  await H.esperar(() => CSN.views.calendario.estado.vista === 'dia', 2000);
  H.igual(CSN.views.calendario.estado.vista, 'dia', 'Se puede cambiar a la vista diaria');
  const ev = $('#view-root .cal-ev') || $('#view-root .task-card');
  if (ev) {
    clic(ev);
    await H.esperar(() => !!$('#ficha-tarea'), 3000);
    H.ok(!!$('#ficha-tarea'), 'Al pulsar una tarea del calendario se abre su ficha completa');
    CSN.util.Modal.cerrar();
  } else {
    H.ok(true, 'Sin tareas en el día seleccionado (se omite la apertura de la ficha)');
  }
  CSN.views.calendario.estado.vista = 'mes';
  CSN.views.calendario.estado.fecha = CSN.util.hoy();

  /* ---------- 8. Informes ---------- */
  H.grupo('8. Informes desde la interfaz');
  CSN.app.ir('informes');
  await H.esperar(() => !!$('#informe-preview'), 3000);
  H.contiene($('#informe-preview').textContent, 'CSN Gestión de Activos Inmobiliarios', 'La vista previa del informe muestra la empresa');
  H.contiene($('#informe-preview').textContent, 'Resumen de tareas', 'La vista previa incluye el resumen');
  H.ok(!!$('[data-i="pdf"]') && !!$('[data-i="excel"]'), 'Están disponibles los botones de exportación a PDF y Excel');
  H.ok($$('#view-root [data-r]').length >= 5, 'Se ofrecen informes rápidos predefinidos');
  H.ok(!!$('[data-campo="incluirFotos"]') && !!$('[data-campo="incluirAvances"]'), 'Se puede elegir incluir avances y fotografías');

  /* ---------- 9. Buscador global ---------- */
  H.grupo('9. Buscador global');
  CSN.app.ir('buscar');
  await H.esperar(() => !!$('#q'), 2000);
  $('#q').value = 'FILTRACIÓN';
  clic($('#btn-q'));
  await H.esperar(() => $$('#resultados .task-card').length >= 1, 4000);
  H.ok($$('#resultados .task-card').length >= 1, 'La búsqueda ignora mayúsculas y tildes');
  H.contiene($('#resultados').textContent, 'Coincidencia en', 'Los resultados indican dónde se encontró la coincidencia');
  $('#q').value = 'ascensor';
  clic($('#btn-q'));
  await H.esperar(() => $$('#resultados .day-group-title').length >= 2, 4000);
  H.ok($$('#resultados .day-group-title').length >= 2, 'Los resultados se agrupan por comunidad');
  H.contiene($('#resultados').textContent, 'ATALAYA', 'El buscador abarca todas las comunidades');

  /* ---------- 10. Configuración y usuarios ---------- */
  H.grupo('10. Configuración, usuarios y personalización');
  CSN.app.ir('configuracion');
  await H.esperar(() => !!$('#sec-empresa'), 3000);
  ['Identidad corporativa', 'Sincronización entre dispositivos', 'Control de conflictos', 'Respaldos y almacenamiento', 'Bitácora de auditoría']
    .forEach((s) => H.contiene($('#view-root').textContent, s, 'Sección de configuración: ' + s));
  H.ok(!!$('[data-campo="syncModo"]'), 'Se puede elegir el método de sincronización');
  H.ok(!!$('[data-campo="umbralDias"]'), 'Se puede configurar el umbral de días del semáforo');
  H.ok(!!$('[data-c="logo"]'), 'Se puede cargar o reemplazar el logotipo');
  H.ok(!!$('[data-campo="colorPrincipal"]') && !!$('[data-campo="colorSecundario"]'), 'Se pueden cambiar los colores corporativos');
  H.ok(!!$('[data-c="exportar-respaldo"]') && !!$('[data-c="importar-respaldo"]'), 'Se pueden exportar y restaurar respaldos');
  const selSync = $('[data-campo="syncModo"]');
  selSync.value = 'gist';
  selSync.dispatchEvent(new w.Event('change', { bubbles: true }));
  await H.esperar(() => !$('#panel-gist').classList.contains('hidden'), 2000);
  H.falso($('#panel-gist').classList.contains('hidden'), 'Al elegir la nube cifrada se muestran sus campos de conexión');
  selSync.value = 'supabase';
  selSync.dispatchEvent(new w.Event('change', { bubbles: true }));
  await H.esperar(() => !$('#panel-supabase').classList.contains('hidden'), 2000);
  H.falso($('#panel-supabase').classList.contains('hidden'), 'Al elegir Supabase se muestran sus campos de conexión');
  selSync.value = 'local';
  selSync.dispatchEvent(new w.Event('change', { bubbles: true }));
  await H.esperar(() => !!$('[data-c="codigo-generar"]'), 3000);

  // Vinculación del celular con un código
  H.grupo('10b. Vinculación del celular con un código');
  H.ok(!!$('[data-c="codigo-generar"]'), 'Existe el botón «Generar código para el celular»');
  H.ok(!!$('[data-c="codigo-aplicar"]'), 'Existe el botón «Pegar código de vinculación»');
  clic($('[data-c="codigo-generar"]'));
  await H.esperar(() => /Falta un paso/.test($('#modal-root').textContent), 3000);
  H.contiene($('#modal-root').textContent, 'Primero complete y guarde la configuración', 'Sin sincronización configurada se explica qué falta antes de generar el código');
  CSN.util.Modal.cerrar();
  await H.esperar(() => !$('#modal-root .overlay'), 3000);

  clic($('[data-c="codigo-aplicar"]'));
  await H.esperar(() => !!$('#codigo-entrada'), 3000);
  H.ok(!!$('#codigo-entrada'), 'Se abre la ventana para pegar el código en el dispositivo nuevo');
  $('#codigo-entrada').value = 'codigo-que-no-corresponde';
  clic($$('#modal-root .modal-f .btn').filter((b) => /Vincular y sincronizar/.test(b.textContent))[0]);
  await H.esperar(() => /CSNV1/.test($('#toasts').textContent), 4000);
  H.contiene($('#toasts').textContent, 'CSNV1', 'Se avisa al usuario que el código no es válido');
  H.ok(!!$('#codigo-entrada'), 'La ventana permanece abierta para corregir el código');
  CSN.util.Modal.cerrar();
  await H.esperar(() => !$('#modal-root .overlay'), 3000);

  CSN.app.ir('usuarios');
  await H.esperar(() => !!$('#view-root [data-u="nuevo"]'), 4000);
  const filasU = $$('#view-root tbody tr');
  H.ok(filasU.length >= 3, 'Se listan los usuarios registrados');
  H.contiene($('#view-root').textContent, 'Sesión actual', 'Se identifica al usuario con sesión activa');
  H.contiene($('#view-root').textContent, 'Nivel 3', 'Se explican los niveles de los perfiles');

  /* ---------- 11. Menú móvil ---------- */
  H.grupo('11. Adaptación a teléfono (menú lateral desplegable)');
  clic($('#burger'));
  await H.esperar(() => $('#sidebar').classList.contains('open'), 2000);
  H.ok($('#sidebar').classList.contains('open'), 'El botón de menú abre la navegación lateral');
  H.ok(!!$('.scrim'), 'Se atenúa el fondo para facilitar la navegación táctil');
  clic($('.scrim'));
  await H.esperar(() => !$('#sidebar').classList.contains('open'), 2000);
  H.falso($('#sidebar').classList.contains('open'), 'Al pulsar fuera se cierra el menú');
  clic($$('#bottom-nav button').filter((b) => /Tareas/.test(b.textContent))[0]);
  await H.esperar(() => CSN.app.ruta === 'tareas', 2000);
  H.igual(CSN.app.ruta, 'tareas', 'La navegación inferior funciona en el teléfono');

  /* ---------- 12. Creación de tarea desde la interfaz ---------- */
  H.grupo('12. Flujo completo: crear tarea desde el teléfono');
  CSN.views.tareas.formulario({ comunidadId: atalaya.id });
  await H.esperar(() => !!$('#form-tarea'), 3000);
  const camposTarea = $$('#form-tarea [data-campo]').map((e) => e.getAttribute('data-campo'));
  ['comunidadId', 'titulo', 'descripcion', 'fechaCreacion', 'fechaLimite', 'prioridad', 'estado', 'responsable', 'avance', 'fechaCumplimiento', 'comentarioFinal']
    .forEach((c) => H.ok(camposTarea.indexOf(c) >= 0, 'El formulario de tarea incluye el campo «' + c + '»'));

  // Los desplegables deben mostrar los NOMBRES, no etiquetas inválidas
  const textosDe = (sel) => Array.from(sel.querySelectorAll('option')).map((o) => o.textContent.trim());
  H.igual(textosDe($('#form-tarea select[data-campo="prioridad"]')).slice(1),
    ['Baja', 'Media', 'Alta', 'Urgente'], 'El formulario muestra las cuatro prioridades por su nombre');
  H.igual(textosDe($('#form-tarea select[data-campo="estado"]')).slice(1),
    ['Pendiente', 'En proceso', 'Pendiente de terceros', 'Completada', 'Cancelada', 'Vencida'],
    'El formulario muestra todos los estados por su nombre');
  H.falso(/\[object (Object|Array)\]/.test($('#modal-root').innerHTML),
    'El formulario no muestra etiquetas inválidas en ningún campo');
  $('#form-tarea [data-campo="titulo"]').value = 'Tarea creada desde la interfaz de prueba';
  $('#form-tarea [data-campo="descripcion"]').value = 'Registrada por la prueba automatizada';
  $('#form-tarea [data-campo="fechaLimite"]').value = CSN.util.sumarDias(CSN.util.hoy(), 5);
  $('#form-tarea [data-campo="prioridad"]').value = 'Alta';
  const totalAntes = CSN.store.todas('tareas').length;
  clic($$('#modal-root .modal-f .btn').filter((b) => /GUARDAR TAREA/.test(b.textContent))[0]);
  await H.esperar(() => CSN.store.todas('tareas').length > totalAntes, 4000);
  H.ok(CSN.store.todas('tareas').length > totalAntes, 'La tarea creada desde el formulario queda guardada');
  const creada = CSN.store.todas('tareas').filter((t) => /interfaz de prueba/.test(t.titulo))[0];
  H.ok(!!creada, 'La tarea se guarda con el nombre indicado');
  H.igual(creada.prioridad, 'Alta', 'Se guarda la prioridad seleccionada');
  H.igual(creada.comunidadId, atalaya.id, 'Se guarda la comunidad seleccionada');
  await H.esperar(() => !$('#modal-root .overlay'), 3000);

  /* ---------- 13. Validaciones ---------- */
  H.grupo('13. Validaciones de formularios');
  CSN.views.tareas.formulario({});
  await H.esperar(() => !!$('#form-tarea'), 3000);
  const totalAntes2 = CSN.store.todas('tareas').length;
  $('#form-tarea [data-campo="comunidadId"]').value = '';
  $('#form-tarea [data-campo="titulo"]').value = '';
  clic($$('#modal-root .modal-f .btn').filter((b) => /GUARDAR TAREA/.test(b.textContent))[0]);
  await new Promise((r) => setTimeout(r, 400));
  H.igual(CSN.store.todas('tareas').length, totalAntes2, 'No se guarda una tarea sin comunidad ni nombre');
  H.ok(!!$('#form-tarea'), 'El formulario permanece abierto para corregir los datos');
  H.ok(!!$$('#toasts .toast').length, 'Se avisa al usuario qué dato falta completar');
  CSN.util.Modal.cerrar();
  await H.esperar(() => !$('#modal-root .overlay'), 3000);

  /* ---------- 14. Revisión de todas las pantallas ---------- */
  H.grupo('14. Revisión de todas las pantallas (etiquetas y contenido)');
  CSN.app.ir('tareas', {}, true);
  await H.esperar(() => !!$('#view-root [data-campo="prioridad"]'), 3000);
  H.igual(textosDe($('#view-root select[data-campo="prioridad"]')).slice(1),
    ['Baja', 'Media', 'Alta', 'Urgente'], 'El filtro de prioridad muestra los nombres correctos');
  H.igual(textosDe($('#view-root select[data-campo="estado"]')).slice(1),
    ['Pendiente', 'En proceso', 'Pendiente de terceros', 'Completada', 'Cancelada', 'Vencida'],
    'El filtro de estado muestra los nombres correctos');

  const RUTAS = [['dashboard', {}], ['comunidades', {}], ['tareas', {}], ['calendario', {}],
    ['pendientes', {}], ['vencidas', {}], ['informes', {}], ['buscar', {}], ['configuracion', {}], ['usuarios', {}]];
  for (const [ruta, prm] of RUTAS) {
    CSN.app.ir(ruta, prm, true);
    await new Promise((r) => setTimeout(r, 80));
    const html = $('#view-root').innerHTML;
    H.falso(/\[object (Object|Array)\]/.test(html), 'La pantalla «' + ruta + '» no muestra etiquetas inválidas');
    H.ok(html.length > 400, 'La pantalla «' + ruta + '» tiene contenido');
  }

  /* ---------- 15. Cierre de sesión ---------- */
  H.grupo('15. Cierre de sesión');
  clic($('#nav-logout'));
  await H.esperar(() => !!$('#modal-root .overlay'), 2000);
  clic($$('#modal-root .modal-f .btn').filter((b) => /Cerrar sesión/.test(b.textContent))[0]);
  await H.esperar(() => !$('#login-screen').classList.contains('hidden'), 3000);
  H.falso($('#login-screen').classList.contains('hidden'), 'Al cerrar sesión se vuelve a la pantalla de ingreso');
  H.igual(CSN.store.sesion(), null, 'No queda usuario en sesión');

  H.resumen('ui.test.js');
})().catch((e) => {
  console.error('\n✗ ERROR EN LA SUITE:', e);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 150);   // cierra los temporizadores de la aplicación
});
