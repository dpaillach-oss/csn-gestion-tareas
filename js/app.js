/* ==========================================================================
   app.js – Núcleo de la aplicación
   Menú, enrutador, sesión, identidad corporativa, indicadores del menú,
   arranque de la PWA y del sincronizador.
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util, M = CSN.model, UI = CSN.ui;

  var MENU = [
    { id: 'dashboard', t: 'Dashboard', ico: '📊', grupo: 'Principal' },
    { id: 'comunidades', t: 'Comunidades', ico: '🏢', grupo: 'Principal', contador: 'comunidades' },
    { id: 'tareas', t: 'Tareas', ico: '📋', grupo: 'Principal', contador: 'abiertas' },
    { id: 'calendario', t: 'Calendario', ico: '📅', grupo: 'Principal' },
    { id: 'pendientes', t: 'Pendientes', ico: '🕓', grupo: 'Seguimiento', contador: 'pendientes' },
    { id: 'vencidas', t: 'Vencidas', ico: '🔴', grupo: 'Seguimiento', contador: 'vencidas', alerta: true },
    { id: 'informes', t: 'Informes', ico: '📈', grupo: 'Seguimiento' },
    { id: 'buscar', t: 'Buscar', ico: '🔎', grupo: 'Seguimiento' },
    { id: 'usuarios', t: 'Usuarios', ico: '👥', grupo: 'Sistema', soloAdmin: true },
    { id: 'configuracion', t: 'Configuración', ico: '⚙️', grupo: 'Sistema' }
  ];
  var NAV_MOVIL = ['dashboard', 'tareas', 'calendario', 'buscar', 'vencidas'];

  var App = CSN.app = {
    VERSION: '1.0.1',
    ruta: 'dashboard',
    params: {},
    listo: false,
    promptInstalacion: null
  };

  /* ---------- Identidad corporativa ---------- */
  App.aplicarColores = function (principal, secundario, soloVistaPrevia) {
    var raiz = document.documentElement.style;
    if (principal) raiz.setProperty('--c-primary', principal);
    if (secundario) raiz.setProperty('--c-accent', secundario);
    if (!soloVistaPrevia) return;
  };

  App.aplicarIdentidad = function () {
    var c = CSN.store.config();
    App.aplicarColores(c.colorPrincipal, c.colorSecundario);
    var l1 = U.$('#brand-l1'), l2 = U.$('#brand-l2');
    if (l1) l1.textContent = c.nombreApp || 'GESTIÓN DE TAREAS';
    if (l2) l2.textContent = c.empresa || '';
    ['header-logo', 'login-logo'].forEach(function (id) {
      var el = U.$('#' + id);
      if (el) el.src = c.logo || 'assets/logo.png';
    });
    var side = U.$('#side-logo');
    if (side && c.logo) side.src = c.logo;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', c.colorPrincipal || '#003090');
    document.title = (c.nombreApp || 'GESTIÓN DE TAREAS') + ' – ' + (c.empresa || 'CSN');
  };

  /* ---------- Menú ---------- */
  function contadores() {
    var conf = CSN.store.config();
    var tareas = CSN.store.todas('tareas');
    var abiertas = tareas.filter(function (t) { return !M.esCerrada(t.estado); });
    return {
      comunidades: CSN.store.comunidades().length,
      abiertas: abiertas.length,
      pendientes: tareas.filter(function (t) { return t.estado === 'Pendiente' || t.estado === 'Vencida'; }).length,
      vencidas: tareas.filter(function (t) { return M.semaforo(t, conf).color === 'rojo'; }).length
    };
  }

  App.pintarMenu = function () {
    var c = contadores();
    var esAdmin = CSN.store.nivel() >= 3;
    var nav = U.$('#nav');
    var html = '', grupoActual = null;
    MENU.forEach(function (m) {
      if (m.soloAdmin && !esAdmin) return;
      if (m.grupo !== grupoActual) {
        html += '<div class="nav-sep">' + U.escapeHtml(m.grupo) + '</div>';
        grupoActual = m.grupo;
      }
      var n = m.contador ? (c[m.contador] || 0) : 0;
      html += '<button class="nav-item' + (App.ruta === m.id ? ' active' : '') + '" data-ir="' + m.id + '">' +
        '<span class="ico">' + m.ico + '</span>' + U.escapeHtml(m.t) +
        (n ? '<span class="count' + (m.alerta && n > 0 ? ' alert' : '') + '">' + n + '</span>' : '') + '</button>';
    });
    nav.innerHTML = html;

    // Navegación inferior (teléfono)
    var bn = U.$('#bottom-nav');
    bn.innerHTML = NAV_MOVIL.map(function (id) {
      var m = MENU.filter(function (x) { return x.id === id; })[0];
      var n = m.contador ? (c[m.contador] || 0) : 0;
      return '<button class="' + (App.ruta === id ? 'active' : '') + '" data-ir="' + id + '">' +
        (n && m.alerta ? '<span class="bn-count">' + n + '</span>' : '') +
        '<span class="ico">' + m.ico + '</span>' + U.escapeHtml(m.t) + '</button>';
    }).join('') +
      '<button data-menu-mas="1"><span class="ico">☰</span>Más</button>';

    var chip = U.$('#user-name');
    if (chip) {
      var s = CSN.store.sesion() || {};
      chip.textContent = s.nombre || '';
    }
    var av = U.$('#user-avatar');
    if (av) av.textContent = U.iniciales((CSN.store.sesion() || {}).nombre);
    var ver = U.$('#side-version');
    if (ver) ver.textContent = 'Versión ' + App.VERSION + ' · ' + CSN.db.modo.toUpperCase() + ' · ' + U.deviceId();
  };

  /* ---------- Enrutador ---------- */
  App.ir = function (ruta, params, sinHash) {
    App.ruta = ruta || 'dashboard';
    App.params = params || {};
    var query = Object.keys(App.params).filter(function (k) { return App.params[k] !== undefined && App.params[k] !== null && App.params[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(App.params[k]); }).join('&');
    if (!sinHash) {
      var hash = '#/' + App.ruta + (query ? '?' + query : '');
      if (global.location.hash !== hash) {
        global.location.hash = hash;
        return; // hashchange dispara el render
      }
    }
    App.render();
  };

  App.leerHash = function () {
    var h = String(global.location.hash || '').replace(/^#\/?/, '');
    if (!h) return { ruta: 'dashboard', params: {} };
    var partes = h.split('?');
    var params = {};
    (partes[1] || '').split('&').filter(Boolean).forEach(function (p) {
      var kv = p.split('=');
      params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return { ruta: partes[0] || 'dashboard', params: params };
  };

  App.recargar = function () { App.render(); };

  App.render = function () {
    if (!CSN.store.sesion()) { App.mostrarLogin(); return; }
    var cont = U.$('#view-root');
    var ruta = App.ruta, params = App.params;
    try {
      switch (ruta) {
        case 'dashboard': V().dashboard.render(cont); break;
        case 'comunidades': V().comunidades.render(cont, params); break;
        case 'comunidad': V().comunidades.renderPanel(cont, params); break;
        case 'tareas': V().tareas.render(cont, params); break;
        case 'pendientes': V().tareas.render(cont, Object.assign({ titulo: 'TAREAS PENDIENTES', abiertas: true }, params)); break;
        case 'vencidas': V().tareas.render(cont, Object.assign({ titulo: 'TAREAS VENCIDAS', vencidas: true }, params)); break;
        case 'calendario': V().calendario.render(cont, params); break;
        case 'informes': V().informes.render(cont, params); break;
        case 'buscar': V().buscar.render(cont, params); break;
        case 'usuarios': V().usuarios.render(cont); break;
        case 'configuracion': V().config.render(cont, params); break;
        default: V().dashboard.render(cont);
      }
    } catch (e) {
      console.error(e);
      cont.innerHTML = '<div class="alert-box alert-danger"><b>Ocurrió un error al mostrar esta sección.</b><br>' +
        U.escapeHtml(e.message) + '</div>' +
        '<div class="btn-group mt"><button class="btn btn-primary" data-ir="dashboard">Volver al panel</button></div>';
    }
    App.pintarMenu();
    global.scrollTo(0, 0);
  };
  function V() { return CSN.views; }

  /* ---------- Sesión ---------- */
  App.mostrarLogin = function () {
    U.$('#login-screen').classList.remove('hidden');
    U.$('#app-shell').classList.add('hidden');
    App.pintarMenu();
  };
  App.mostrarApp = function () {
    U.$('#login-screen').classList.add('hidden');
    U.$('#app-shell').classList.remove('hidden');
    App.aplicarIdentidad();
    App.ir(App.ruta, App.params);
  };

  /* ---------- Delegación global de eventos ---------- */
  function delegar() {
    document.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-ir]');
      if (nav) {
        e.preventDefault();
        var valor = nav.getAttribute('data-ir');
        var partes = valor.split('?');
        var params = {};
        (partes[1] || '').split('&').filter(Boolean).forEach(function (p) {
          var kv = p.split('=');
          params[kv[0]] = kv[1] === undefined ? '1' : kv[1];
        });
        CSN.app.ir(partes[0], params);
        cerrarMenu();
        return;
      }
      var t = e.target.closest('[data-tarea]');
      if (t) {
        e.preventDefault();
        CSN.views.tareas.ficha(t.getAttribute('data-tarea'));
        return;
      }
      var mas = e.target.closest('[data-menu-mas]');
      if (mas) { abrirMenu(); return; }
    });
  }

  function abrirMenu() {
    var sb = U.$('#sidebar');
    sb.classList.add('open');
    if (!U.$('.scrim')) {
      var sc = document.createElement('div');
      sc.className = 'scrim';
      sc.onclick = cerrarMenu;
      document.body.appendChild(sc);
    }
  }
  function cerrarMenu() {
    var sb = U.$('#sidebar');
    if (sb) sb.classList.remove('open');
    var sc = U.$('.scrim');
    if (sc) sc.remove();
  }
  App.abrirMenu = abrirMenu;
  App.cerrarMenu = cerrarMenu;

  /* ---------- PWA ---------- */
  function registrarSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return; // sin soporte al abrir el archivo directamente
    navigator.serviceWorker.register('sw.js').catch(function (e) {
      console.warn('No fue posible registrar el service worker:', e.message);
    });
  }

  App.instalar = function () {
    if (App.promptInstalacion) {
      App.promptInstalacion.prompt();
      App.promptInstalacion.userChoice.then(function (r) {
        if (r.outcome === 'accepted') U.toast('Aplicación instalada', 'ok');
        App.promptInstalacion = null;
      });
      return;
    }
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    U.Modal.aviso('Cómo instalar la aplicación',
      ios
        ? 'En iPhone/iPad: abra esta página en <b>Safari</b>, pulse el botón <b>Compartir</b> y seleccione <b>«Añadir a pantalla de inicio»</b>.'
        : 'En Chrome o Edge: abra el menú del navegador (⋮) y seleccione <b>«Instalar aplicación»</b> o <b>«Añadir a pantalla de inicio»</b>.',
      '📲');
  };

  /* ---------- Arranque ---------- */
  App.iniciar = function () {
    delegar();
    registrarSW();

    // Botones fijos de la interfaz
    var burger = U.$('#burger');
    if (burger) burger.onclick = abrirMenu;
    var sideClose = U.$('#side-close');
    if (sideClose) sideClose.onclick = cerrarMenu;
    var salir = U.$('#nav-logout');
    if (salir) {
      salir.onclick = function () {
        U.Modal.confirmar({ mensaje: '¿Cerrar la sesión actual?', textoOk: 'Cerrar sesión' }).then(function (ok) {
          if (!ok) return;
          CSN.store.salir();
          App.mostrarLogin();
          U.toast('Sesión cerrada', 'ok');
        });
      };
    }

    // Formulario de ingreso
    var form = U.$('#login-form');
    form.onsubmit = function (e) {
      e.preventDefault();
      var email = U.$('#login-email').value.trim();
      var clave = U.$('#login-password').value;
      var err = U.$('#login-error');
      var btn = U.$('#login-btn');
      err.classList.add('hidden');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Ingresando…';
      CSN.store.login(email, clave).then(function () {
        btn.disabled = false; btn.textContent = 'INGRESAR';
        App.mostrarApp();
        U.toast('Bienvenido/a ' + (CSN.store.sesion() || {}).nombre, 'ok');
      }).catch(function (ex) {
        btn.disabled = false; btn.textContent = 'INGRESAR';
        err.textContent = ex.message;
        err.classList.remove('hidden');
      });
    };
    var demo = U.$('#login-demo');
    if (demo) demo.onclick = function () {
      U.$('#login-email').value = 'admin@csn.cl';
      U.$('#login-password').value = 'csn2026';
    };

    // Inicio de la capa de datos
    U.$('#login-btn').disabled = true;
    CSN.store.iniciar().then(function () {
      App.aplicarIdentidad();
      App.pintarMenu();
      U.$('#login-btn').disabled = false;
      if (CSN.store.sesion()) App.mostrarApp();
      else {
        App.mostrarLogin();
        U.$('#login-sub').textContent = (CSN.store.config().empresa || '');
        if (!CC()) U.toast('Se cargaron datos de demostración: ATALAYA, LA ESPUELA y VISTA VERDE II', 'ok', 6000);
      }
      CSN.syncUI.iniciar();
      CSN.sync.iniciar();
      App.listo = true;

      // Revisión periódica de vencimientos y de la conexión
      setInterval(function () {
        CSN.store.marcarVencidas();
        if (!U.$('#offline-banner').classList.contains('hidden') && navigator.onLine) {
          U.$('#offline-banner').classList.add('hidden');
        }
      }, 120000);

      // Redibujo ante cambios de datos
      CSN.store.on('cambio', U.debounce(function () {
        if (CSN.store.sesion()) { App.pintarMenu(); }
      }, 400));
      CSN.store.on('sesion', function (u) { if (!u) App.mostrarLogin(); });
      if (!navigator.onLine) U.$('#offline-banner').classList.remove('hidden');
    }).catch(function (e) {
      console.error(e);
      U.Modal.aviso('Error al iniciar', 'No fue posible inicializar la base de datos local: ' + U.escapeHtml(e.message), '⚠️');
    });

    function CC() { return CSN.store.todas('comunidades').length > 0; }

    // Ruta inicial desde el hash
    var inicial = App.leerHash();
    App.ruta = inicial.ruta;
    App.params = inicial.params;
    global.addEventListener('hashchange', function () {
      var r = App.leerHash();
      App.ruta = r.ruta; App.params = r.params;
      App.render();
    });

    // Instalación de la PWA
    global.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      App.promptInstalacion = e;
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', App.iniciar);
  else App.iniciar();
})(typeof window !== 'undefined' ? window : globalThis);
