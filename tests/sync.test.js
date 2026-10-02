/* ==========================================================================
   tests/sync.test.js – Sincronización entre dispositivos
   Simula dos dispositivos (dos navegadores independientes) y los servicios en
   la nube (repositorio cifrado de Gists y base de datos Supabase) para probar:
     · Cifrado AES-256-GCM de los datos que viajan
     · Envío sólo de los registros modificados
     · Recepción y mezcla por registro con marcas de tiempo
     · Control de conflictos sin sobrescritura silenciosa
     · Funcionamiento sin conexión y envío posterior
   Ejecutar:  node tests/sync.test.js
   ========================================================================== */
'use strict';
const H = require('./harness');
const CSNcrypto = require('crypto');

/* ---------- Simulación del servicio de Gists (GitHub) ---------- */
function apiGist() {
  const estado = { gists: {}, n: 0, peticiones: [] };
  const respuesta = (status, cuerpo) => ({
    ok: status >= 200 && status < 300, status,
    json: () => Promise.resolve(cuerpo), text: () => Promise.resolve(JSON.stringify(cuerpo))
  });
  const fetchFalso = (url, opts) => {
    opts = opts || {};
    const metodo = (opts.method || 'GET').toUpperCase();
    const u = String(url);
    estado.peticiones.push(metodo + ' ' + u.replace('https://api.github.com', ''));
    if (u === 'https://api.github.com/user') return Promise.resolve(respuesta(200, { login: 'csn-prueba' }));
    if (u === 'https://api.github.com/gists' && metodo === 'POST') {
      const id = 'G' + (++estado.n);
      const g = { id, html_url: 'https://gist.github.com/' + id, files: {}, updated_at: new Date().toISOString() };
      const cuerpo = JSON.parse(opts.body);
      Object.keys(cuerpo.files || {}).forEach((n) => { g.files[n] = { content: cuerpo.files[n].content }; });
      estado.gists[id] = g;
      return Promise.resolve(respuesta(201, { id: g.id, html_url: g.html_url, files: g.files, updated_at: g.updated_at }));
    }
    const m = /^https:\/\/api\.github\.com\/gists\/([^/?]+)$/.exec(u);
    if (m) {
      const g = estado.gists[m[1]];
      if (!g) return Promise.resolve(respuesta(404, { message: 'Not Found' }));
      if (metodo === 'GET') return Promise.resolve(respuesta(200, { id: g.id, html_url: g.html_url, files: g.files, updated_at: g.updated_at }));
      if (metodo === 'PATCH') {
        const cuerpo = JSON.parse(opts.body);
        Object.keys(cuerpo.files || {}).forEach((n) => {
          if (cuerpo.files[n] === null) delete g.files[n];
          else g.files[n] = { content: cuerpo.files[n].content };
        });
        g.updated_at = new Date().toISOString();
        return Promise.resolve(respuesta(200, { id: g.id, files: g.files, updated_at: g.updated_at }));
      }
    }
    return Promise.resolve(respuesta(404, { message: 'No simulado: ' + u }));
  };
  return { fetch: fetchFalso, estado };
}

/* ---------- Simulación del servicio Supabase (PostgREST) ---------- */
function apiSupabase() {
  const estado = { filas: {}, peticiones: [] };
  const respuesta = (status, cuerpo) => ({
    ok: status >= 200 && status < 300, status,
    json: () => Promise.resolve(cuerpo), text: () => Promise.resolve(cuerpo === null ? '' : JSON.stringify(cuerpo))
  });
  const fetchFalso = (url, opts) => {
    opts = opts || {};
    const metodo = (opts.method || 'GET').toUpperCase();
    const u = String(url);
    estado.peticiones.push(metodo + ' ' + u.replace(/^https:\/\/demo\.supabase\.co/, ''));
    if (/\/auth\/v1\/token/.test(u)) return Promise.resolve(respuesta(200, { access_token: 'jwt-de-prueba', refresh_token: 'r', expires_in: 3600 }));
    if (/\/rest\/v1\/csn_registros/.test(u)) {
      const query = u.split('?')[1] || '';
      if (metodo === 'POST') {
        const filas = JSON.parse(opts.body);
        filas.forEach((f) => { estado.filas[f.id] = f; });
        return Promise.resolve(respuesta(201, null));
      }
      const select = /select=([^&]+)/.exec(query);
      const columnas = select ? decodeURIComponent(select[1]).split(',') : ['id', 'coleccion', 'datos'];
      const filtroIn = /id=in\.\(([^)]*)\)/.exec(query);
      let filas = Object.keys(estado.filas).map((k) => estado.filas[k]);
      if (filtroIn) {
        const ids = filtroIn[1].split(',').map(decodeURIComponent);
        filas = filas.filter((f) => ids.indexOf(f.id) >= 0);
      }
      const orden = /order=([a-z_]+)\.(asc|desc)/.exec(query);
      if (orden) filas.sort((a, b) => (orden[2] === 'desc' ? -1 : 1) * String(a[orden[1]] || '').localeCompare(String(b[orden[1]] || '')));
      // Paginación con encabezado Range
      const rango = (opts.headers || {})['Range'] || (opts.headers || {})['range'];
      if (rango) {
        const [d, h] = rango.split('-').map(Number);
        filas = filas.slice(d, h + 1);
      }
      const salida = filas.map((f) => {
        const o = {};
        columnas.forEach((c) => { o[c] = f[c]; });
        return o;
      });
      return Promise.resolve(respuesta(200, salida));
    }
    return Promise.resolve(respuesta(404, { message: 'No simulado: ' + u }));
  };
  return { fetch: fetchFalso, estado };
}

