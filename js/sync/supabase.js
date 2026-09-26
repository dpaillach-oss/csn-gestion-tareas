/* ==========================================================================
   sync/supabase.js – Sincronización con base de datos en la nube (Supabase)
   Alternativa recomendada para uso intensivo (muchas fotografías y documentos).
   · Tabla única de registros: id, coleccion, datos (jsonb), ts, actualizado
   · Autenticación opcional con correo y contraseña (Supabase Auth)
   · Sincronización incremental: primero se comparan las marcas de tiempo y
     sólo se descarga el contenido de los registros que cambiaron.
   API: CSN.syncSupabase.descargar() / subir(paquete) / probar()
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util;

  function conf() { return CSN.store.config(); }
  function tabla() { return conf().supabaseTabla || 'csn_registros'; }
  function base() {
    var u = String(conf().supabaseUrl || '').trim().replace(/\/+$/, '');
    if (!u) throw new Error('Falta la dirección del proyecto de Supabase.');
    if (!/^https:\/\//.test(u) && !/^http:\/\/localhost/.test(u)) {
      throw new Error('La dirección del proyecto debe comenzar con https://');
    }
    return u;
  }
  function clave() {
    var k = String(conf().supabaseKey || '').trim();
    if (!k) throw new Error('Falta la clave pública (anon key) de Supabase.');
    return k;
  }

  var sesion = null;
  function cargarSesion() {
    if (sesion) return sesion;
    try {
      var raw = global.localStorage.getItem('csn.sb.sesion');
      if (raw) sesion = JSON.parse(raw);
    } catch (e) {}
    return sesion;
  }
  function guardarSesion(s) {
    sesion = s;
    try {
      if (s) global.localStorage.setItem('csn.sb.sesion', JSON.stringify(s));
      else global.localStorage.removeItem('csn.sb.sesion');
    } catch (e) {}
  }

  /** Inicia sesión en Supabase Auth si hay credenciales configuradas */
  function autenticar(forzar) {
    var c = conf();
    if (!c.supabaseEmail || !c.supabasePassword) return Promise.resolve(null);
    var s = cargarSesion();
    if (s && s.access_token && s.expira > Date.now() + 60000 && !forzar) return Promise.resolve(s);
    return fetch(base() + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': clave(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: c.supabaseEmail, password: c.supabasePassword })
    }).then(function (r) {
      if (r.status === 400) throw new Error('Correo o contraseña de Supabase incorrectos.');
      if (!r.ok) throw new Error('No fue posible autenticar en Supabase (' + r.status + ')');
      return r.json();
    }).then(function (j) {
      var nueva = { access_token: j.access_token, refresh_token: j.refresh_token, expira: Date.now() + ((j.expires_in || 3600) * 1000) };
      guardarSesion(nueva);
      return nueva;
    });
  }

  function cabeceras(extra) {
    var h = {
      'apikey': clave(),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    var s = cargarSesion();
    h['Authorization'] = 'Bearer ' + ((s && s.access_token) ? s.access_token : clave());
    return Object.assign(h, extra || {});
  }

  function pedir(metodo, url, cuerpo, extra) {
    return autenticar().then(function () {
      var opts = { method: metodo, headers: cabeceras(extra), cache: 'no-store' };
      if (cuerpo) opts.body = JSON.stringify(cuerpo);
      return fetch(url, opts);
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) {
        return r.text().then(function (t) {
          throw new Error('Acceso denegado por Supabase (' + r.status + '). Verifique la clave y las políticas de la tabla. ' + corto(t));
        });
      }
      if (r.status === 404) throw new Error('No se encontró la tabla "' + tabla() + '" (404). Ejecute el script SQL en su proyecto.');
      if (r.status === 400 || r.status === 406) {
        return r.text().then(function (t) { throw new Error('Supabase rechazó la solicitud (' + r.status + '). ' + corto(t)); });
      }
      if (!r.ok && r.status !== 201 && r.status !== 204) {
        return r.text().then(function (t) { throw new Error('Error de Supabase (' + r.status + '). ' + corto(t)); });
      }
      if (r.status === 204) return null;
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }
  function corto(t) { return String(t || '').slice(0, 220); }

  var Supa = CSN.syncSupabase = {
    nombre: 'Base de datos en la nube (Supabase)',
    id: 'supabase',
    // Base de datos por registros: cada fila se guarda por separado, por lo que
    // basta con enviar los registros que cambiaron (modo incremental).
    snapshot: false,

    /** Comprueba la conexión y la existencia de la tabla */
    probar: function () {
      return pedir('GET', base() + '/rest/v1/' + tabla() + '?select=id&limit=1').then(function (r) {
        return { tabla: tabla(), accesible: true, registros: (r || []).length };
      });
    },

    /**
     * Descarga los cambios remotos comparando marcas de tiempo.
     * Devuelve un paquete {colecciones:{...}} o null si no hay cambios.
     */
    descargar: function () {
      var PAGINA = 1000;
      var indice = [];
      function traer(desde) {
        return pedir('GET', base() + '/rest/v1/' + tabla() + '?select=id,coleccion,ts&order=id.asc',
          null, { 'Range': desde + '-' + (desde + PAGINA - 1) }).then(function (filas) {
            filas = filas || [];
            indice = indice.concat(filas);
            if (filas.length === PAGINA) return traer(desde + PAGINA);
            return indice;
          });
      }
      return traer(0).then(function () {
        var crudo = CSN.store.crudo();
        var locales = {};
        Sync_COLECCIONES().forEach(function (col) {
          (crudo[col] || []).forEach(function (r) { locales[r.id] = r; });
        });
        var necesidad = indice.filter(function (f) {
          var l = locales[f.id];
          return !l || (f.ts || 0) > (l._ts || 0);
        });
        if (!necesidad.length) return null;

        var ids = necesidad.map(function (f) { return f.id; });
        var completa = [];
        var LOTE = 150;
        function traerLote(i) {
          var parte = ids.slice(i, i + LOTE);
          if (!parte.length) return Promise.resolve(completa);
          var filtro = '(' + parte.map(encodeURIComponent).join(',') + ')';
          return pedir('GET', base() + '/rest/v1/' + tabla() + '?select=id,coleccion,datos&id=in.' + filtro)
            .then(function (filas) {
              completa = completa.concat(filas || []);
              return traerLote(i + LOTE);
            });
        }
        return traerLote(0);
      }).then(function (filas) {
        if (!filas || !filas.length) return null;
        var paquete = { colecciones: {} };
        filas.forEach(function (f) {
          if (!f || !f.coleccion || !f.datos) return;
          (paquete.colecciones[f.coleccion] = paquete.colecciones[f.coleccion] || []).push(f.datos);
        });
        return paquete;
      });
    },

    /** Sube (inserta o actualiza) los registros modificados */
    subir: function (paquete) {
      var filas = [];
      Object.keys(paquete.colecciones || {}).forEach(function (col) {
        paquete.colecciones[col].forEach(function (r) {
          filas.push({ id: r.id, coleccion: col, datos: r, ts: r._ts || U.ms(), actualizado: new Date().toISOString() });
        });
      });
      if (!filas.length) return Promise.resolve({ ok: true, subidos: 0 });

      var LOTE = 40; // lotes pequeños: las fotografías pueden pesar varios cientos de KB
      var enviados = 0;
      function enviar(i) {
        var parte = filas.slice(i, i + LOTE);
        if (!parte.length) return Promise.resolve(enviados);
        return pedir('POST', base() + '/rest/v1/' + tabla(), parte,
          { 'Prefer': 'resolution=merge-duplicates,return=minimal' })
          .then(function () { enviados += parte.length; return enviar(i + LOTE); });
      }
      return enviar(0).then(function (n) { return { ok: true, subidos: n }; });
    },

    /** Cierra la sesión de Supabase guardada en este dispositivo */
    cerrarSesion: function () { guardarSesion(null); return Promise.resolve(true); }
  };

  function Sync_COLECCIONES() { return CSN.sync.COLECCIONES; }
})(typeof window !== 'undefined' ? window : globalThis);
