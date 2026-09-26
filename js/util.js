/* ==========================================================================
   util.js – Utilidades generales (fechas, DOM, modales, avisos, archivos)
   Espacio de nombres global: CSN.util
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util = {};

  /* ---------- Identificadores ---------- */
  var SEQ = 0;
  U.uid = function (prefix) {
    SEQ += 1;
    var t = Date.now().toString(36);
    var r = Math.random().toString(36).slice(2, 8);
    return (prefix ? prefix + '_' : '') + t + r + SEQ.toString(36);
  };
  U.deviceId = function () {
    var k = 'csn.deviceId';
    var v = null;
    try { v = localStorage.getItem(k); } catch (e) {}
    if (!v) {
      v = 'dev-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
      try { localStorage.setItem(k, v); } catch (e) {}
    }
    return v;
  };

  /* ---------- Fechas (todas las fechas de negocio son YYYY-MM-DD local) ---------- */
  U.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

  /** Fecha de hoy en formato YYYY-MM-DD (hora local del dispositivo). */
  U.hoy = function () {
    var d = new Date();
    return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
  };
  /** Fecha + hora actuales: { fecha:'YYYY-MM-DD', hora:'HH:MM', iso:'...' } */
  U.ahora = function (d) {
    d = d || new Date();
    var a = {
      fecha: d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate()),
      hora: U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes()),
      iso: d.toISOString()
    };
    a.marca = a.fecha + ' ' + a.hora;
    return a;
  };
  /**
   * Marca de tiempo en milisegundos, estrictamente creciente.
   * Garantiza que dos cambios ocurridos en el mismo milisegundo tengan un orden
   * determinista: es la base del historial y de la resolución de conflictos.
   */
  var _ultimoMs = 0;
  U.ms = function () {
    var t = Date.now();
    if (t <= _ultimoMs) t = _ultimoMs + 1;
    _ultimoMs = t;
    return t;
  };

  /** Convierte 'YYYY-MM-DD' o ISO a objeto Date local (medianoche). */
  U.aFecha = function (v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    var s = String(v);
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };
  /** Días calendario desde hoy hasta la fecha indicada (negativo = vencido). */
  U.diasHasta = function (fecha) {
    var f = U.aFecha(fecha); if (!f) return null;
    var h = U.aFecha(U.hoy());
    return Math.round((f - h) / 86400000);
  };
  U.fmtFecha = function (v) {
    var d = U.aFecha(v); if (!d) return '—';
    return U.pad2(d.getDate()) + '/' + U.pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  };
  U.fmtFechaCorta = function (v) {
    var d = U.aFecha(v); if (!d) return '—';
    return U.pad2(d.getDate()) + '/' + U.pad2(d.getMonth() + 1);
  };
  var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  U.MESES = MESES; U.DIAS = DIAS;
  U.fmtFechaLarga = function (v) {
    var d = U.aFecha(v); if (!d) return '—';
    return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()].toLowerCase() + ' de ' + d.getFullYear();
  };
  U.fmtMarca = function (v) { // 'YYYY-MM-DD HH:MM' o ISO
    if (!v) return '—';
    var s = String(v);
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s);
    if (m) return m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5];
    return U.fmtFecha(s);
  };
  /** Texto relativo amable: "en 3 días", "hace 5 días", "hoy" */
  U.txtVencimiento = function (dias) {
    if (dias === null || dias === undefined) return 'Sin fecha límite';
    if (dias === 0) return 'Vence hoy';
    if (dias === 1) return 'Vence mañana';
    if (dias > 1) return 'Vence en ' + dias + ' días';
    if (dias === -1) return 'Vencida hace 1 día';
    return 'Vencida hace ' + Math.abs(dias) + ' días';
  };
  /** Suma días a una fecha YYYY-MM-DD */
  U.sumarDias = function (fecha, n) {
    var d = U.aFecha(fecha) || new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
  };
  U.finDeMes = function (anio, mes0) { return new Date(anio, mes0 + 1, 0).getDate(); };

  /* ---------- Texto ---------- */
  U.escapeHtml = function (s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  };
  /** Normaliza para búsquedas: sin tildes, minúsculas. */
  U.norm = function (s) {
    if (s === null || s === undefined) return '';
    return String(s).toLowerCase()
      .replace(/[áàäâã]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
      .replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n').replace(/ç/g, 'c');
  };
  U.iniciales = function (nombre) {
    var p = String(nombre || '').trim().split(/\s+/);
    if (!p[0]) return '👤';
    return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
  };
  U.truncar = function (s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };
  U.peso = function (bytes) {
    bytes = +bytes || 0;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };
  U.slug = function (s) {
    return U.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'archivo';
  };

  /* ---------- DOM ---------- */
  U.$ = function (sel, raiz) { return (raiz || document).querySelector(sel); };
  U.$$ = function (sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); };

  /** Elige el icono según el tipo de archivo */
  U.iconoArchivo = function (tipo, nombre) {
    var t = (tipo || '') + ' ' + (nombre || '');
    if (/image\//i.test(t)) return '🖼️';
    if (/pdf/i.test(t)) return '📕';
    if (/(word|msword|document)/i.test(t)) return '📘';
    if (/(excel|spreadsheet|sheet|csv)/i.test(t)) return '📗';
    if (/(zip|rar|compressed)/i.test(t)) return '🗜️';
    return '📄';
  };
  /** Fecha/hora actual como marca de auditoría */
  U.marca = function () { return U.ahora().marca; };

  /* ---------- Avisos (toasts) ---------- */
  U.toast = function (msg, tipo, ms) {
    var cont = U.$('#toasts');
    if (!cont) return;
    var t = document.createElement('div');
    t.className = 'toast ' + (tipo || '');
    t.innerHTML = '<span>' + U.escapeHtml(msg) + '</span><button class="x" aria-label="cerrar">✕</button>';
    t.querySelector('.x').onclick = function () { t.remove(); };
    cont.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, ms || (tipo === 'err' ? 6500 : 3600));
  };

  /* ---------- Modales ---------- */
  var Modal = U.Modal = {
    pila: [],
    abrir: function (opts) {
      opts = opts || {};
      var root = U.$('#modal-root');
      var overlay = document.createElement('div');
      overlay.className = 'overlay';
      if (opts.onOverlayClose !== false) {
        overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) Modal.cerrar(); });
      }
      var modal = document.createElement('div');
      modal.className = 'modal' + (opts.wide ? ' wide' : '') + (opts.slim ? ' slim' : '');
      var html = '';
      if (opts.title) {
        html += '<div class="modal-h"><h3>' + (opts.icon ? '<span>' + opts.icon + '</span> ' : '') + U.escapeHtml(opts.title) + '</h3>' +
          '<button class="close" type="button" aria-label="Cerrar">✕</button></div>';
      }
      html += '<div class="modal-b">' + (opts.body || '') + '</div>';
      if (opts.footer) html += '<div class="modal-f">' + opts.footer + '</div>';
      modal.innerHTML = html;
      overlay.appendChild(modal);
      root.appendChild(overlay);
      Modal.pila.push(overlay);
      var btnCerrar = modal.querySelector('.modal-h .close');
      if (btnCerrar) btnCerrar.onclick = function () { Modal.cerrar(); };
      document.body.style.overflow = 'hidden';
      if (opts.onOpen) opts.onOpen(modal, overlay);
      var autofocus = modal.querySelector('[data-autofocus]');
      if (autofocus) setTimeout(function () { try { autofocus.focus(); } catch (e) {} }, 60);
      return { modal: modal, overlay: overlay, cerrar: Modal.cerrar };
    },
    cerrar: function () {
      var top = Modal.pila.pop();
      if (top) top.remove();
      if (!Modal.pila.length) document.body.style.overflow = '';
    },
    confirmar: function (opts) {
      opts = typeof opts === 'string' ? { mensaje: opts } : (opts || {});
      return new Promise(function (res) {
        var m = Modal.abrir({
          title: opts.titulo || 'Confirmar',
          icon: opts.icon || '⚠️',
          slim: true,
          body: '<p>' + U.escapeHtml(opts.mensaje || '¿Está seguro?') + '</p>' +
            (opts.detalle ? '<p class="small muted">' + U.escapeHtml(opts.detalle) + '</p>' : ''),
          footer: '<button class="btn" data-x="no">' + (opts.textoCancelar || 'Cancelar') + '</button>' +
            '<button class="btn ' + (opts.peligro ? 'btn-danger' : 'btn-primary') + '" data-x="si">' + (opts.textoOk || 'Confirmar') + '</button>',
          onOpen: function (modal) {
            modal.querySelector('[data-x="no"]').onclick = function () { Modal.cerrar(); res(false); };
            var ok = modal.querySelector('[data-x="si"]');
            ok.onclick = function () { Modal.cerrar(); res(true); };
            setTimeout(function () { try { ok.focus(); } catch (e) {} }, 60);
          }
        });
        m.overlay.addEventListener('click', function (e) { if (e.target === m.overlay) res(false); });
      });
    },
    /** Mensaje informativo simple */
    aviso: function (titulo, mensaje, icon) {
      return Modal.abrir({
        title: titulo, icon: icon || 'ℹ️', slim: true,
        body: '<p>' + mensaje + '</p>',
        footer: '<button class="btn btn-primary" data-x="ok">Entendido</button>',
        onOpen: function (modal) { modal.querySelector('[data-x="ok"]').onclick = function () { Modal.cerrar(); }; }
      });
    }
  };

  /* ---------- Visor de imágenes ---------- */
  var Lightbox = U.Lightbox = {
    abrir: function (items, idx) {
      idx = idx || 0;
      var lb = document.createElement('div');
      lb.className = 'lightbox';
      function pinta() {
        var it = items[idx];
        lb.innerHTML = '<button class="lb-close" title="Cerrar">✕</button>' +
          (items.length > 1 ? '<button class="lb-nav prev" title="Anterior">‹</button><button class="lb-nav next" title="Siguiente">›</button>' : '') +
          '<figure style="margin:0;text-align:center">' +
          '<img src="' + it.url + '" alt="' + U.escapeHtml(it.nombre || '') + '">' +
          '<figcaption style="color:#dbe3f1;font-size:.85rem;margin-top:.5rem">' +
          U.escapeHtml((it.nombre || '') + ' — ' + (idx + 1) + ' de ' + items.length) + '</figcaption></figure>';
        lb.querySelector('.lb-close').onclick = function () { lb.remove(); };
        var p = lb.querySelector('.prev'), n = lb.querySelector('.next');
        if (p) p.onclick = function (e) { e.stopPropagation(); idx = (idx - 1 + items.length) % items.length; pinta(); };
        if (n) n.onclick = function (e) { e.stopPropagation(); idx = (idx + 1) % items.length; pinta(); };
      }
      pinta();
      lb.addEventListener('click', function (e) { if (e.target === lb) lb.remove(); });
      document.body.appendChild(lb);
      var esc = function (e) {
        if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', esc); }
        if (e.key === 'ArrowRight' && items.length > 1) { idx = (idx + 1) % items.length; pinta(); }
        if (e.key === 'ArrowLeft' && items.length > 1) { idx = (idx - 1 + items.length) % items.length; pinta(); }
      };
      document.addEventListener('keydown', esc);
    }
  };

  /* ---------- Archivos ---------- */
  U.leerComoDataURL = function (file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(file);
    });
  };
  U.descargar = function (contenido, nombre, mime) {
    var blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1500);
  };
  /** Comprime una imagen a JPEG (máx. lado indicado) para que el envío a la nube sea liviano. */
  U.comprimirImagen = function (file, maxLado, calidad) {
    maxLado = maxLado || 1400; calidad = calidad || 0.78;
    return new Promise(function (res) {
      U.leerComoDataURL(file).then(function (dataUrl) {
        var img = new Image();
        img.onload = function () {
          try {
            var w = img.naturalWidth, h = img.naturalHeight;
            var esc = Math.min(1, maxLado / Math.max(w, h));
            var cw = Math.max(1, Math.round(w * esc)), ch = Math.max(1, Math.round(h * esc));
            var c = document.createElement('canvas');
            c.width = cw; c.height = ch;
            c.getContext('2d').drawImage(img, 0, 0, cw, ch);
            var out = c.toDataURL('image/jpeg', calidad);
            res({ dataUrl: out, ancho: cw, alto: ch, peso: U.pesoAprox(out) });
          } catch (e) { res({ dataUrl: dataUrl, ancho: img.naturalWidth, alto: img.naturalHeight, peso: file.size }); }
        };
        img.onerror = function () { res({ dataUrl: dataUrl, ancho: 0, alto: 0, peso: file.size }); };
        img.src = dataUrl;
      });
    });
  };
  U.pesoAprox = function (dataUrl) {
    var i = String(dataUrl).indexOf(',');
    if (i < 0) return 0;
    return Math.round((String(dataUrl).length - i - 1) * 0.75);
  };
  U.tipoDeDataUrl = function (dataUrl) {
    var m = /^data:([^;,]+)/.exec(String(dataUrl) || '');
    return m ? m[1] : 'application/octet-stream';
  };

  /* ---------- Varios ---------- */
  /** Base64 seguro para URL con soporte de tildes y ñ (para códigos de vinculación) */
  U.b64url = function (texto) {
    var bytes = global.TextEncoder ? new global.TextEncoder().encode(String(texto)) : new Uint8Array(Buffer.from(String(texto), 'utf8'));
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    var b = global.btoa ? global.btoa(bin) : Buffer.from(bytes).toString('base64');
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  U.deb64url = function (codigo) {
    var s = String(codigo || '').trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    while (s.length % 4) s += '=';
    var bin = global.atob ? global.atob(s) : Buffer.from(s, 'base64').toString('binary');
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return global.TextDecoder ? new global.TextDecoder().decode(bytes) : Buffer.from(bytes).toString('utf8');
  };

  /** Copia al portapapeles con respaldo para navegadores sin permiso de portapapeles */
  U.copiar = function (texto) {
    if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).then(function () { return true; }).catch(function () { return U.copiarManual(texto); });
    }
    return Promise.resolve(U.copiarManual(texto));
  };
  U.copiarManual = function (texto) {
    try {
      var ta = document.createElement('textarea');
      ta.value = texto;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (e) { return false; }
  };

  U.debounce = function (fn, ms) {
    var t; return function () {
      var args = arguments, self = this;
      clearTimeout(t); t = setTimeout(function () { fn.apply(self, args); }, ms || 250);
    };
  };
  U.groupBy = function (arr, fn) {
    return (arr || []).reduce(function (acc, it) {
      var k = fn(it); (acc[k] = acc[k] || []).push(it); return acc;
    }, {});
  };
  U.ordenar = function (arr, fn, dir) {
    dir = dir === 'desc' ? -1 : 1;
    return arr.slice().sort(function (a, b) {
      var va = fn(a), vb = fn(b);
      if (va === null || va === undefined) va = '';
      if (vb === null || vb === undefined) vb = '';
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' }) * dir;
    });
  };
  U.pct = function (n, total) { return total > 0 ? Math.round((n / total) * 100) : 0; };
  U.attr = function (v) { return U.escapeHtml(v === null || v === undefined ? '' : v); };
  /** Convierte enlace de almacenamiento a URL utilizable */
  U.soportaLectura = function (v) { return typeof v === 'string' && (v.indexOf('data:') === 0 || v.indexOf('http') === 0 || v.indexOf('blob:') === 0); };
})(typeof window !== 'undefined' ? window : globalThis);
