/* ==========================================================================
   tests/export.test.js – Informes: PDF (impresión) y Excel (.xlsx real)
   Verifica el contenido del informe, el respeto de los filtros y la validez
   del archivo Excel generado (estructura OpenXML comprimida).
   Ejecutar:  node tests/export.test.js
   ========================================================================== */
'use strict';
const H = require('./harness');
const env = H.crearEntorno({ sinApp: true });
const { CSN } = env;
const U = CSN.util, M = CSN.model;

(async function main() {
  await H.iniciarAplicacion(env);

  /* ---------- Datos de prueba con caracteres especiales ---------- */
  H.grupo('1. Preparación de datos');
  const atalaya = CSN.store.comunidades().filter((c) => c.nombre === 'ATALAYA')[0];
  const espuela = CSN.store.comunidades().filter((c) => c.nombre === 'LA ESPUELA')[0];
  const tareaEspecial = await CSN.store.guardarTarea({
    comunidadId: atalaya.id, titulo: 'Mantención & reparación "especial" <torre B>',
    descripcion: 'Revisión de cañerías & válvulas', fechaLimite: U.hoy(), prioridad: 'Alta'
  });
  await CSN.store.agregarAvance({ tareaId: tareaEspecial.id, porcentaje: 30, descripcion: 'Inspección & diagnóstico inicial' });
  await CSN.store.agregarArchivo({
    tareaId: tareaEspecial.id, nombre: 'informe-tecnico.pdf', tipo: 'application/pdf', peso: 12000,
    contenido: 'data:application/pdf;base64,UFJFQkE='
  });
  H.ok(!!tareaEspecial.id, 'Se crea una tarea con caracteres especiales para probar el escape de XML');

  /* ---------- Informe HTML ---------- */
  H.grupo('2. Contenido del informe');
  const filtro = Object.assign(CSN.report.filtroVacio(), {
    comunidadId: atalaya.id, desde: '', hasta: '', incluirAvances: true, incluirFotos: true
  });
  const html = CSN.report.htmlInforme(filtro);
  const conf = CSN.store.config();
  H.contiene(html, conf.empresa, 'El informe incluye el nombre de la empresa');
  H.contiene(html, 'Informe de tareas de la comunidad', 'El informe lleva su título');
  H.contiene(html, 'ATALAYA', 'El informe identifica la comunidad');
  H.contiene(html, 'Av. Los Aromos', 'El informe incluye la dirección de la comunidad');
  H.contiene(html, 'Fecha de emisión', 'El informe indica la fecha de emisión');
  H.contiene(html, 'Período informado', 'El informe indica el período');
  H.contiene(html, 'Resumen de tareas', 'El informe incluye el resumen de tareas');
  H.contiene(html, 'Detalle de tareas', 'El informe incluye el detalle de tareas');
  H.contiene(html, 'Seguimiento detallado', 'El informe incluye el seguimiento de avances');
  H.contiene(html, 'Cumplimiento', 'El informe muestra el porcentaje de cumplimiento');
  H.contiene(html, 'rpt-logo', 'El informe presenta el logotipo de la empresa');
  H.contiene(html, conf.logo, 'La imagen del logotipo apunta al archivo configurado');
  H.contiene(html, 'VENCIDA', 'El informe identifica las tareas vencidas con el semáforo');
  H.contiene(html, 'Inspección &amp; diagnóstico inicial', 'Los avances se incluyen y el texto se escapa correctamente');
  H.contiene(html, 'Mantención &amp; reparación', 'Los caracteres especiales se escapan en el HTML');
  H.noContiene(html, '<torre B>', 'Las etiquetas no se inyectan sin escapar');
  H.contiene(html, 'informe-tecnico.pdf', 'El informe menciona los documentos adjuntos');
  H.contiene(html, 'Firma Administración', 'El informe incluye el espacio para las firmas');
  H.contiene(html, conf.pieInforme.slice(0, 25), 'El informe incluye el texto al pie configurado');
  H.contiene(html, U.hoy().split('-').reverse().join('/'), 'El informe muestra la fecha de emisión en formato local');

  const htmlGeneral = CSN.report.htmlInforme(Object.assign(CSN.report.filtroVacio(), { comunidadId: 'todas', desde: '', hasta: '' }));
  H.contiene(htmlGeneral, 'Informe general de tareas', 'Existe el informe general de todas las comunidades');
  H.contiene(htmlGeneral, 'TODAS LAS COMUNIDADES', 'El informe general lo indica expresamente');
  H.contiene(htmlGeneral, 'Resumen por comunidad', 'El informe general incluye el resumen por comunidad');
  ['ATALAYA', 'LA ESPUELA', 'VISTA VERDE II'].forEach((n) => {
    H.contiene(htmlGeneral, n, 'El informe general incluye la comunidad ' + n);
  });

  H.grupo('3. Informe por período y filtros');
  const filtroFecha = Object.assign(CSN.report.filtroVacio(), { comunidadId: 'todas', desde: U.sumarDias(U.hoy(), -60), hasta: U.hoy(), fechas: 'creacion' });
  const tareasFecha = CSN.report.tareasDelInforme(filtroFecha);
  H.ok(tareasFecha.every((t) => (t.fechaCreacion || '') >= filtroFecha.desde && (t.fechaCreacion || '') <= filtroFecha.hasta), 'El filtro por fechas de creación se respeta');
  const filtroVenc = Object.assign(CSN.report.filtroVacio(), { comunidadId: 'todas', semaforo: 'vencidas', desde: '', hasta: '' });
  const tareasVenc = CSN.report.tareasDelInforme(filtroVenc);
  H.ok(tareasVenc.length > 0 && tareasVenc.every((t) => M.semaforo(t, CSN.store.config()).color === 'rojo'), 'El filtro de vencidas se respeta en los informes');
  H.contiene(CSN.report.descripcionFiltro(filtro), 'ATALAYA', 'La descripción del filtro identifica la comunidad');

  /* ---------- Exportación PDF (impresión en hoja carta) ---------- */
  H.grupo('4. Exportación a PDF');
  CSN.report.exportarPDF(filtro);
  await H.esperar(() => env.w.__impreso >= 1, 3000);
  H.ok(env.w.__impreso >= 1, 'Se abre el diálogo de impresión (Guardar como PDF)');
  const raiz = env.w.document.getElementById('report-root');
  H.contiene(raiz.innerHTML, 'ATALAYA', 'El documento listo para imprimir contiene el informe');
  H.contiene(raiz.innerHTML, 'rpt-head', 'El documento incluye el encabezado profesional');
  H.ok(CSN.store.bitacora().some((b) => /Informe PDF/.test(b.accion)), 'La generación del informe queda en la bitácora');
  await H.esperar(() => env.w.document.getElementById('report-root').innerHTML === '', 6000).catch(() => {});
  H.igual(env.w.document.getElementById('report-root').innerHTML, '', 'El documento temporal se limpia después de imprimir');

  H.grupo('5. Ficha de tarea en PDF');
  const antes = env.w.__impreso;
  CSN.report.informeTarea(tareaEspecial.id);
  await H.esperar(() => env.w.__impreso > antes, 3000);
  H.ok(env.w.__impreso > antes, 'Se puede exportar la ficha individual de una tarea');
  H.contiene(env.w.document.getElementById('report-root').innerHTML, 'Historial de modificaciones', 'La ficha incluye el historial de modificaciones');

  /* ---------- Exportación Excel ---------- */
  H.grupo('6. Exportación a Excel (.xlsx real)');
  const filtroExcel = Object.assign(CSN.report.filtroVacio(), {
    comunidadId: atalaya.id, desde: '', hasta: '', estado: 'Pendiente', incluirAvances: true, incluirHistorial: true
  });
  const libro = CSN.report.libroExcel(filtroExcel);
  H.igual(libro.hojas.map((h) => h.nombre), ['Tareas', 'Resumen', 'Avances', 'Historial'], 'El libro contiene las hojas Tareas, Resumen, Avances e Historial');
  const colTareas = libro.hojas[0].columnas.map((c) => c.t);
  ['Comunidad', 'Tarea', 'Fecha creación', 'Fecha vencimiento', 'Prioridad', 'Estado', 'Responsable', 'Avance (%)', 'Fecha cumplimiento', 'Comentarios']
    .forEach((c) => H.ok(colTareas.indexOf(c) >= 0, 'La planilla incluye la columna «' + c + '»'));
  const filas = libro.hojas[0].filas;
  H.ok(filas.length > 0, 'La planilla contiene filas de tareas');
  H.ok(filas.every((f) => f[0] === 'ATALAYA'), 'La planilla respeta el filtro de comunidad (sólo ATALAYA)');
  H.ok(filas.every((f) => f[6] === 'Pendiente'), 'La planilla respeta el filtro de estado (sólo Pendiente)');
  H.falso(filas.some((f) => f[0] === 'LA ESPUELA'), 'No se incluyen tareas de otras comunidades');
  H.contiene(JSON.stringify(libro.hojas[1].filas), 'ATALAYA', 'La hoja Resumen contiene la comunidad filtrada');
  H.contiene(JSON.stringify(libro.hojas[2].columnas.map((c) => c.t)), 'Comentario', 'La hoja Avances incluye comentarios');
  H.igual(libro.hojas[3].filas[0].length, 10, 'La hoja Historial incluye las 10 columnas de auditoría');
  H.igual(libro.hojas[1].filas.length, 1, 'El resumen de una comunidad filtrada incluye sólo esa comunidad');
  H.igual(libro.hojas[1].filas[0][0], 'ATALAYA', 'El resumen identifica la comunidad informada');
  H.ok(typeof libro.hojas[1].filas[0][3] === 'number', 'El resumen incluye el total de tareas');

  const blob = await CSN.xlsx.construir(libro);
  H.ok(blob.size > 2000, 'El archivo Excel se genera con contenido (' + blob.size + ' bytes)');
  H.igual(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'El tipo MIME corresponde a una planilla Excel');
  const u8 = new Uint8Array(await blob.arrayBuffer());
  const zip = H.leerZip(u8);
  const nombres = Object.keys(zip);
  H.contiene(nombres.join('|'), '[Content_Types].xml', 'El paquete contiene [Content_Types].xml');
  H.contiene(nombres.join('|'), 'xl/workbook.xml', 'El paquete contiene el libro de trabajo');
  H.contiene(nombres.join('|'), 'xl/styles.xml', 'El paquete contiene los estilos');
  H.contiene(nombres.join('|'), 'xl/worksheets/sheet1.xml', 'El paquete contiene la primera hoja');
  H.contiene(nombres.join('|'), 'xl/worksheets/sheet4.xml', 'El paquete contiene las cuatro hojas');
  H.contiene(zip['xl/workbook.xml'], 'Tareas', 'El libro declara la hoja «Tareas»');
  H.contiene(zip['xl/workbook.xml'], 'Avances', 'El libro declara la hoja «Avances»');
  H.contiene(zip['xl/workbook.xml'], 'Historial', 'El libro declara la hoja «Historial»');
  H.contiene(zip['xl/worksheets/sheet1.xml'], 'ATALAYA', 'La primera hoja contiene los datos de la comunidad');
  H.contiene(zip['xl/worksheets/sheet1.xml'], 'autoFilter', 'La planilla incluye filtros automáticos');
  H.contiene(zip['xl/worksheets/sheet1.xml'], 'pane ySplit', 'La planilla mantiene fija la fila de encabezados');
  H.contiene(zip['xl/styles.xml'], '003090', 'La planilla usa el color corporativo en los encabezados');
  H.contiene(zip['docProps/core.xml'], 'CSN', 'Las propiedades del documento identifican a la empresa');

  H.grupo('7. Exportación con todos los datos');
  const libroTodo = CSN.report.libroExcel(Object.assign(CSN.report.filtroVacio(), { comunidadId: 'todas', desde: '', hasta: '', incluirHistorial: true }));
  H.ok(libroTodo.hojas[0].filas.length >= CSN.store.todas('tareas').length - 1, 'El informe general incluye todas las tareas');
  H.igual(libroTodo.hojas[1].filas.length, 3, 'El resumen general incluye las 3 comunidades');
  H.ok(Array.isArray(libroTodo.hojas[1].totales), 'El resumen general incluye la fila de totales');
  const blobTodo = await CSN.xlsx.construir(libroTodo);
  H.ok(blobTodo.size > 3000, 'La planilla general se genera correctamente (' + blobTodo.size + ' bytes)');
  const zipTodo = H.leerZip(new Uint8Array(await blobTodo.arrayBuffer()));
  H.contiene(zipTodo['xl/worksheets/sheet1.xml'], 'Mantención &amp; reparación', 'Los caracteres especiales se escapan correctamente en Excel');
  H.noContiene(zipTodo['xl/worksheets/sheet1.xml'], '<torre B>', 'No se inyectan etiquetas en el XML de la planilla');

  H.grupo('8. Cancelación y casos límite');
  const libroVacio = CSN.report.libroExcel(Object.assign(CSN.report.filtroVacio(), { comunidadId: atalaya.id, texto: 'zzzzzz', desde: '', hasta: '' }));
  H.igual(libroVacio.hojas[0].filas.length, 0, 'Sin coincidencias la planilla queda sin filas de datos');
  const blobVacio = await CSN.xlsx.construir(libroVacio);
  H.ok(blobVacio.size > 1000, 'Aun sin datos la planilla se genera correctamente');
  const zipVacio = H.leerZip(new Uint8Array(await blobVacio.arrayBuffer()));
  H.contiene(zipVacio['xl/worksheets/sheet1.xml'], 'Tarea', 'La planilla vacía conserva los encabezados');

  H.resumen('export.test.js');
})().catch((e) => {
  console.error('\n✗ ERROR EN LA SUITE:', e);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 150);   // cierra los temporizadores de la aplicación
});
