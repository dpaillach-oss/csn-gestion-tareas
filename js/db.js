/* ==========================================================================
   db.js – Capa de persistencia local
   Motor principal: IndexedDB (permite fotografías y documentos de gran tamaño)
   Respaldo automático: localStorage (entornos sin IndexedDB o en pruebas)
   API: CSN.db.get/put/del/all/bulkPut/clear  (todas devuelven Promesas)
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util;

  var STORES = ['comunidades', 'tareas', 'avances', 'archivos', 'usuarios', 'historial',
    'config', 'conflictos', 'bitacora'];
  var DB_NAME = 'csn_gestion_tareas';
  var VERSION = 1;

  var modo = 'memoria';       // 'idb' | 'local' | 'memoria'
  var _db = null;             // instancia IndexedDB
  var _mem = {};              // almacén en memoria (respaldo final)

  function lsKey(store) { return 'csn.db.' + store; }

  /* ---------- IndexedDB ---------- */
  function abrirIDB() {
    return new Promise(function (res, rej) {
      if (!global.indexedDB) return rej(new Error('IndexedDB no disponible'));
      var req;
      try { req = global.indexedDB.open(DB_NAME, VERSION); } catch (e) { return rej(e); }
      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        STORES.forEach(function (s) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        });
      };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error || new Error('Error al abrir IndexedDB')); };
      req.onblocked = function () { rej(new Error('IndexedDB bloqueada por otra ventana')); };
      setTimeout(function () { rej(new Error('Tiempo de espera agotado abriendo IndexedDB')); }, 6000);
    });
  }

  function tx(store, modo2, fn) {
    return new Promise(function (res, rej) {
      var t = _db.transaction(store, modo2);
      var os = t.objectStore(store);
      var out;
      try { out = fn(os); } catch (e) { return rej(e); }
      t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
      t.onerror = function () { rej(t.error); };
      t.onabort = function () { rej(t.error || new Error('Transacción abortada')); };
    });
  }

  /* ---------- Respaldo localStorage ---------- */
  function lsLeer(store) {
    try {
      var raw = global.localStorage.getItem(lsKey(store));
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return _mem[store] || {}; }
  }
  function lsEscribir(store, obj) {
    try { global.localStorage.setItem(lsKey(store), JSON.stringify(obj)); }
    catch (e) { _mem[store] = obj; modo = 'memoria'; }
    return obj;
  }

  var DB = CSN.db = {
    get modo() { return modo; },
    get stores() { return STORES.slice(); },

    iniciar: function () {
      return abrirIDB().then(function (db) {
        _db = db; modo = 'idb';
        return modo;
      }).catch(function () {
        // Respaldo: localStorage
        try {
          global.localStorage.setItem('csn.probe', '1');
          global.localStorage.removeItem('csn.probe');
          modo = 'local';
        } catch (e) { modo = 'memoria'; }
        return modo;
      });
    },

    get: function (store, id) {
      if (modo === 'idb') return tx(store, 'readonly', function (os) { return os.get(id); });
      var o = (modo === 'local' ? lsLeer(store) : (_mem[store] || {}));
      return Promise.resolve(o[id] || null);
    },

    all: function (store) {
      if (modo === 'idb') {
        return tx(store, 'readonly', function (os) { return os.getAll(); }).then(function (r) { return r || []; });
      }
      var o = (modo === 'local' ? lsLeer(store) : (_mem[store] || {}));
      return Promise.resolve(Object.keys(o).map(function (k) { return o[k]; }));
    },

    put: function (store, obj) {
      if (!obj || !obj.id) return Promise.reject(new Error('Registro sin id en ' + store));
      if (modo === 'idb') return tx(store, 'readwrite', function (os) { os.put(obj); return obj; });
      var o = (modo === 'local' ? lsLeer(store) : (_mem[store] = _mem[store] || {}));
      o[obj.id] = obj;
      if (modo === 'local') lsEscribir(store, o); else _mem[store] = o;
      return Promise.resolve(obj);
    },

    bulkPut: function (store, arr) {
      arr = arr || [];
      if (!arr.length) return Promise.resolve(0);
      if (modo === 'idb') {
        return tx(store, 'readwrite', function (os) {
          arr.forEach(function (o) { if (o && o.id) os.put(o); });
          return arr.length;
        });
      }
      var o = (modo === 'local' ? lsLeer(store) : (_mem[store] = _mem[store] || {}));
      arr.forEach(function (it) { if (it && it.id) o[it.id] = it; });
      if (modo === 'local') lsEscribir(store, o); else _mem[store] = o;
      return Promise.resolve(arr.length);
    },

    del: function (store, id) {
      if (modo === 'idb') return tx(store, 'readwrite', function (os) { os.delete(id); return true; });
      var o = (modo === 'local' ? lsLeer(store) : (_mem[store] = _mem[store] || {}));
      delete o[id];
      if (modo === 'local') lsEscribir(store, o); else _mem[store] = o;
      return Promise.resolve(true);
    },

    /** Borra físicamente registros marcados como eliminados (_deleted) con antigüedad > días */
    purgar: function (diaLimite) {
      var stores = ['comunidades', 'tareas', 'avances', 'archivos', 'historial'];
      return Promise.all(stores.map(function (s) {
        return DB.all(s).then(function (arr) {
          var borrar = arr.filter(function (r) { return r._deleted && (!r._ts || r._ts < diaLimite); });
          return Promise.all(borrar.map(function (r) { return DB.del(s, r.id); })).then(function () { return borrar.length; });
        });
      })).then(function (rs) { return rs.reduce(function (a, b) { return a + b; }, 0); });
    },

    clear: function (store) {
      if (modo === 'idb') return tx(store, 'readwrite', function (os) { os.clear(); return true; });
      if (modo === 'local') { try { global.localStorage.removeItem(lsKey(store)); } catch (e) {} }
      _mem[store] = {};
      return Promise.resolve(true);
    },

    borrarTodo: function () {
      return Promise.all(STORES.map(function (s) { return DB.clear(s); })).then(function () { return true; });
    },

    /** Volcado completo (respaldo / sincronización) */
    volcar: function () {
      var out = {};
      return STORES.reduce(function (p, s) {
        return p.then(function () {
          return DB.all(s).then(function (arr) { out[s] = arr; });
        });
      }, Promise.resolve()).then(function () { return out; });
    },

    restaurar: function (volcado) {
      var keys = Object.keys(volcado || {});
      return keys.reduce(function (p, s) {
        if (STORES.indexOf(s) < 0) return p;
        return p.then(function () { return DB.clear(s).then(function () { return DB.bulkPut(s, volcado[s]); }); });
      }, Promise.resolve()).then(function () { return true; });
    },

    /** Estimación de uso de almacenamiento */
    uso: function () {
      if (global.navigator && navigator.storage && navigator.storage.estimate) {
        return navigator.storage.estimate().then(function (e) {
          return { usado: e.usage || 0, cuota: e.quota || 0 };
        }).catch(function () { return { usado: 0, cuota: 0 }; });
      }
      return Promise.resolve({ usado: 0, cuota: 0 });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