const esperarMs = (ms) => new Promise((r) => setTimeout(r, ms));

(async function main() {
  /* ================= 1. Cifrado ================= */
  H.grupo('1. Cifrado de los datos sincronizados (AES-256-GCM)');
  const env = H.crearEntorno({ sinApp: true });
  const CSN = env.CSN;
  const cifrado = await CSN.crypto.cifrar('{"tarea":"Reparación filtración"}', 'clave-secreta-de-prueba-2026');
  H.contiene(cifrado, 'CSNSYNC1:', 'El paquete cifrado lleva su identificador de formato');
  H.noContiene(cifrado, 'filtración', 'El contenido NO viaja en texto claro');
  H.igual(await CSN.crypto.descifrar(cifrado, 'clave-secreta-de-prueba-2026'), '{"tarea":"Reparación filtración"}', 'Se descifra correctamente con la misma clave');
  let err = null;
  try { await CSN.crypto.descifrar(cifrado, 'otra-clave-distinta-2026'); } catch (e) { err = e; }
  H.ok(err && /no coincide/i.test(err.message), 'Con otra clave falla el descifrado (no se filtra información)');
  const h1 = await CSN.crypto.huella('clave-secreta-de-prueba-2026');
  const h2 = await CSN.crypto.huella('clave-secreta-de-prueba-2026');
  const h3 = await CSN.crypto.huella('clave-totalmente-distinta-2026');
  H.igual(h1, h2, 'La huella de la clave es igual en dispositivos con la misma clave');
  H.ok(h1 !== h3, 'Claves distintas producen huellas distintas');
  H.ok(h1.length === 8, 'La huella publicada es corta (8 caracteres)');
  const cifrado2 = await CSN.crypto.cifrar('mismo texto', 'clave-secreta-de-prueba-2026');
  H.ok(cifrado2 !== cifrado, 'Cada cifrado usa un vector de inicialización nuevo (sin repeticiones)');

  /* ================= 2. Preparación de dos dispositivos ================= */
  H.grupo('2. Dos dispositivos conectados al mismo repositorio cifrado');
  const api = apiGist();
  const A = H.crearEntorno({ sinApp: true, fetch: api.fetch });
  const B = H.crearEntorno({ sinApp: true, fetch: api.fetch });
  await A.CSN.store.iniciar();
  await B.CSN.store.iniciar();
  await A.CSN.store.login('admin@csn.cl', 'csn2026');
  await B.CSN.store.login('admin@csn.cl', 'csn2026');

  const CLAVE = 'clave-compartida-csn-2026';
  await A.CSN.store.guardarConfig({ syncModo: 'gist', gistToken: 'token-de-prueba', syncClave: CLAVE, syncAuto: false, syncIntervalo: 600 });
  const crear = await A.CSN.syncGist.crear();
  H.ok(/^G\d+$/.test(crear.id), 'Se crea el repositorio de datos en la nube');
  H.igual(A.CSN.store.config().gistId, crear.id, 'El identificador del repositorio queda guardado en la configuración');
  await A.CSN.store.guardarConfig({ syncModo: 'gist', gistToken: 'token-de-prueba', syncClave: CLAVE, gistId: crear.id, syncAuto: false, syncIntervalo: 600 });
  await B.CSN.store.guardarConfig({ syncModo: 'gist', gistToken: 'token-de-prueba', syncClave: CLAVE, gistId: crear.id, syncAuto: false, syncIntervalo: 600 });
  H.ok(A.CSN.sync.configurado(), 'El dispositivo A queda configurado');
  H.ok(B.CSN.sync.configurado(), 'El dispositivo B queda configurado');
  const prueba = await A.CSN.sync.probar();
  H.igual(prueba.usuario, 'csn-prueba', 'La conexión se verifica correctamente');

  /* --- Sólo viajan los registros modificados --- */
  await A.CSN.store.recargar();
  await A.CSN.store.marcarSincronizados();     // deja la demo como ya sincronizada
  await B.CSN.store.marcarSincronizados();
  const paqueteIncremental = A.CSN.sync.armarPaquete({ soloCambios: true });
  H.igual(paqueteIncremental.colecciones.tareas.length, 0, 'Sin cambios no se envía ninguna tarea (modo incremental)');
  const paqueteCompleto = A.CSN.sync.armarPaquete();
  H.igual(paqueteCompleto.colecciones.tareas.length, A.CSN.store.todas('tareas').length,
    'El paquete completo incluye todas las tareas (necesario para un dispositivo que se vincula más tarde)');
  H.ok(paqueteCompleto.colecciones.comunidades.length === 3, 'El paquete completo incluye todas las comunidades');
  H.falso(!!paqueteCompleto.colecciones.config[0].gistToken, 'El paquete completo tampoco expone las credenciales');
  H.ok(A.CSN.syncGist.snapshot === true && B.CSN.syncSupabase.snapshot === false,
    'Cada método declara si guarda copia única (completa) o registros por fila (incremental)');

  /* ================= 3. Flujo computador → celular ================= */
  H.grupo('3. Computador → Internet → base de datos → celular');
  const atalaya = A.CSN.store.comunidades().filter((c) => c.nombre === 'ATALAYA')[0];
  const tareaA = await A.CSN.store.guardarTarea({
    comunidadId: atalaya.id, titulo: 'Reparación filtración estacionamiento',
    descripcion: 'Filtración en muro norte del subterráneo -2', fechaLimite: A.CSN.util.hoy(),
    prioridad: 'Urgente', estado: 'Pendiente', responsable: 'Constructora Andes'
  });
  await A.CSN.store.guardarConfig({ umbralDias: 4 }, { silencioso: true });   // cambio de configuración a sincronizar
  const paqueteA = A.CSN.sync.armarPaquete({ soloCambios: true });
  H.ok(paqueteA.colecciones.tareas.some((t) => t.id === tareaA.id), 'La tarea nueva entra en el paquete a enviar');
  H.ok(paqueteA.colecciones.config.length === 1, 'La configuración modificada también se envía');
  H.falso(!!paqueteA.colecciones.config[0].gistToken, 'El paquete NO incluye el token de acceso');
  H.falso(!!paqueteA.colecciones.config[0].syncClave, 'El paquete NO incluye la clave de cifrado');
  H.igual(paqueteA.colecciones.config[0].umbralDias, 4, 'Los cambios legítimos de configuración sí se sincronizan');

  const resA1 = await A.CSN.sync.sincronizar({ manual: true });
  H.ok(resA1.ok, 'El dispositivo A sincroniza correctamente');
  H.ok(resA1.subidos >= 1, 'Se enviaron los registros modificados (' + resA1.subidos + ')');
  H.igual(A.CSN.sync.estado, 'sincronizado', 'El indicador queda en SINCRONIZADO');
  H.igual(A.CSN.sync.textoEstado(), 'SINCRONIZADO', 'Texto del indicador: SINCRONIZADO');

  const resB1 = await B.CSN.sync.sincronizar({ manual: true });
  H.ok(resB1.ok && resB1.bajados >= 1, 'El dispositivo B recibe los cambios (' + resB1.bajados + ')');
  const enB = B.CSN.store.tarea(tareaA.id);
  H.ok(!!enB, 'La tarea creada en el computador aparece en el celular');
  H.igual(enB.titulo, 'Reparación filtración estacionamiento', 'El nombre de la tarea llega íntegro');
  H.igual(enB.prioridad, 'Urgente', 'La prioridad llega íntegra');
  H.igual(enB.comunidadId, atalaya.id, 'La asociación con la comunidad se mantiene');
  H.igual(B.CSN.store.todas('tareas').filter((t) => t.id === tareaA.id).length, 1, 'No se duplica el registro al recibirlo');

  /* ================= 4. Flujo celular → computador ================= */
  H.grupo('4. Celular → Internet → base de datos → computador (avance y fotografía)');
  await esperarMs(10);
  await B.CSN.store.agregarAvance({ tareaId: tareaA.id, porcentaje: 50, descripcion: 'Se identificó origen del problema', comentario: 'Junta de dilatación sin sello' });
  await B.CSN.store.agregarArchivo({
    tareaId: tareaA.id, nombre: 'foto-terreno.jpg', tipo: 'image/jpeg', peso: 24576,
    contenido: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD', rol: 'avance'
  });
  const resB2 = await B.CSN.sync.sincronizar({ manual: true });
  H.ok(resB2.ok, 'El celular envía el avance y la fotografía');

  const resA2 = await A.CSN.sync.sincronizar({ manual: true });
  H.ok(resA2.ok && resA2.bajados >= 2, 'El computador recibe el avance y el archivo (' + resA2.bajados + ')');
  const avancesEnA = A.CSN.store.avancesDe(tareaA.id).filter((a) => a.tareaId === tareaA.id);
  H.ok(avancesEnA.some((a) => a.porcentaje === 50), 'El avance del 50% llega al computador');
  H.ok(avancesEnA.some((a) => /origen del problema/.test(a.descripcion)), 'La descripción del avance llega íntegra');
  H.igual(A.CSN.store.tarea(tareaA.id).avance, 50, 'El porcentaje de la tarea se actualiza en el computador');
  const fotosEnA = A.CSN.store.fotosDe(tareaA.id);
  H.igual(fotosEnA.length, 1, 'La fotografía llega al computador');
  H.contiene(fotosEnA[0].contenido, 'data:image/jpeg', 'La fotografía conserva su contenido');
  H.igual(A.CSN.store.tarea(tareaA.id).estado, 'En proceso', 'El estado se actualiza a En proceso en el computador');

  /* ================= 5. Sin conexión y envío posterior ================= */
  H.grupo('5. Funcionamiento sin conexión y sincronización al recuperar Internet');
  A.CSN.sync.detener();
  Object.defineProperty(A.w.navigator, 'onLine', { value: false, configurable: true });
  const tareaOffline = await A.CSN.store.guardarTarea({
    comunidadId: atalaya.id, titulo: 'Inspección de bombas de agua (sin conexión)',
    fechaLimite: A.CSN.util.sumarDias(A.CSN.util.hoy(), 15), prioridad: 'Media'
  });
  const resOff = await A.CSN.sync.sincronizar({ manual: true });
  H.falso(resOff.ok, 'Sin conexión no se envía nada');
  H.igual(A.CSN.sync.estado, 'sin-conexion', 'El indicador muestra SIN CONEXIÓN');
  H.igual(A.CSN.sync.textoEstado(), 'SIN CONEXIÓN', 'Texto del indicador: SIN CONEXIÓN');
  H.ok(A.CSN.store.pendientes().pendientes >= 1, 'Los cambios quedan pendientes y guardados en el dispositivo');
  H.ok(!!A.CSN.store.tarea(tareaOffline.id), 'La tarea creada sin conexión existe localmente');

  Object.defineProperty(A.w.navigator, 'onLine', { value: true, configurable: true });
  const resOn = await A.CSN.sync.sincronizar({ manual: true });
  H.ok(resOn.ok, 'Al recuperar Internet la sincronización se completa');
  await esperarMs(10);
  await B.CSN.sync.sincronizar({ manual: true });
  H.ok(!!B.CSN.store.tarea(tareaOffline.id), 'La tarea creada sin conexión llega al otro dispositivo');
  H.igual(A.CSN.store.pendientes().pendientes, 0, 'Ya no quedan cambios pendientes en el dispositivo A');

  /* ================= 6. Control de conflictos ================= */
  H.grupo('6. Control de conflictos (modificación simultánea en dos dispositivos)');
  A.CSN.sync.detener(); B.CSN.sync.detener();
  await A.CSN.sync.sincronizar({});
  await B.CSN.sync.sincronizar({});
  // El celular modifica primero, el computador después (sin sincronizar entre medio)
  await B.CSN.store.guardarTarea({ id: tareaA.id, descripcion: 'Versión del celular: filtro de arena colapsado' });
  await esperarMs(12);
  await A.CSN.store.guardarTarea({ id: tareaA.id, descripcion: 'Versión del computador: sello de junta de dilatación' });
  await A.CSN.sync.sincronizar({});    // el computador publica su versión (más reciente)
  const resConf = await B.CSN.sync.sincronizar({});
  H.ok(resConf.conflictos >= 1, 'El otro dispositivo detecta el conflicto al recibir un cambio más reciente');
  const conflictos = B.CSN.store.conflictos(true);
  H.ok(conflictos.length >= 1, 'El conflicto queda registrado para revisión');
  const cf = conflictos[0];
  H.igual(cf.coleccion, 'tareas', 'El conflicto identifica la colección afectada');
  H.igual(cf.registroId, tareaA.id, 'El conflicto identifica el registro afectado');
  H.ok(!!cf.usuarioLocal && !!cf.usuarioRemoto, 'Se registran los usuarios de ambas modificaciones');
  H.ok(!!cf.dispositivoLocal && !!cf.dispositivoRemoto, 'Se registran los dispositivos de ambas modificaciones');
  H.ok(!!cf.fecha && !!cf.hora, 'Se registran la fecha y la hora del conflicto');
  H.ok(!!cf.versionLocal && !!cf.versionRemota, 'Se conservan AMBAS versiones para su revisión');
  H.contiene(cf.versionRemota.descripcion, 'computador', 'La versión más reciente se aplica como definitiva');
  H.contiene(cf.versionLocal.descripcion, 'celular', 'La versión descartada queda disponible para restaurarla');
  H.contiene(B.CSN.store.tarea(tareaA.id).descripcion, 'computador', 'No se sobrescribe en silencio: se aplica la versión más reciente y se avisa');

  await B.CSN.store.resolverConflicto(cf.id, 'local');
  H.contiene(B.CSN.store.tarea(tareaA.id).descripcion, 'celular', 'El administrador puede restaurar la versión descartada');
  H.igual(B.CSN.store.conflictos(true).length, 0, 'El conflicto queda resuelto');
  H.ok(B.CSN.store.bitacora().some((b) => /Conflicto resuelto/.test(b.accion)), 'La resolución queda registrada en la bitácora');

  /* ================= 7. Evitar duplicación ================= */
  H.grupo('7. Evitar duplicación de registros');
  await B.CSN.sync.sincronizar({});
  await A.CSN.sync.sincronizar({});
  await B.CSN.sync.sincronizar({});
  const titulosA = A.CSN.store.todas('tareas').map((t) => t.id);
  H.igual(titulosA.length, new Set(titulosA).size, 'No hay identificadores repetidos en el dispositivo A');
  H.igual(A.CSN.store.todas('tareas').filter((t) => t.id === tareaA.id).length, 1, 'La tarea sincronizada aparece una sola vez');
  H.igual(A.CSN.store.todas('comunidades').filter((c) => c.id === 'com_demo_atalaya').length, 1, 'Las comunidades de demostración no se duplican entre dispositivos');
  H.igual(B.CSN.store.todas('comunidades').length, A.CSN.store.todas('comunidades').length, 'Ambos dispositivos tienen la misma cantidad de comunidades');

  /* ================= 8. Bases de datos Supabase ================= */
  H.grupo('8. Base de datos en la nube (Supabase)');
  const apiS = apiSupabase();
  const C = H.crearEntorno({ sinApp: true, fetch: apiS.fetch });
  const D = H.crearEntorno({ sinApp: true, fetch: apiS.fetch });
  await C.CSN.store.iniciar();
  await D.CSN.store.iniciar();
  await C.CSN.store.login('admin@csn.cl', 'csn2026');
  await D.CSN.store.login('admin@csn.cl', 'csn2026');
  const configSupabase = { syncModo: 'supabase', supabaseUrl: 'https://demo.supabase.co', supabaseKey: 'clave-publica', supabaseTabla: 'csn_registros', syncAuto: false, syncIntervalo: 600 };
  await C.CSN.store.guardarConfig(configSupabase);
  await D.CSN.store.guardarConfig(configSupabase);
  H.ok(C.CSN.sync.configurado(), 'La sincronización con Supabase queda configurada');
  const pSupa = await C.CSN.sync.probar();
  H.igual(pSupa.accesible, true, 'La tabla de registros es accesible');
  await C.CSN.store.marcarSincronizados();
  await D.CSN.store.marcarSincronizados();

  const comC = C.CSN.store.comunidades()[2];
  const tareaC = await C.CSN.store.guardarTarea({
    comunidadId: comC.id, titulo: 'Certificación de ascensor (prueba Supabase)',
    fechaLimite: C.CSN.util.sumarDias(C.CSN.util.hoy(), 20), prioridad: 'Alta'
  });
  const rC = await C.CSN.sync.sincronizar({});
  H.ok(rC.ok && rC.subidos >= 1, 'El dispositivo C envía los cambios a Supabase (' + rC.subidos + ')');
  const rD = await D.CSN.sync.sincronizar({});
  H.ok(rD.ok && rD.bajados >= 1, 'El dispositivo D recibe los cambios desde Supabase (' + rD.bajados + ')');
  H.ok(!!D.CSN.store.tarea(tareaC.id), 'La tarea creada en C aparece en D');
  H.igual(D.CSN.store.tarea(tareaC.id).titulo, 'Certificación de ascensor (prueba Supabase)', 'El contenido llega íntegro');
  H.ok(apiS.estado.peticiones.some((p) => /select=id,coleccion,ts/.test(p)), 'La descarga compara primero marcas de tiempo (sincronización incremental)');
  H.ok(apiS.estado.peticiones.some((p) => /select=id,coleccion,datos/.test(p)), 'Sólo se descarga el contenido de los registros que cambiaron');
  H.ok(apiS.estado.peticiones.some((p) => /POST \/rest\/v1\/csn_registros/.test(p)), 'La carga se realiza en la tabla de registros');

  await C.CSN.store.agregarAvance({ tareaId: tareaC.id, porcentaje: 100, descripcion: 'Certificación entregada' });
  await C.CSN.sync.sincronizar({});
  await D.CSN.sync.sincronizar({});
  H.igual(D.CSN.store.tarea(tareaC.id).avance, 100, 'El avance registrado en C se refleja en D');
  H.igual(D.CSN.store.avancesDe(tareaC.id).filter((a) => /Certificación entregada/.test(a.descripcion)).length, 1, 'El avance llega una sola vez (sin duplicados)');

  /* ================= 9. Errores de configuración ================= */
  H.grupo('9. Mensajes de error claros');
  const E = H.crearEntorno({ sinApp: true, fetch: api.fetch });
  await E.CSN.store.iniciar();
  await E.CSN.store.login('admin@csn.cl', 'csn2026');
  const rSinConfig = await E.CSN.sync.sincronizar({});
  H.falso(rSinConfig.ok, 'Sin configuración la sincronización no se ejecuta');
  H.igual(E.CSN.sync.estado, 'solo-local', 'El indicador informa que trabaja sólo localmente');
  await E.CSN.store.guardarConfig({ syncModo: 'gist', gistToken: 'token-invalido', syncClave: 'clave-de-prueba-2026', gistId: 'G99' });
  let e2 = null;
  try { await E.CSN.sync.probar(); } catch (x) { e2 = x; }
  H.ok(e2 && /no se encontró el repositorio/i.test(e2.message),
    'Se informa con claridad cuando el repositorio no existe', e2 ? e2.message : 'no hubo error');
  H.contiene(e2.message, '404', 'El mensaje indica el código de respuesta del servicio');
  H.igual(E.CSN.sync.estado, 'error', 'El indicador refleja el error');

  /* ================= 10. Vincular el celular con un solo código ================= */
  H.grupo('10. Vinculación del celular con un código');
  await A.CSN.sync.sincronizar({});
  const codigo = await A.CSN.sync.generarCodigoVinculacion();
  H.contiene(codigo, 'CSNV1-', 'Se genera un código de vinculación identificable');
  H.noContiene(codigo, CLAVE, 'La clave de cifrado no aparece en texto claro dentro del código');
  H.noContiene(codigo, 'token-de-prueba', 'El token no aparece en texto claro dentro del código');
  H.ok(codigo.length > 60 && codigo.indexOf('\n') < 0, 'El código se puede copiar y enviar en un solo bloque');

  // Dispositivo nuevo (el celular): sin ninguna configuración previa
  const Z = H.crearEntorno({ sinApp: true, fetch: api.fetch });
  await Z.CSN.store.iniciar();
  await Z.CSN.store.login('admin@csn.cl', 'csn2026');
  H.falso(Z.CSN.sync.configurado(), 'El dispositivo nuevo parte sin sincronización configurada');
  const resZ = await Z.CSN.sync.aplicarCodigoVinculacion(codigo);
  H.igual(resZ.metodo, 'gist', 'El código configura el mismo método de sincronización');
  H.ok(Z.CSN.sync.configurado(), 'El dispositivo queda sincronizado con un solo paso');
  H.igual(Z.CSN.store.config().gistId, A.CSN.store.config().gistId, 'Queda configurado el mismo repositorio de datos');
  H.igual(Z.CSN.store.config().syncClave, CLAVE, 'Queda configurada la misma clave de cifrado');
  H.igual(Z.CSN.store.config().gistToken, 'token-de-prueba', 'Queda configurado el token de acceso');
  H.ok(resZ.resultado.ok && resZ.resultado.bajados >= 1, 'Al vincular, el dispositivo recibe los datos existentes (' + resZ.resultado.bajados + ')');
  H.ok(!!Z.CSN.store.tarea(tareaA.id), 'Las tareas del computador ya están disponibles en el celular');
  H.ok(Z.CSN.store.avancesDe(tareaA.id).length >= 1, 'Los avances también llegan al vincular');
  H.ok(Z.CSN.store.fotosDe(tareaA.id).length >= 1, 'Las fotografías también llegan al vincular');
  H.ok(Z.CSN.store.historialDe(tareaA.id).length >= 1, 'El historial de modificaciones también llega al vincular');

  // El celular también puede enviar; el computador recibe
  await Z.CSN.store.guardarTarea({
    comunidadId: Z.CSN.store.comunidades()[1].id, titulo: 'Tarea creada en el celular vinculado',
    fechaLimite: Z.CSN.util.sumarDias(Z.CSN.util.hoy(), 7), prioridad: 'Media'
  });
  await Z.CSN.sync.sincronizar({});
  await A.CSN.sync.sincronizar({});
  H.ok(A.CSN.store.todas('tareas').some((t) => /celular vinculado/.test(t.titulo)), 'Lo que se crea en el celular llega al computador');

  // Integridad del código
  let e3 = null;
  try { await Z.CSN.sync.aplicarCodigoVinculacion(codigo.slice(0, codigo.length - 12)); } catch (x) { e3 = x; }
  H.ok(e3 && /incompleto|alterado/i.test(e3.message), 'Se detecta un código incompleto');
  e3 = null;
  const alterado = codigo.slice(0, 20) + (codigo[20] === 'a' ? 'b' : 'a') + codigo.slice(21);
  try { await Z.CSN.sync.aplicarCodigoVinculacion(alterado); } catch (x) { e3 = x; }
  H.ok(e3 && /incompleto|alterado/i.test(e3.message), 'Se detecta un código manipulado');
  e3 = null;
  try { await Z.CSN.sync.aplicarCodigoVinculacion('1234567890'); } catch (x) { e3 = x; }
  H.ok(e3 && /CSNV1/.test(e3.message), 'Se rechaza un texto que no es un código de vinculación');
  e3 = null;
  try { await Z.CSN.sync.aplicarCodigoVinculacion(''); } catch (x) { e3 = x; }
  H.ok(e3 && /Pegue el código/i.test(e3.message), 'Se pide el código cuando el campo está vacío');

  // Pegado con saltos de línea o espacios (formato de los mensajes de texto)
  const W = H.crearEntorno({ sinApp: true, fetch: api.fetch });
  await W.CSN.store.iniciar();
  await W.CSN.store.login('admin@csn.cl', 'csn2026');
  const conEspacios = codigo.replace(/(.{40})/g, '$1\n   ');
  const resW = await W.CSN.sync.aplicarCodigoVinculacion(conEspacios);
  H.ok(W.CSN.sync.configurado() && resW.resultado.ok, 'El código funciona aunque se pegue con espacios o saltos de línea');

  // Código de una configuración con base de datos en la nube
  const Y = H.crearEntorno({ sinApp: true, fetch: apiS.fetch });
  const codigoSupa = await C.CSN.sync.generarCodigoVinculacion();
  await Y.CSN.store.iniciar();
  await Y.CSN.store.login('admin@csn.cl', 'csn2026');
  const resY = await Y.CSN.sync.aplicarCodigoVinculacion(codigoSupa);
  H.igual(resY.metodo, 'supabase', 'El código también funciona con la base de datos en la nube');
  H.igual(Y.CSN.store.config().supabaseTabla, 'csn_registros', 'Se transfiere la tabla configurada');
  H.ok(Y.CSN.sync.configurado(), 'El dispositivo queda sincronizado con Supabase');
  H.ok(resY.resultado.ok, 'La vinculación con la base de datos se completa y sincroniza');

  // No se puede generar un código sin configurar la sincronización
  const V0 = H.crearEntorno({ sinApp: true, fetch: api.fetch });
  await V0.CSN.store.iniciar();
  let e4 = null;
  try { await V0.CSN.sync.generarCodigoVinculacion(); } catch (x) { e4 = x; }
  H.ok(e4 && /Primero complete/i.test(e4.message), 'Sin sincronización configurada se explica qué falta antes de generar el código');

  /* ================= 11. Fallos de conexión: mensajes claros y reintentos ================= */
  H.grupo('11. Fallos de conexión (Internet, red bloqueada y servicio sin respuesta)');
    const errorDeRed = (msg) => { const e = new Error(msg || 'NetworkError when attempting to fetch resource.'); e.name = 'TypeError'; return e; };
  {
    // Dispositivo con una red que falla: el navegador produce un TypeError genérico
    const falla = () => Promise.reject(errorDeRed());
    const F = H.crearEntorno({ sinApp: true, fetch: falla });
    await F.CSN.store.iniciar();
    await F.CSN.store.login('admin@csn.cl', 'csn2026');
    F.CSN.sync.tiempoLimite = 60;              // tiempos reducidos para la prueba
    F.CSN.sync.esperasReintento = [0, 5, 10];
    await F.CSN.store.guardarConfig({ syncModo: 'gist', gistToken: 'tk', syncClave: 'clave-de-prueba-2026', gistId: 'G1', syncAuto: false });

    const rFallo = await F.CSN.sync.sincronizar({ manual: true });
    H.falso(rFallo.ok, 'Si la red falla, la sincronización informa el problema');
    H.falso(/NetworkError|Failed to fetch|TypeError/i.test(rFallo.mensaje),
      'El mensaje NO muestra el error técnico del navegador en inglés');
    H.contiene(rFallo.mensaje, 'No se pudo contactar el servicio', 'Explica que no se pudo contactar el servicio');
    H.contiene(rFallo.mensaje, 'guardada', 'Indica que la información está guardada en el equipo');
    H.ok(rFallo.red === true, 'El fallo se clasifica como problema de conexión');
    H.igual(F.CSN.sync.estado, 'error', 'El indicador refleja el estado de error');

    // Los cambios pendientes no se pierden: siguen en cola para el próximo intento
    const pend = F.CSN.store.pendientes().pendientes;
    H.ok(pend >= 1, 'Los cambios pendientes se conservan para enviarlos después');

    // Sin Internet (el propio dispositivo está desconectado)
    Object.defineProperty(F.w.navigator, 'onLine', { value: false, configurable: true });
    const rOff = await F.CSN.sync.sincronizar({ manual: true });
    H.falso(rOff.ok, 'Sin conexión no se sincroniza');
    H.contiene(rOff.mensaje, 'sin conexión a Internet', 'El mensaje distingue la falta de Internet del resto de fallos');
    H.igual(F.CSN.sync.estado, 'sin-conexion', 'El indicador muestra «SIN CONEXIÓN»');
    Object.defineProperty(F.w.navigator, 'onLine', { value: true, configurable: true });
  }

  {
    // Red inestable: falla dos veces y luego funciona -> debe reintentar solo y sincronizar
    const api2 = apiGist();
    // El repositorio se crea con la red funcionando (como ocurre en la realidad);
    // la inestabilidad se simula después.
    const gistCreado = await api2.fetch('https://api.github.com/gists',
      { method: 'POST', body: JSON.stringify({ description: 'prueba', files: { 'csn-meta.json': { content: JSON.stringify({ formato: 'csn-gestion-tareas', estado: 'nuevo' }) } } }) })
      .then((r) => r.json());
    let intentosRed = 0;
    const fetchInestable = (url, opts) => {
      intentosRed += 1;
      if (intentosRed <= 2) return Promise.reject(errorDeRed());
      return api2.fetch(url, opts);
    };
    const G = H.crearEntorno({ sinApp: true, fetch: fetchInestable });
    await G.CSN.store.iniciar();
    await G.CSN.store.login('admin@csn.cl', 'csn2026');
    G.CSN.sync.tiempoLimite = 300;
    G.CSN.sync.esperasReintento = [0, 20, 40];
    await G.CSN.store.guardarConfig({ syncModo: 'gist', gistToken: 'tk', syncClave: 'clave-de-prueba-2026', gistId: gistCreado.id, syncAuto: false });
    await G.CSN.store.guardarComunidad({ nombre: 'COMUNIDAD DE PRUEBA', comuna: 'Santiago' });

    const rInestable = await G.CSN.sync.sincronizar({ manual: true });
    H.ok(rInestable.ok, 'Tras fallar la red, la aplicación reintenta y logra sincronizar sin intervención');
    H.ok(intentosRed >= 3, 'Se realizaron varios intentos de conexión (' + intentosRed + ')');
    H.ok(G.CSN.store.pendientes().pendientes === 0, 'Al lograrlo, los cambios quedan enviados');
  }

  {
    // Servicio que no responde: debe cortarse por tiempo límite con un mensaje claro
    const colgado = (url, opts) => new Promise((res, rej) => {
      if (opts && opts.signal) opts.signal.addEventListener('abort', () => {
        const e = new Error('aborted'); e.name = 'AbortError'; rej(e);
      });
    });
    const T = H.crearEntorno({ sinApp: true, fetch: colgado });
    await T.CSN.store.iniciar();
    await T.CSN.store.login('admin@csn.cl', 'csn2026');
    T.CSN.sync.tiempoLimite = 80;
    T.CSN.sync.esperasReintento = [0, 5];
    await T.CSN.store.guardarConfig({ syncModo: 'gist', gistToken: 'tk', syncClave: 'clave-de-prueba-2026', gistId: 'G1', syncAuto: false });
    const rColgado = await T.CSN.sync.sincronizar({ manual: true });
    H.falso(rColgado.ok, 'Si el servicio no responde, la sincronización no queda a medias');
    H.contiene(rColgado.mensaje, 'no respondió a tiempo', 'Informa el tiempo de espera agotado');
    H.falso(/AbortError|aborted/i.test(rColgado.mensaje), 'No muestra el error técnico de cancelación');
  }

  H.resumen('sync.test.js');
})().catch((e) => {
  console.error('\n✗ ERROR EN LA SUITE:', e);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 150);   // cierra los temporizadores de la aplicación
});
