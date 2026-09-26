/* ==========================================================================
   views/config.js – CONFIGURACIÓN
   · Identidad corporativa: nombre de empresa, logotipo, colores, umbral del semáforo
   · Sincronización entre dispositivos (Gists cifrados o Supabase)
   · Control de conflictos
   · Respaldos, restauración, almacenamiento y bitácora de auditoría
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util, M = CSN.model, UI = CSN.ui;
  var V = CSN.views = CSN.views || {};

  var Vcfg = V.config = {};

  Vcfg.render = function (cont, params) {
    params = params || {};
    var c = CSN.store.config();
    var puede = CSN.store.puede('config.editar');
    var soloLectura = puede ? '' : ' disabled';
    var dbModo = { idb: 'IndexedDB (recomendado)', local: 'localStorage (limitado)', memoria: 'memoria temporal (no persistente)' }[CSN.db.modo] || CSN.db.modo;

    cont.innerHTML = '' +
      UI.encabezado('CONFIGURACIÓN',
        'Identidad corporativa, sincronización entre dispositivos, seguridad y respaldos.',
        '<button class="btn" data-c="exportar-respaldo">⬇ Exportar respaldo</button>' +
        '<button class="btn" data-c="importar-respaldo">⬆ Restaurar respaldo</button>') +

      /* --- Identidad corporativa --- */
      '<div class="card mb" id="sec-empresa"><div class="card-h"><h2>🏢 Identidad corporativa</h2></div>' +
      '<div class="grid grid-2">' +
      '<div>' +
      UI.campo({ nombre: 'nombreApp', label: 'Nombre de la aplicación (primera fila del encabezado)', valor: c.nombreApp }) +
      UI.campo({ nombre: 'empresa', label: 'Nombre de la empresa (segunda fila del encabezado)', valor: c.empresa }) +
      UI.campo({ nombre: 'firmante', label: 'Responsable que firma los informes', valor: c.firmante }) +
      UI.campo({ nombre: 'pieInforme', label: 'Texto al pie de los informes', tipo: 'textarea', valor: c.pieInforme }) +
      UI.campo({ nombre: 'umbralDias', label: 'Días para considerar «próxima a vencer» (semáforo amarillo)', tipo: 'number', valor: c.umbralDias, ayuda: 'Por defecto 3 días. Si la fecha límite ya pasó, la tarea se marca en rojo como VENCIDA.' }) +
      '</div>' +
      '<div>' +
      '<div class="field"><label>Logotipo de la empresa</label>' +
      '<div class="card tight center" style="background:var(--c-surface-2)"><img id="logo-prev" src="' + U.attr(c.logo) + '" alt="Logotipo" style="max-height:130px;max-width:100%"></div>' +
      '<div class="btn-group mt"><button class="btn" data-c="logo">🖼️ Cargar / reemplazar logotipo</button>' +
      '<button class="btn" data-c="logo-restaurar">↺ Usar logotipo original</button></div>' +
      '<span class="hint-line">Se recomienda una imagen PNG con fondo transparente o blanco. El logotipo aparece en el encabezado y en los informes PDF.</span></div>' +
      '<div class="field"><label>Color principal (corporativo)</label>' +
      '<div class="flex gap items-center"><input type="color" data-campo="colorPrincipal" value="' + U.attr(c.colorPrincipal) + '" style="width:64px;height:38px;padding:2px">' +
      '<input type="text" data-campo="colorPrincipalTexto" value="' + U.attr(c.colorPrincipal) + '" style="max-width:130px"></div></div>' +
      '<div class="field"><label>Color secundario (acento)</label>' +
      '<div class="flex gap items-center"><input type="color" data-campo="colorSecundario" value="' + U.attr(c.colorSecundario) + '" style="width:64px;height:38px;padding:2px">' +
      '<input type="text" data-campo="colorSecundarioTexto" value="' + U.attr(c.colorSecundario) + '" style="max-width:130px"></div></div>' +
      '<div class="small muted">Colores actuales del logotipo: <b>#003090</b> (azul) y <b>#60cc24</b> (verde).</div>' +
      '</div></div>' +
      (puede ? '<div class="btn-group mt"><button class="btn btn-primary" data-c="guardar-empresa">Guardar identidad corporativa</button></div>'
        : '<div class="alert-box alert-warn mt">Su perfil no permite modificar la configuración. Solicite acceso a un Administrador.</div>') +
      '</div>' +

      /* --- Sincronización --- */
      '<div class="card mb" id="sec-sync"><div class="card-h"><h2>🔄 Sincronización entre dispositivos</h2>' +
      '<span class="actions">' + UI.etiquetaSync() + '</span></div>' +
      '<div class="alert-box alert-info mb">Los datos se guardan en este dispositivo y, al configurar un método de sincronización, se replican en Internet para que estén disponibles desde el computador y el teléfono. ' +
      'Los cambios hechos sin conexión se envían automáticamente al recuperar Internet.</div>' +
      '<div class="form-grid">' +
      UI.campo({ nombre: 'syncModo', label: 'Método de sincronización', tipo: 'select', valor: c.syncModo, ancho: 2, opcionesHtml:
        "<option value='local' " + (c.syncModo === 'local' ? 'selected' : '') + ">Sólo en este dispositivo (sin sincronización)</option>" +
        "<option value='gist' " + (c.syncModo === 'gist' ? 'selected' : '') + ">Nube cifrada — Repositorio privado de datos (recomendado para empezar)</option>" +
        "<option value='supabase' " + (c.syncModo === 'supabase' ? 'selected' : '') + ">Base de datos en la nube — Supabase (recomendado para uso intensivo)</option>" }) +
      UI.campo({ nombre: 'syncIntervalo', label: 'Intervalo de sincronización automática (segundos)', tipo: 'number', valor: c.syncIntervalo }) +
      UI.campo({ nombre: 'syncAuto', label: 'Sincronización automática', tipo: 'select', valor: String(c.syncAuto !== false), opcionesHtml:
        "<option value='true' " + (c.syncAuto !== false ? 'selected' : '') + ">Activada</option><option value='false' " + (c.syncAuto === false ? 'selected' : '') + ">Desactivada (sólo manual)</option>" }) +
      '</div>' +

      '<div class="section-title">Datos de conexión</div>' +
      '<div id="panel-gist" class="' + (c.syncModo === 'gist' ? '' : 'hidden') + '">' +
      '<div class="form-grid">' +
      UI.campo({ nombre: 'gistToken', label: 'Token de acceso (permiso «gist»)', tipo: 'password', valor: c.gistToken, ancho: 2, ayuda: 'Se genera en GitHub → Configuración → Developer settings → Tokens (classic) con el permiso «gist». No se comparte con nadie más.' }) +
      UI.campo({ nombre: 'gistId', label: 'Identificador del repositorio de datos', valor: c.gistId, ayuda: 'Déjelo vacío y pulse «Crear repositorio» para generar uno nuevo.' }) +
      UI.campo({ nombre: 'syncClave', label: 'Clave de cifrado (la misma en todos los dispositivos)', tipo: 'password', valor: c.syncClave, ancho: 2, ayuda: 'Mínimo 12 caracteres. Los datos viajan cifrados con AES-256; si se pierde esta clave no es posible descifrarlos.' }) +
      '</div>' +
      '<div class="btn-group"><button class="btn" data-c="gist-crear">＋ Crear repositorio de datos</button>' +
      '<button class="btn" data-c="probar">🔍 Probar conexión</button>' +
      '<button class="btn btn-primary" data-c="sync-ahora">🔄 Sincronizar ahora</button></div>' +
      '</div>' +

      '<div id="panel-supabase" class="' + (c.syncModo === 'supabase' ? '' : 'hidden') + '">' +
      '<div class="form-grid">' +
      UI.campo({ nombre: 'supabaseUrl', label: 'Dirección del proyecto (URL)', valor: c.supabaseUrl, placeholder: 'https://xxxxxxxx.supabase.co', ancho: 2 }) +
      UI.campo({ nombre: 'supabaseKey', label: 'Clave pública (anon key)', tipo: 'password', valor: c.supabaseKey, ancho: 2 }) +
      UI.campo({ nombre: 'supabaseTabla', label: 'Tabla de registros', valor: c.supabaseTabla }) +
      UI.campo({ nombre: 'supabaseEmail', label: 'Correo del usuario de base de datos (opcional)', tipo: 'email', valor: c.supabaseEmail || '', ayuda: 'Si la tabla exige autenticación, indique el usuario creado en Supabase.' }) +
      UI.campo({ nombre: 'supabasePassword', label: 'Contraseña del usuario de base de datos (opcional)', tipo: 'password', valor: c.supabasePassword || '' }) +
      '</div>' +
      '<div class="alert-box alert-info">Antes de usar este método, ejecute el script SQL incluido en <b>supabase/schema.sql</b> en su proyecto de Supabase (SQL Editor). Luego pulse «Probar conexión».</div>' +
      '<div class="btn-group mt"><button class="btn" data-c="probar">🔍 Probar conexión</button>' +
      '<button class="btn btn-primary" data-c="sync-ahora">🔄 Sincronizar ahora</button></div>' +
      '</div>' +

      '<div class="section-title">📱 Vincular el celular (o cualquier dispositivo nuevo)</div>' +
      '<div class="alert-box alert-info mb">Genere un <b>código de vinculación</b> en este dispositivo y péguelo en el otro: la nube, el repositorio y la clave de cifrado quedan configurados en un solo paso, sin escribir nada más.</div>' +
      '<div class="btn-group"><button class="btn btn-accent" data-c="codigo-generar">📱 Generar código para el celular</button>' +
      '<button class="btn" data-c="codigo-aplicar">🔗 Pegar código de vinculación</button></div>' +

      (puede ? '<div class="btn-group mt"><button class="btn btn-primary" data-c="guardar-sync">Guardar configuración de sincronización</button>' +
        '<button class="btn" data-c="sync-detalle">Ver estado detallado</button></div>' : '') +
      '<div id="sync-info" class="small muted mt"></div>' +
      '</div>' +

      /* --- Conflictos --- */
      '<div class="card mb" id="sec-conflictos"><div class="card-h"><h2>⚠️ Control de conflictos</h2>' +
      '<span class="badge b-alerta actions">' + CSN.store.conflictos(true).length + ' sin revisar</span></div>' +
      '<div id="lista-conflictos">' + Vcfg.conflictosHtml() + '</div></div>' +

      /* --- Respaldos y almacenamiento --- */
      '<div class="card mb"><div class="card-h"><h2>💾 Respaldos y almacenamiento</h2></div>' +
      '<dl class="kv"><dt>Motor de almacenamiento</dt><dd>' + U.escapeHtml(dbModo) + '</dd>' +
      '<dt>Registros guardados</dt><dd>' + CSN.store.pendientes().total + '</dd>' +
      '<dt>Cambios pendientes de sincronizar</dt><dd>' + CSN.store.pendientes().pendientes + '</dd>' +
      '<dt>Última sincronización</dt><dd>' + U.escapeHtml(c.ultimaSync || 'Sin sincronizaciones aún') + (c.ultimaSyncEstado ? ' (' + U.escapeHtml(c.ultimaSyncEstado) + ')' : '') + '</dd>' +
      '<dt>Uso de almacenamiento</dt><dd id="uso-almacenamiento">calculando…</dd></dl>' +
      '<div class="btn-group mt"><button class="btn" data-c="exportar-respaldo">⬇ Exportar respaldo (JSON)</button>' +
      '<button class="btn" data-c="importar-respaldo">⬆ Restaurar desde respaldo</button>' +
      '<button class="btn" data-c="purgar">🧹 Depurar registros eliminados</button>' +
      (CSN.store.puede('datos.gestionar') ? '<button class="btn" data-c="demo">🎬 Recargar datos de demostración</button>' +
        '<button class="btn btn-danger" data-c="borrar">🗑 Borrar todos los datos</button>' : '') +
      '</div></div>' +

      /* --- Auditoría --- */
      '<div class="card mb"><div class="card-h"><h2>📜 Bitácora de auditoría</h2>' +
      '<span class="small muted actions">Últimos movimientos del sistema</span></div>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>' +
      (CSN.store.bitacora().slice(0, 40).map(function (b) {
        return '<tr><td class="nowrap small">' + U.escapeHtml(b.marca || '') + '</td><td>' + U.escapeHtml(b.usuario || '') + '</td>' +
          '<td>' + U.escapeHtml(b.accion || '') + '</td><td class="small">' + U.escapeHtml(b.detalle || '') + '</td></tr>';
      }).join('') || '<tr><td colspan="4" class="muted">Sin movimientos registrados.</td></tr>') +
      '</tbody></table></div></div>' +

      /* --- Acerca de --- */
      '<div class="card"><div class="card-h"><h2>ℹ️ Acerca del sistema</h2></div>' +
      '<div class="grid grid-2"><div><dl class="kv">' +
      '<dt>Aplicación</dt><dd>' + U.escapeHtml(c.nombreApp) + '</dd>' +
      '<dt>Empresa</dt><dd>' + U.escapeHtml(c.empresa) + '</dd>' +
      '<dt>Versión</dt><dd>' + U.escapeHtml(CSN.app.VERSION) + '</dd>' +
      '<dt>Dispositivo</dt><dd class="mono small">' + U.escapeHtml(U.deviceId()) + '</dd>' +
      '<dt>Perfil activo</dt><dd>' + U.escapeHtml((CSN.store.sesion() || {}).perfil || '') + '</dd>' +
      '</dl></div><div><div class="section-title" style="margin-top:0">Preparado para crecer</div>' +
      '<div class="small muted">La estructura de datos está preparada para incorporar nuevos módulos: proveedores, trabajadores, mantenciones, gastos, contratos, reclamos, documentos, inspecciones, inventario, emergencias, control de visitas y agenda del administrador.</div>' +
      '<div class="btn-group mt"><button class="btn" data-c="instalar">📲 Instalar aplicación en este dispositivo</button></div>' +
      '</div></div></div>';

    cargarUso();
    Vcfg.enlazar(cont, params);
  };

  function cargarUso() {
    CSN.db.uso().then(function (u) {
      var el = U.$('#uso-almacenamiento');
      if (!el) return;
      el.textContent = (u.cuota ? U.peso(u.usado) + ' de ' + U.peso(u.cuota) + ' disponibles' : 'No disponible en este navegador');
    });
  }

  Vcfg.conflictosHtml = function () {
    var lista = CSN.store.conflictos(true);
    if (!lista.length) return '<p class="muted small">No se han detectado conflictos. Cuando un mismo registro se modifique en dos dispositivos, aparecerá aquí con ambas versiones, el usuario y la hora de cada cambio.</p>';
    return '<div class="stack">' + lista.map(function (cf) {
      var t = CSN.store.todas(cf.coleccion).filter(function (x) { return x.id === cf.registroId; })[0];
      var nombre = (cf.versionRemota && cf.versionRemota.titulo) || (cf.versionLocal && cf.versionLocal.titulo) ||
        (cf.versionRemota && cf.versionRemota.nombre) || (cf.versionLocal && cf.versionLocal.nombre) || cf.registroId;
      return '<div class="card tight" style="border-left:4px solid var(--c-warn)">' +
        '<div class="flex between items-center flex-wrap gap"><b>' + U.escapeHtml(nombre) + '</b>' +
        '<span class="small muted">' + U.escapeHtml(cf.fecha + ' ' + cf.hora) + ' · ' + U.escapeHtml(cf.coleccion) + '</span></div>' +
        '<div class="small muted mt">' + U.escapeHtml(cf.detalle || '') + '</div>' +
        '<div class="grid grid-2 mt">' +
        '<div class="card tight"><div class="small"><b>Versión de este dispositivo</b></div>' +
        '<div class="small muted">Usuario: ' + U.escapeHtml(cf.usuarioLocal || '—') + '<br>Dispositivo: ' + U.escapeHtml(cf.dispositivoLocal || '—') + '<br>Marca: ' + U.escapeHtml(resumenRegistro(cf.versionLocal)) + '</div>' +
        '<button class="btn btn-sm mt" data-c="cf-local" data-id="' + U.attr(cf.id) + '">Conservar esta versión</button></div>' +
        '<div class="card tight"><div class="small"><b>Versión del otro dispositivo</b></div>' +
        '<div class="small muted">Usuario: ' + U.escapeHtml(cf.usuarioRemoto || '—') + '<br>Dispositivo: ' + U.escapeHtml(cf.dispositivoRemoto || '—') + '<br>Marca: ' + U.escapeHtml(resumenRegistro(cf.versionRemota)) + '</div>' +
        '<button class="btn btn-sm mt" data-c="cf-remota" data-id="' + U.attr(cf.id) + '">Conservar versión remota</button></div>' +
        '</div>' +
        '<div class="btn-group mt"><button class="btn btn-sm" data-c="cf-cerrar" data-id="' + U.attr(cf.id) + '">Marcar como revisado</button></div>' +
        '</div>';
    }).join('') + '</div>';
  };

  function resumenRegistro(r) {
    if (!r) return 'no disponible';
    return (r._marca || '') + ' por ' + (r._by || '');
  }

  /* ================= Enlazado de eventos ================= */
  Vcfg.enlazar = function (cont, params) {
    // Modo de sincronización: muestra el panel correspondiente
    var sel = U.$('[data-campo="syncModo"]', cont);
    if (sel) {
      sel.onchange = function () {
        U.$('#panel-gist', cont).classList.toggle('hidden', sel.value !== 'gist');
        U.$('#panel-supabase', cont).classList.toggle('hidden', sel.value !== 'supabase');
      };
    }
    // Colores: sincroniza el selector y el texto
    ['colorPrincipal', 'colorSecundario'].forEach(function (campo) {
      var color = U.$('[data-campo="' + campo + '"]', cont);
      var texto = U.$('[data-campo="' + campo + 'Texto"]', cont);
      if (!color || !texto) return;
      color.oninput = function () { texto.value = color.value; aplicarColores(cont); };
      texto.onchange = function () {
        if (/^#[0-9a-f]{6}$/i.test(texto.value)) { color.value = texto.value; aplicarColores(cont); }
        else U.toast('Use un color en formato #RRGGBB', 'err');
      };
    });
    function aplicarColores(raiz) {
      var p = U.$('[data-campo="colorPrincipal"]', raiz);
      var s = U.$('[data-campo="colorSecundario"]', raiz);
      if (!p || !s) return;
      document.documentElement.style.setProperty('--c-primary', p.value);
      document.documentElement.style.setProperty('--c-accent', s.value);
      if (CSN.app) CSN.app.aplicarColores(p.value, s.value, true);
    }

    cont.onclick = function (e) {
      var b = e.target.closest('[data-c]');
      if (!b) return;
      var a = b.getAttribute('data-c');
      var id = b.getAttribute('data-id');
      var acciones = {
        'logo': function () { subirLogo(cont); },
        'logo-restaurar': function () {
          if (!CSN.store.puede('config.editar')) { U.toast('Su perfil no permite modificar la configuración', 'warn'); return; }
          CSN.store.guardarConfig({ logo: 'assets/logo.png' }).then(function () {
            CSN.app.aplicarIdentidad(); Vcfg.render(cont, params);
            U.toast('Logotipo original restaurado', 'ok');
          });
        },
        'guardar-empresa': function () {
          var datos = {};
          U.$$('[data-campo]', cont).forEach(function (el) {
            var k = el.getAttribute('data-campo');
            if (k === 'syncModo' || k.indexOf('sync') === 0 || k.indexOf('gist') === 0 || k.indexOf('supabase') === 0) return;
            if (k === 'colorPrincipalTexto' || k === 'colorSecundarioTexto') return;
            datos[k] = el.type === 'checkbox' ? el.checked : el.value;
          });
          if (datos.umbralDias !== undefined) datos.umbralDias = Math.max(1, Math.min(90, +datos.umbralDias || 3));
          CSN.store.guardarConfig(datos).then(function () {
            CSN.app.aplicarIdentidad();
            U.toast('Identidad corporativa guardada', 'ok');
            Vcfg.render(cont, params);
          }).catch(function (err) { U.toast(err.message, 'err'); });
        },
        'guardar-sync': function () {
          var datos = {};
          U.$$('[data-campo]', cont).forEach(function (el) {
            var k = el.getAttribute('data-campo');
            if (['syncModo', 'syncIntervalo', 'syncAuto', 'gistToken', 'gistId', 'syncClave', 'supabaseUrl', 'supabaseKey', 'supabaseTabla', 'supabaseEmail', 'supabasePassword'].indexOf(k) < 0) return;
            datos[k] = el.value;
          });
          datos.syncAuto = datos.syncAuto !== 'false';
          datos.syncIntervalo = Math.max(10, Math.min(600, +datos.syncIntervalo || 20));
          if (datos.syncModo === 'gist') {
            if (!datos.gistToken) { U.toast('Ingrese el token de acceso para la sincronización', 'err'); return; }
            if (!datos.syncClave || datos.syncClave.length < 12) { U.toast('La clave de cifrado debe tener al menos 12 caracteres', 'err'); return; }
          }
          if (datos.syncModo === 'supabase' && (!datos.supabaseUrl || !datos.supabaseKey)) {
            U.toast('Complete la dirección y la clave pública de Supabase', 'err'); return;
          }
          CSN.store.guardarConfig(datos).then(function () {
            U.toast('Configuración de sincronización guardada', 'ok');
            CSN.sync.detener();
            CSN.sync.iniciar();
            Vcfg.render(cont, params);
          }).catch(function (err) { U.toast(err.message, 'err'); });
        },
        'gist-crear': function () {
          if (!CSN.store.puede('sync.configurar')) { U.toast('Su perfil no permite configurar la sincronización', 'warn'); return; }
          var token = U.$('[data-campo="gistToken"]', cont);
          var clave = U.$('[data-campo="syncClave"]', cont);
          if (token && token.value) CSN.store.guardarConfigLocal({ gistToken: token.value.trim() });
          if (clave && clave.value) CSN.store.guardarConfigLocal({ syncClave: clave.value });
          b.disabled = true; b.innerHTML = '<span class="spinner"></span> Creando…';
          CSN.syncGist.crear().then(function (r) {
            U.toast('Repositorio de datos creado correctamente', 'ok');
            U.Modal.aviso('Repositorio creado',
              'El identificador es <b class="mono">' + U.escapeHtml(r.id) + '</b>.<br><br>' +
              'En los demás dispositivos ingrese el mismo <b>token</b>, la misma <b>clave de cifrado</b> y este <b>identificador</b> para acceder a los mismos datos.', '✅');
            Vcfg.render(cont, params);
          }).catch(function (err) {
            U.toast(err.message, 'err'); b.disabled = false; b.textContent = '＋ Crear repositorio de datos';
          });
        },
        'probar': function () {
          b.disabled = true; b.innerHTML = '<span class="spinner"></span> Probando…';
          CSN.sync.probar().then(function (info) {
            U.Modal.aviso('Conexión verificada',
              '<pre class="code-box">' + U.escapeHtml(JSON.stringify(info, null, 2)) + '</pre>', '✅');
            Vcfg.render(cont, params);
          }).catch(function (err) {
            U.Modal.aviso('No fue posible conectar', U.escapeHtml(err.message), '⚠️');
            b.disabled = false; b.textContent = '🔍 Probar conexión';
          });
        },
        'sync-ahora': function () {
          b.disabled = true; b.innerHTML = '<span class="spinner"></span> Sincronizando…';
          CSN.sync.sincronizar({ manual: true }).then(function () { Vcfg.render(cont, params); });
        },
        'sync-detalle': function () { CSN.syncUI.detalle(); },
        'codigo-generar': function () { generarCodigo(); },
        'codigo-aplicar': function () { aplicarCodigo(cont, params); },
        'exportar-respaldo': function () {
          CSN.store.respaldo().then(function (paquete) {
            U.descargar(JSON.stringify(paquete, null, 2),
              'respaldo-csn-' + U.hoy() + '.json', 'application/json');
            U.toast('Respaldo generado', 'ok');
          });
        },
        'importar-respaldo': function () { importar(cont, params); },
        'purgar': function () {
          var limite = Date.now() - (30 * 86400000);
          CSN.db.purgar(limite).then(function (n) {
            U.toast(n ? n + ' registro(s) eliminados depurados' : 'No había registros que depurar', 'ok');
            CSN.store.recargar().then(function () { Vcfg.render(cont, params); });
          });
        },
        'demo': function () {
          U.Modal.confirmar({ mensaje: '¿Cargar nuevamente los datos de demostración (ATALAYA, LA ESPUELA, VISTA VERDE II)?', textoOk: 'Cargar' })
            .then(function (ok) {
              if (!ok) return;
              CSN.store.cargarDemo().then(function () { CSN.app.recargar(); Vcfg.render(cont, params); });
            });
        },
        'borrar': function () {
          U.Modal.confirmar({
            titulo: 'Borrar todos los datos', peligro: true, textoOk: 'Borrar todo',
            mensaje: '¿Eliminar TODOS los datos de este dispositivo?',
            detalle: 'Se eliminarán comunidades, tareas, avances, fotografías, documentos, usuarios e historial. Esta acción no se puede deshacer. Se recomienda exportar un respaldo antes de continuar.'
          }).then(function (ok) {
            if (!ok) return;
            U.Modal.confirmar({ mensaje: 'Confirme nuevamente: se perderá toda la información local.', peligro: true, textoOk: 'Sí, borrar' })
              .then(function (ok2) {
                if (!ok2) return;
                CSN.store.borrarTodo().then(function () {
                  U.toast('Datos eliminados. La aplicación se reiniciará.', 'ok');
                  setTimeout(function () { location.reload(); }, 1200);
                });
              });
          });
        },
        'instalar': function () { CSN.app.instalar(); },
        'cf-local': function () { resolver(id, 'local', cont, params); },
        'cf-remota': function () { resolver(id, 'remota', cont, params); },
        'cf-cerrar': function () {
          var cf = CSN.store.todas('conflictos').filter(function (x) { return x.id === id; })[0];
          if (!cf) return;
          cf.resuelto = true; cf.resolucion = 'Revisado sin cambios el ' + U.marca();
          CSN.store.guardar('conflictos', cf).then(function () {
            U.toast('Conflicto marcado como revisado', 'ok'); Vcfg.render(cont, params);
          });
        }
      };
      if (acciones[a]) acciones[a]();
    };
  };

  function resolver(id, opcion, cont, params) {
    U.Modal.confirmar({
      mensaje: '¿Conservar la versión ' + (opcion === 'remota' ? 'del otro dispositivo' : 'de este dispositivo') + '?',
      detalle: 'La versión elegida reemplazará el registro actual y quedará registrada en la bitácora.'
    }).then(function (ok) {
      if (!ok) return;
      try {
        CSN.store.resolverConflicto(id, opcion);
        U.toast('Conflicto resuelto', 'ok');
      } catch (e) { U.toast(e.message, 'err'); }
      Vcfg.render(cont, params);
    });
  }

  /* ---------- Código de vinculación del celular ---------- */
  function generarCodigo() {
    if (!CSN.store.puede('sync.configurar')) { U.toast('Su perfil no permite configurar la sincronización', 'warn'); return; }
    CSN.sync.generarCodigoVinculacion().then(function (codigo) {
      U.Modal.abrir({
        title: 'Código para vincular el celular', icon: '📱', wide: true,
        body: '<div class="alert-box alert-ok mb">La configuración de sincronización de este dispositivo está lista. ' +
          'Envíe el siguiente código al celular (por ejemplo, por WhatsApp o correo a usted mismo) y péguelo allí en ' +
          '<b>Configuración → Sincronización → Pegar código de vinculación</b>.</div>' +
          '<label class="small" style="font-weight:700;color:var(--c-text-soft)">Código de vinculación (cópielo completo)</label>' +
          '<textarea id="codigo-vinculacion" readonly rows="6" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.8rem">' +
          U.escapeHtml(codigo) + '</textarea>' +
          '<div class="btn-group mt"><button class="btn btn-primary" data-x="copiar">📋 Copiar código</button>' +
          '<button class="btn" data-x="compartir">📤 Compartir</button>' +
          '<button class="btn" data-x="excel" style="display:none"></button></div>' +
          '<div class="section-title">Qué hacer en el celular</div>' +
          '<ol class="small muted" style="padding-left:1.2rem;margin:0">' +
          '<li>Abra la aplicación en el navegador del teléfono.</li>' +
          '<li>Ingrese con su usuario y contraseña.</li>' +
          '<li>Vaya a <b>Configuración → Sincronización entre dispositivos</b>.</li>' +
          '<li>Pulse <b>🔗 Pegar código de vinculación</b>, pegue el código y confirme.</li>' +
          '<li>Listo: el celular recibirá las tareas, avances, fotografías y el historial.</li>' +
          '</ol>' +
          '<div class="alert-box alert-warn mt"><b>Importante:</b> el código contiene sus credenciales de acceso a la nube. ' +
          'Compártalo únicamente por un medio seguro, no lo publique y genere uno nuevo si cambia el token.</div>',
        footer: '<button class="btn" data-x="cerrar">Cerrar</button>',
        onOpen: function (modal) {
          var ta = modal.querySelector('#codigo-vinculacion');
          modal.querySelector('[data-x="cerrar"]').onclick = function () { U.Modal.cerrar(); };
          modal.querySelector('[data-x="copiar"]').onclick = function () {
            ta.select();
            U.copiar(codigo).then(function (ok) {
              U.toast(ok ? 'Código copiado al portapapeles' : 'Seleccione el texto y cópielo manualmente', ok ? 'ok' : 'warn');
            });
          };
          modal.querySelector('[data-x="compartir"]').onclick = function () {
            var texto = 'Código para vincular la aplicación «GESTIÓN DE TAREAS – CSN» en el celular:\n\n' + codigo +
              '\n\nPéguelo en Configuración → Sincronización → Pegar código de vinculación.';
            if (navigator.share) {
              navigator.share({ title: 'Vincular GESTIÓN DE TAREAS CSN', text: texto }).catch(function () {});
            } else {
              U.copiar(texto).then(function () { U.toast('Código copiado para compartir', 'ok'); });
            }
          };
        }
      });
    }).catch(function (e) {
      U.Modal.aviso('Falta un paso', U.escapeHtml(e.message), '⚠️');
    });
  }

  function aplicarCodigo(cont, params) {
    U.Modal.abrir({
      title: 'Vincular este dispositivo', icon: '🔗', wide: true,
      body: '<div class="small muted mb">Pegue el código generado en el otro dispositivo (computador u otro teléfono). ' +
        'Al confirmar, este dispositivo quedará sincronizado con los mismos datos.</div>' +
        '<label class="small" style="font-weight:700;color:var(--c-text-soft)">Código de vinculación</label>' +
        '<textarea id="codigo-entrada" rows="6" placeholder="CSNV1-…" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.8rem"></textarea>' +
        '<div class="alert-box alert-info mt">Si este dispositivo ya tiene datos propios, se combinarán con los del otro dispositivo conservando el cambio más reciente de cada registro. ' +
        'Puede exportar un respaldo antes de continuar desde <b>Configuración → Respaldos</b>.</div>',
      footer: '<button class="btn" data-x="cancelar">Cancelar</button><button class="btn btn-primary" data-x="vincular">Vincular y sincronizar</button>',
      onOpen: function (modal) {
        var ta = modal.querySelector('#codigo-entrada');
        var btn = modal.querySelector('[data-x="vincular"]');
        modal.querySelector('[data-x="cancelar"]').onclick = function () { U.Modal.cerrar(); };
        setTimeout(function () { try { ta.focus(); } catch (e) {} }, 120);
        btn.onclick = function () {
          var codigo = ta.value;
          if (!codigo.trim()) { U.toast('Pegue el código de vinculación', 'err'); return; }
          btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Vinculando…';
          CSN.sync.aplicarCodigoVinculacion(codigo).then(function (r) {
            U.Modal.cerrar();
            U.toast(r.resultado.ok
              ? 'Dispositivo vinculado. Se recibieron ' + r.resultado.bajados + ' registro(s).'
              : 'Dispositivo vinculado, pero aún no fue posible sincronizar: ' + r.resultado.mensaje, r.resultado.ok ? 'ok' : 'warn', 7000);
            CSN.app.recargar();
            if (cont) Vcfg.render(cont, params);
          }).catch(function (e) {
            btn.disabled = false; btn.textContent = 'Vincular y sincronizar';
            U.toast(e.message, 'err', 8000);
          });
        };
      }
    });
  }

  function subirLogo(cont) {
    if (!CSN.store.puede('config.editar')) { U.toast('Su perfil no permite modificar la configuración', 'warn'); return; }
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = function () {
      var f = inp.files[0];
      if (!f) return;
      U.comprimirImagen(f, 700, 0.92).then(function (img) {
        return CSN.store.guardarConfig({ logo: img.dataUrl });
      }).then(function () {
        CSN.app.aplicarIdentidad();
        U.toast('Logotipo actualizado', 'ok');
        var prev = U.$('#logo-prev');
        if (prev) prev.src = CSN.store.config().logo;
      }).catch(function (e) { U.toast('No fue posible cargar el logotipo: ' + e.message, 'err'); });
    };
    inp.click();
  }

  function importar(cont, params) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var f = inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var paquete;
        try { paquete = JSON.parse(fr.result); }
        catch (e) { U.toast('El archivo no es un respaldo válido', 'err'); return; }
        U.Modal.confirmar({
          titulo: 'Restaurar respaldo',
          mensaje: '¿Cómo desea aplicar el respaldo?',
          detalle: 'Aceptar = combinarlo con los datos actuales (se conserva el cambio más reciente de cada registro). Cancelar = reemplazar todos los datos locales por los del respaldo.',
          textoOk: 'Combinar', textoCancelar: 'Reemplazar todo', peligro: true
        }).then(function (combinar) {
          CSN.store.restaurar(paquete, combinar).then(function () {
            U.toast('Respaldo restaurado correctamente', 'ok');
            CSN.app.recargar(); Vcfg.render(cont, params);
          }).catch(function (e) { U.toast(e.message, 'err'); });
        });
      };
      fr.readAsText(f);
    };
    inp.click();
  }
})(typeof window !== 'undefined' ? window : globalThis);
