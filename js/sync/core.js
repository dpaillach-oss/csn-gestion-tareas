/* ==========================================================================
   sync/core.js – Motor de sincronización (núcleo)
   · Estado del sincronizador (SINCRONIZADO / SINCRONIZANDO / SIN CONEXIÓN)
   · Mezcla de registros individuales por marca de tiempo (_ts) con detección
     y registro de conflictos (sin sobrescritura silenciosa)
   · Cola de cambios locales persistente (marca _nuevo en cada registro)
   · Sincronización automática y manual
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util;

  var COLECCIONES = ['comunidades', 'tareas', 'avances', 'archivos', 'usuarios', 'historial'];
  var SINCRONIZABLES = COLECCIONES.concat(['config']);
  // Campos que nunca viajan a la nube (credenciales y claves del dispositivo)
  var CAMPOS_PRIVADOS = ['gistToken', 'supabaseKey', 'syncClave', 'supabaseEmail', 'supabasePassword'];

  var ESTADOS = {
    'sincronizado': { texto: 'SINCRONIZADO', clase: 's-ok', icono: '🟢' },
    'sincronizando': { texto: 'SINCRONIZANDO', clase: 's-sync', icono: '🟡' },
    'sin-conexion': { texto: 'SIN CONEXIÓN', clase: 's-off', icono: '🔴' },
    'solo-local': { texto: 'SÓLO LOCAL', clase: 's-off', icono: '⚪' },
    'error': { texto: 'ERROR', clase: 's-off', icono: '🔴' }
  };

  var Sync = CSN.sync = {
    COLECCIONES: COLECCIONES,
    CAMPOS_PRIVADOS: CAMPOS_PRIVADOS,
    estado: 'solo-local',
    detalle: 'Sincronización no configurada',
    enCurso: false,
    ultimoResultado: null
  };

  var temporizador = null;
  var temporizadorPush = null;

  /* ---------- Configuración ---------- */
  function cfg() { return CSN.store.config(); }
  Sync.configurado = function () {
    var c = cfg();
    if (c.syncModo === 'gist') return !!(c.gistToken && c.syncClave);
    if (c.syncModo === 'supabase') return !!(c.supabaseUrl && c.supabaseKey);
    return false;
  };

  Sync.proveedor = function () {
    var c = cfg();
    if (c.syncModo === 'gist') return CSN.syncGist;
    if (c.syncModo === 'supabase') return CSN.syncSupabase;
    return null;
  };

  /* ---------- Estado ---------- */
  Sync.fijarEstado = function (estado, detalle) {
    Sync.estado = estado;
    Sync.detalle = detalle || (ESTADOS[estado] ? ESTADOS[estado].texto : '');
    Sync.emitirEstado();
  };
  Sync.emitirEstado = function () {
    CSN.store.emitir('sync', {
      estado: Sync.estado,
      texto: Sync.textoEstado(),
      detalle: Sync.detalle,
      clase: ESTADOS[Sync.estado] ? ESTADOS[Sync.estado].clase : 's-off',
      icono: ESTADOS[Sync.estado] ? ESTADOS[Sync.estado].icono : '🔴',
      pendientes: CSN.store.pendientes ? CSN.store.pendientes().pendientes : 0,
      ultima: cfg().ultimaSync || '',
      enCurso: Sync.enCurso
    });
  };
  Sync.textoEstado = function () { return ESTADOS[Sync.estado] ? ESTADOS[Sync.estado].texto : 'SIN CONEXIÓN'; };
  Sync.claseEstado = function () { return ESTADOS[Sync.estado] ? ESTADOS[Sync.estado].clase : 's-off'; };
  Sync.iconoEstado = function () { return ESTADOS[Sync.estado] ? ESTADOS[Sync.estado].icono : '🔴'; };
  Sync.ESTADOS = ESTADOS;

  /* ---------- Estado de red ---------- */
  function hayRed() {
    return typeof global.navigator === 'undefined' || global.navigator.onLine !== false;
  }

  /* ---------- Serialización del paquete ---------- */
  function limpiarConfig(c) {
    var copia = Object.assign({}, c);
    CAMPOS_PRIVADOS.forEach(function (k) { delete copia[k]; });
    return copia;
  }

  /**
   * Construye el paquete de datos que se envía a la nube.
   * @param opts.soloCambios  true → sólo los registros modificados desde el
   *   último envío (modo incremental, usado por la base de datos por filas).
   *   false (por defecto) → el conjunto COMPLETO de datos. Es obligatorio en
   *   los modos que guardan una copia única, porque de lo contrario un
   *   dispositivo que se conecta más tarde no recibiría los cambios anteriores.
   */
  Sync.armarPaquete = function (opts) {
    opts = opts || {};
    var crudo = CSN.store.crudo();
    var paquete = { formato: 'csn-gestion-tareas', version: 1, generado: U.marca(), dispositivo: U.deviceId(), colecciones: {} };
    SINCRONIZABLES.forEach(function (col) {
      var lista = (crudo[col] || []);
      if (col === 'config') lista = lista.map(limpiarConfig);
      paquete.colecciones[col] = opts.soloCambios
        ? lista.filter(function (r) { return r._nuevo || r._deleted; })
        : lista.slice();
    });
    return paquete;
  };

  /* ---------- Mezcla de registros (núcleo del control de conflictos) ---------- */
  /**
   * Integra los registros recibidos con los locales.
   * Regla: gana la marca de tiempo más reciente; si ambos lados modificaron el
   * mismo registro, se conserva la versión más nueva y se registra el conflicto
   * con las dos versiones para revisión del administrador.
   */
  Sync.mezclar = function (remotas) {
    var crudo = CSN.store.crudo();
    var resumen = { bajados: 0, conflictos: 0, ignorados: 0 };
    var ops = [];
    var pendientesConflicto = [];

    Object.keys(remotas || {}).forEach(function (col) {
      if (SINCRONIZABLES.indexOf(col) < 0) return;
      var lista = crudo[col] || [];
      var indice = {};
      lista.forEach(function (r, i) { indice[r.id] = i; });

      (remotas[col] || []).forEach(function (rr) {
        if (!rr || !rr.id) return;
        var esConfig = col === 'config';
        var local = indice[rr.id] !== undefined ? lista[indice[rr.id]] : null;

        if (esConfig && local) {
          // La configuración remota nunca pisa las credenciales de este dispositivo
          var mezcla = Object.assign({}, local, limpiarConfig(rr));
          CAMPOS_PRIVADOS.forEach(function (k) { mezcla[k] = local[k]; });
          mezcla._nuevo = local._nuevo;
          mezcla._ts = Math.max(local._ts || 0, rr._ts || 0);
          lista[indice[rr.id]] = mezcla;
          ops.push(['config', mezcla]);
          return;
        }

        var tsLocal = (local && local._ts) || 0;
        var tsRemoto = rr._ts || 0;

        if (!local) {
          if (rr._deleted) { resumen.ignorados++; return; }
          lista.push(rr); indice[rr.id] = lista.length - 1;
          ops.push([col, rr]); resumen.bajados++;
          return;
        }
        if (tsRemoto <= tsLocal) { return; } // la versión local es más reciente: se enviará a la nube

        // Ambos lados tienen cambios respecto de la última sincronización
        if (local._nuevo && !mismoContenido(local, rr)) {
          var remoto = rr, localCopia = JSON.parse(JSON.stringify(local));
          var ganaRemoto = tsRemoto >= tsLocal; // en la práctica siempre cierto aquí
          var elegido = ganaRemoto ? remoto : localCopia;
          elegido._nuevo = true;
          elegido._conflicto = true;
          lista[indice[rr.id]] = elegido;
          ops.push([col, elegido]);
          pendientesConflicto.push({
            tipo: 'Registro modificado en dos dispositivos',
            registroId: rr.id, coleccion: col,
            dispositivoLocal: localCopia._dev || '', dispositivoRemoto: remoto._dev || '',
            usuarioLocal: localCopia._by || '', usuarioRemoto: remoto._by || '',
            detalle: 'Se conservó la modificación más reciente (' + (elegido._marca || '') + ' por ' + (elegido._by || '') +
              '). La otra versión quedó registrada para su revisión.',
            versionLocal: localCopia, versionRemota: remoto
          });
          resumen.conflictos++;
          return;
        }

        var nuevo = rr;
        nuevo._nuevo = false;
        lista[indice[rr.id]] = nuevo;
        ops.push([col, nuevo]);
        resumen.bajados++;
      });
    });

    // Persistir primero los registros y luego los conflictos detectados
    var cadenas = {};
    ops.forEach(function (o) { (cadenas[o[0]] = cadenas[o[0]] || []).push(o[1]); });
    var aplicar = Object.keys(cadenas).reduce(function (p, col) {
      return p.then(function () { return CSN.db.bulkPut(col, cadenas[col]); });
    }, Promise.resolve());

    return aplicar.then(function () {
      return pendientesConflicto.reduce(function (p, c) {
        return p.then(function () { return CSN.store.registrarConflicto(c); });
      }, Promise.resolve()).then(function () { return resumen; });
    });
  };

  // Campos de control que no representan contenido de negocio: si sólo difieren
  // éstos, no existe conflicto real (se conserva simplemente la versión más nueva).
  var METADATOS = ['_ts', '_marca', '_by', '_dev', '_nuevo', '_conflicto'];

  function mismoContenido(a, b) {
    var claves = {};
    Object.keys(a || {}).concat(Object.keys(b || {})).forEach(function (k) { claves[k] = 1; });
    var igual = true;
    Object.keys(claves).forEach(function (k) {
      if (METADATOS.indexOf(k) >= 0) return;
      if (JSON.stringify(a ? a[k] : null) !== JSON.stringify(b ? b[k] : null)) igual = false;
    });
    return igual;
  }
  Sync.mismoContenido = mismoContenido;

  /** Espera a que no haya una sincronización en curso (evita conflictos entre envíos) */
  Sync.esperarLibre = function (ms) {
    ms = ms || 20000;
    var inicio = Date.now();
    return new Promise(function (res) {
      (function bucle() {
        if (!Sync.enCurso) return res(true);
        if (Date.now() - inicio > ms) return res(false);
        setTimeout(bucle, 250);
      })();
    });
  };

  /* ---------- Diagnóstico de fallos de conexión ---------- */
  // Mensajes que el navegador produce cuando la petición no llega a destino
  var RE_FALLO_RED = /NetworkError|Failed to fetch|Load failed|Network request failed|net::ERR|ERR_[A-Z_]+|fetch failed|NetworkError when attempting/i;

  /** ¿El fallo ocurrió antes de llegar al servicio (Internet, red o bloqueo)? */
  function esFalloDeRed(e) {
    if (!e) return false;
    if (e.name === 'AbortError' || e.timeout) return true;
    if (e.red === true) return true;
    // Un fallo de fetch es siempre un TypeError (se comprueba también por nombre
    // para que funcione entre contextos distintos: ventana, worker o pruebas)
    if (e.name === 'TypeError') return true;
    if (typeof TypeError !== 'undefined' && e instanceof TypeError) return true;
    return RE_FALLO_RED.test(String(e.message || ''));
  }

  /**
   * Traduce cualquier fallo técnico a un mensaje claro y accionable.
   * El usuario nunca debe ver «NetworkError when attempting to fetch resource».
   */
  Sync.mensajeDeError = function (e) {
    var bruto = (e && e.message) ? String(e.message) : '';
    if (e && (e.name === 'AbortError' || e.timeout)) {
      return 'El servicio de sincronización no respondió a tiempo. La información quedó guardada en este equipo y se reintentará automáticamente.';
    }
    if (!hayRed()) {
      return 'Este dispositivo está sin conexión a Internet. La información quedó guardada y se enviará automáticamente cuando vuelva la conexión.';
    }
    if (esFalloDeRed(e)) {
      return 'No se pudo contactar el servicio de sincronización desde este equipo. Suele deberse a falta de Internet, a una red que bloquea la conexión (por ejemplo, la red de una oficina o un filtro de contenido) o a un bloqueador de contenido del navegador. La información está guardada y se enviará automáticamente; use «Probar conexión» para ver el detalle.';
    }
    return bruto || 'No fue posible sincronizar.';
  };

  // Tiempos de espera y de reintento (ajustables; las pruebas los reducen)
  Sync.tiempoLimite = 25000;            // ms para considerar que el servicio no responde
  Sync.esperasReintento = [0, 2500, 6000];   // esperas entre intentos ante fallos de conexión

  /** Ejecuta una operación de red con tiempo límite y clasifica el fallo */
  function conRed(accion, ms) {
    var limite = ms || Sync.tiempoLimite;
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var reloj;
    // El tiempo límite se aplica SIEMPRE. Si el navegador soporta la cancelación
    // de peticiones, además se aborta la llamada para no dejarla colgada.
    var porTiempo = new Promise(function (_, rej) {
      reloj = setTimeout(function () {
        if (ctrl) { try { ctrl.abort(); } catch (err) {} }
        var t = new Error('Tiempo de espera agotado');
        t.timeout = true;
        rej(t);
      }, limite);
    });
    return Promise.race([
      Promise.resolve().then(function () { return accion(ctrl ? ctrl.signal : undefined); }),
      porTiempo
    ])
      .then(function (r) { clearTimeout(reloj); return r; })
      .catch(function (e) {
        clearTimeout(reloj);
        if (esFalloDeRed(e)) {
          var fallo = new Error(Sync.mensajeDeError(e));
          fallo.red = true;
          fallo.timeout = !!(e && (e.name === 'AbortError' || e.timeout));
          throw fallo;
        }
        throw e;   // errores del servicio (credenciales, repositorio, etc.) se informan tal cual
      });
  }

  /** Reintenta una operación ante fallos de conexión, sin repetir errores del servicio */
  function reintentar(accion, esperas) {
    esperas = esperas || Sync.esperasReintento;
    var intentos = 0;
    function paso() {
      intentos += 1;
      return conRed(accion).catch(function (e) {
        if (!esFalloDeRed(e) || intentos >= esperas.length) throw e;
        Sync.fijarEstado('sincronizando', 'Sin respuesta del servicio. Reintentando (' + intentos + '/' + (esperas.length - 1) + ')…');
        return new Promise(function (res) { setTimeout(res, esperas[intentos]); }).then(paso);
      });
    }
    return paso();
  }

  /** Tras un fallo de conexión, se reintenta solo en unos segundos */
  var relojReintento = null;
  function programarReintento(ms) {
    if (relojReintento || !Sync.configurado()) return;
    relojReintento = setTimeout(function () {
      relojReintento = null;
      if (hayRed()) Sync.sincronizar({ silencioso: true });
    }, ms || 20000);
  }

  /* ---------- Sincronización ---------- */
  Sync.sincronizar = function (opciones) {
    opciones = opciones || {};
    if (Sync.enCurso) return Promise.resolve({ ok: false, mensaje: 'Ya hay una sincronización en curso' });

    if (!Sync.configurado()) {
      Sync.fijarEstado('solo-local', 'Sincronización no configurada (Configuración → Sincronización)');
      if (opciones.manual) U.toast('La sincronización aún no está configurada', 'warn');
      return Promise.resolve({ ok: false, mensaje: 'Sin configurar' });
    }
    if (!hayRed()) {
      Sync.fijarEstado('sin-conexion', 'Operando sin conexión. Los cambios se guardarán y enviarán al recuperar Internet.');
      if (opciones.manual) U.toast('Sin conexión a Internet. Los cambios quedaron guardados y se enviarán solos.', 'warn');
      programarReintento(15000);
      return Promise.resolve({ ok: false, mensaje: Sync.mensajeDeError(null) });
    }

    var prov = Sync.proveedor();
    Sync.enCurso = true;
    Sync.fijarEstado('sincronizando', opciones.manual ? 'Sincronización manual en curso…' : 'Sincronización automática en curso…');

    var resultado = { ok: false, subidos: 0, bajados: 0, conflictos: 0, mensaje: '' };

    return Promise.resolve()
      .then(function () { return reintentar(function (s) { return prov.descargar(s); }); })
      .then(function (remoto) {
        if (remoto && remoto.colecciones) {
          return Sync.mezclar(remoto.colecciones).then(function (r) {
            resultado.bajados = r.bajados;
            resultado.conflictos = r.conflictos;
          });
        }
      })
      .then(function () { return CSN.store.recargar(); })
      .then(function () {
        var porSubir = CSN.store.pendientes().pendientes;
        resultado.subidos = porSubir;
        // Sin cambios propios ni recibidos no hay nada que publicar
        if (!porSubir && !resultado.bajados) return { sinCambios: true };
        var paquete = Sync.armarPaquete({ soloCambios: prov.snapshot === false });
        return reintentar(function (s) { return prov.subir(paquete, s); }).then(function (r) { return r || {}; });
      })
      .then(function () {
        return CSN.store.marcarSincronizados();
      })
      .then(function () {
        return CSN.store.recargar();
      })
      .then(function () {
        resultado.ok = true;
        resultado.mensaje = resultado.subidos || resultado.bajados
          ? 'Enviados: ' + resultado.subidos + ' · Recibidos: ' + resultado.bajados + (resultado.conflictos ? ' · Conflictos: ' + resultado.conflictos : '')
          : 'Todo estaba actualizado';
        Sync.fijarEstado('sincronizado', 'Última sincronización: ' + U.marca() + ' — ' + resultado.mensaje);
        CSN.store.guardarConfigLocal({ ultimaSync: U.marca(), ultimaSyncEstado: 'ok' });
        if (opciones.manual) U.toast(resultado.mensaje, resultado.conflictos ? 'warn' : 'ok');
        Sync.ultimoResultado = resultado;
        return resultado;
      })
      .catch(function (e) {
        var msg = Sync.mensajeDeError(e);
        var esRed = esFalloDeRed(e);
        resultado.ok = false;
        resultado.mensaje = msg;
        resultado.red = esRed;
        Sync.fijarEstado(esRed && !hayRed() ? 'sin-conexion' : 'error', msg);
        CSN.store.guardarConfigLocal({ ultimaSync: U.marca(), ultimaSyncEstado: 'error: ' + msg });
        if (opciones.manual) U.toast(msg, esRed ? 'warn' : 'err');
        // Ante un problema de conexión se reintenta solo, sin intervención del usuario
        if (esRed) programarReintento(hayRed() ? 20000 : 15000);
        Sync.ultimoResultado = resultado;
        return resultado;
      })
      .then(function (r) {
        Sync.enCurso = false;
        Sync.emitirEstado();
        return r;
      });
  };

  /** Envío diferido tras un cambio local (evita saturar la red) */
  Sync.avisarCambioLocal = function () {
    if (!Sync.configurado() || !cfg().syncAuto) return;
    clearTimeout(temporizadorPush);
    temporizadorPush = setTimeout(function () {
      if (hayRed()) Sync.sincronizar({ silencioso: true });
    }, 4000);
  };

  /* ---------- Inicio / detención ---------- */
  /** @param opciones.inmediato  false → sólo programa la sincronización periódica
   *   (se usa cuando el llamador va a sincronizar de inmediato y necesita el resultado) */
  Sync.iniciar = function (opciones) {
    opciones = opciones || {};
    Sync.detener();
    if (!hayRed()) Sync.fijarEstado('sin-conexion', 'Sin conexión a Internet');
    else if (!Sync.configurado()) Sync.fijarEstado('solo-local', 'Sincronización no configurada (Configuración → Sincronización)');
    else Sync.fijarEstado(CSN.store.pendientes().pendientes ? 'sin-conexion' : 'sincronizado', 'Listo para sincronizar');

    var seg = Math.max(10, +cfg().syncIntervalo || 20);
    temporizador = setInterval(function () {
      if (!cfg().syncAuto) return;
      if (!hayRed()) { Sync.fijarEstado('sin-conexion'); return; }
      Sync.sincronizar({ silencioso: true });
    }, seg * 1000);

    if (opciones.inmediato !== false && hayRed() && Sync.configurado()) Sync.sincronizar({ silencioso: true });
    return Sync;
  };

  Sync.detener = function () {
    if (temporizador) { clearInterval(temporizador); temporizador = null; }
    clearTimeout(temporizadorPush);
    if (relojReintento) { clearTimeout(relojReintento); relojReintento = null; }
  };

  /* ---------- Vinculación de dispositivos con un solo código ---------- */
  /**
   * Genera un código que lleva la configuración de sincronización (método,
   * repositorio, credencial y clave de cifrado) para dejar listo otro
   * dispositivo —el celular— pegándolo una sola vez.
   * El código contiene credenciales: debe compartirse por un medio seguro.
   */
  Sync.generarCodigoVinculacion = function () {
    if (!Sync.configurado()) {
      return Promise.reject(new Error('Primero complete y guarde la configuración de sincronización en este dispositivo.'));
    }
    var c = cfg();
    var paquete = { v: 1, m: c.syncModo, fecha: U.marca() };
    if (c.syncModo === 'gist') {
      paquete.g = c.gistId || '';
      paquete.t = c.gistToken || '';
      paquete.k = c.syncClave || '';
      if (!paquete.g) return Promise.reject(new Error('Aún no se ha creado el repositorio de datos. Pulse «Crear repositorio de datos».'));
    } else if (c.syncModo === 'supabase') {
      paquete.u = c.supabaseUrl || '';
      paquete.a = c.supabaseKey || '';
      paquete.tb = c.supabaseTabla || 'csn_registros';
      paquete.e = c.supabaseEmail || '';
      paquete.p = c.supabasePassword || '';
    }
    return CSN.crypto.sha256(JSON.stringify(paquete)).then(function (huella) {
      paquete.h = huella.slice(0, 8);   // comprobación de integridad del código
      return 'CSNV1-' + U.b64url(JSON.stringify(paquete));
    });
  };

  /** Aplica en este dispositivo el código generado en otro */
  Sync.aplicarCodigoVinculacion = function (codigo) {
    var texto = String(codigo || '').trim().replace(/\s+/g, '');
    if (!texto) return Promise.reject(new Error('Pegue el código de vinculación generado en el otro dispositivo.'));
    if (texto.indexOf('CSNV1-') !== 0) {
      return Promise.reject(new Error('El código no corresponde a esta aplicación. Debe comenzar con «CSNV1-».'));
    }
    var paquete;
    try { paquete = JSON.parse(U.deb64url(texto.slice(6))); }
    catch (e) { return Promise.reject(new Error('El código está incompleto o fue alterado. Cópielo nuevamente completo.')); }

    var esperado = paquete.h;
    delete paquete.h;
    return CSN.crypto.sha256(JSON.stringify(paquete)).then(function (huella) {
      if (huella.slice(0, 8) !== esperado) {
        throw new Error('El código está incompleto o fue alterado. Cópielo nuevamente completo.');
      }
      var datos = { syncModo: paquete.m };
      if (paquete.m === 'gist') {
        if (!paquete.g || !paquete.t || !paquete.k) throw new Error('El código no contiene los datos necesarios del repositorio.');
        datos.gistId = paquete.g; datos.gistToken = paquete.t; datos.syncClave = paquete.k;
      } else if (paquete.m === 'supabase') {
        if (!paquete.u || !paquete.a) throw new Error('El código no contiene los datos de conexión de la base de datos.');
        datos.supabaseUrl = paquete.u; datos.supabaseKey = paquete.a;
        datos.supabaseTabla = paquete.tb || 'csn_registros';
        datos.supabaseEmail = paquete.e || '';
        datos.supabasePassword = paquete.p || '';
      } else {
        throw new Error('El código no indica un método de sincronización válido.');
      }
      return CSN.store.guardarConfig(datos).then(function () {
        // Se programa la sincronización automática sin lanzarla de inmediato:
        // así la primera sincronización de este dispositivo es la que informa
        // cuántos registros se recibieron al vincular.
        Sync.detener();
        Sync.iniciar({ inmediato: false });
        return Sync.esperarLibre();
      }).then(function () {
        return Sync.sincronizar({ manual: true });
      }).then(function (r) {
        return { metodo: paquete.m, resultado: r };
      });
    });
  };

  /* ---------- Prueba de conexión ---------- */
  Sync.probar = function () {
    if (!Sync.configurado()) return Promise.reject(new Error('Complete los datos de conexión antes de probar.'));
    if (!hayRed()) return Promise.reject(new Error('El dispositivo no tiene conexión a Internet.'));
    var prov = Sync.proveedor();
    Sync.fijarEstado('sincronizando', 'Verificando conexión…');
    return conRed(function (s) { return prov.probar(s); }, 20000).then(function (info) {
      Sync.fijarEstado(Sync.configurado() ? 'sincronizado' : 'solo-local', 'Conexión verificada');
      return info;
    }).catch(function (e) {
      Sync.fijarEstado('error', e.message);
      throw e;
    });
  };

  /* ---------- Escuchas de conectividad ---------- */
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('online', function () {
      U.toast('Conexión restablecida — sincronizando…', 'ok');
      var b = U.$('#offline-banner'); if (b) b.classList.add('hidden');
      if (Sync.configurado()) Sync.sincronizar({ silencioso: true }); else Sync.fijarEstado('solo-local');
      Sync.emitirEstado();
    });
    global.addEventListener('offline', function () {
      var b = U.$('#offline-banner'); if (b) b.classList.remove('hidden');
      Sync.fijarEstado('sin-conexion', 'Sin conexión. Puede seguir trabajando; los cambios se enviarán automáticamente.');
    });
    global.addEventListener('focus', function () {
      if (hayRed() && Sync.configurado() && cfg().syncAuto) Sync.sincronizar({ silencioso: true });
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && hayRed() && Sync.configurado() && cfg().syncAuto) Sync.sincronizar({ silencioso: true });
    });
  }

  // Cada cambio local (guardado por el usuario) programa un envío
  CSN.store.on('cambio', function () { Sync.avisarCambioLocal(); });
  CSN.store.on('conflicto', function () { Sync.emitirEstado(); });
})(typeof window !== 'undefined' ? window : globalThis);
