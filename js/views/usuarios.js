/* ==========================================================================
   views/usuarios.js – Administración de usuarios, perfiles y permisos
   Perfiles: Administrador (acceso total), Supervisor (consulta y modifica
   tareas), Usuario (consulta y registra avances según permisos).
   ========================================================================== */
(function (global) {
  'use strict';
  var CSN = global.CSN = global.CSN || {};
  var U = CSN.util, M = CSN.model, UI = CSN.ui;
  var V = CSN.views = CSN.views || {};

  var Vu = V.usuarios = {};

  Vu.render = function (cont) {
    if (!CSN.store.puede('usuario.gestionar')) {
      cont.innerHTML = UI.encabezado('USUARIOS', 'Administración de usuarios del sistema.') +
        '<div class="alert-box alert-warn">Su perfil (' + U.escapeHtml((CSN.store.sesion() || {}).perfil || '') + ') no permite administrar usuarios. Solicite acceso a un Administrador.</div>';
      return;
    }
    var usuarios = CSN.store.usuarios();
    var actual = CSN.store.sesion() || {};

    cont.innerHTML = '' +
      UI.encabezado('USUARIOS', 'Perfiles y permisos de acceso al sistema. <b>' + usuarios.length + '</b> usuarios registrados.',
        '<button class="btn btn-primary" data-u="nuevo">+ NUEVO USUARIO</button>' +
        '<button class="btn" data-u="restablecer">♻ Restablecer claves de demostración</button>') +
      '<div class="card mb"><div class="section-title" style="margin-top:0">Perfiles y permisos</div>' +
      '<div class="grid grid-3">' + Object.keys(M.PERFILES).map(function (p) {
        return '<div class="card tight"><div class="flex between items-center"><b>' + p + '</b>' +
          '<span class="badge b-media">Nivel ' + M.PERFILES[p].nivel + '</span></div>' +
          '<div class="small muted mt">' + U.escapeHtml(M.PERFILES[p].desc) + '</div></div>';
      }).join('') + '</div></div>' +
      '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>Nombre</th><th>Correo electrónico</th><th>Perfil</th><th>Cargo</th><th>Estado</th><th>Último acceso</th><th></th>' +
      '</tr></thead><tbody>' +
      usuarios.map(function (u) {
        return '<tr><td><b>' + U.escapeHtml(u.nombre) + '</b>' + (u.id === actual.id ? ' <span class="badge b-activa">Sesión actual</span>' : '') + '</td>' +
          '<td>' + U.escapeHtml(u.email) + '</td><td>' + U.escapeHtml(u.perfil) + '</td><td>' + U.escapeHtml(u.cargo || '—') + '</td>' +
          '<td><span class="badge ' + (u.estado === 'Activo' ? 'b-activa' : 'b-inactiva') + '">' + U.escapeHtml(u.estado) + '</span></td>' +
          '<td class="small">' + U.escapeHtml(u.ultimoAcceso || 'Sin registros') + '</td>' +
          '<td class="actions"><button class="btn btn-sm" data-u="editar" data-id="' + U.attr(u.id) + '">✏️</button> ' +
          '<button class="btn btn-sm" data-u="clave" data-id="' + U.attr(u.id) + '">🔑</button> ' +
          (u.id !== actual.id ? '<button class="btn btn-sm btn-danger" data-u="eliminar" data-id="' + U.attr(u.id) + '">🗑</button>' : '') +
          '</td></tr>';
      }).join('') + '</tbody></table></div>';

    cont.onclick = function (e) {
      var b = e.target.closest('[data-u]');
      if (!b) return;
      var accion = b.getAttribute('data-u');
      var id = b.getAttribute('data-id');
      if (accion === 'nuevo') Vu.formulario(null, function () { Vu.render(cont); });
      else if (accion === 'editar') Vu.formulario(id, function () { Vu.render(cont); });
      else if (accion === 'clave') Vu.cambiarClave(id, function () { Vu.render(cont); });
      else if (accion === 'restablecer') {
        U.Modal.confirmar({
          mensaje: '¿Restablecer las contraseñas de demostración?',
          detalle: 'admin@csn.cl → csn2026 · supervisor@csn.cl → supervisor2026 · usuario@csn.cl → usuario2026'
        }).then(function (ok) { if (ok) CSN.store.restablecerClavesDemo().catch(function (err) { U.toast(err.message, 'err'); }); });
      } else if (accion === 'eliminar') {
        var u = CSN.store.todas('usuarios').filter(function (x) { return x.id === id; })[0];
        U.Modal.confirmar({ mensaje: '¿Eliminar al usuario ' + (u ? u.nombre : '') + '?', peligro: true, textoOk: 'Eliminar' }).then(function (ok) {
          if (!ok) return;
          CSN.store.eliminarUsuario(id).then(function () { Vu.render(cont); }).catch(function (err) { U.toast(err.message, 'err'); });
        });
      }
    };
  };

  Vu.formulario = function (id, cb) {
    var u = id ? CSN.store.todas('usuarios').filter(function (x) { return x.id === id; })[0] : M.nuevoUsuario({}, CSN.store.sesion());
    if (id && !u) { U.toast('Usuario no encontrado', 'err'); return; }
    U.Modal.abrir({
      title: id ? 'Editar usuario' : 'Nuevo usuario', icon: '👤',
      body: '<form id="form-usuario" class="form-grid">' +
        UI.campo({ nombre: 'nombre', label: 'Nombre completo', requerido: true, valor: u.nombre, ancho: 2 }) +
        UI.campo({ nombre: 'email', label: 'Correo electrónico', tipo: 'email', requerido: true, valor: u.email, ancho: 2 }) +
        UI.campo({ nombre: 'perfil', label: 'Perfil', tipo: 'select', valor: u.perfil, opcionesHtml: UI.opciones(Object.keys(M.PERFILES).map(function (p) { return { id: p, nombre: p }; }), u.perfil, 'Seleccione…') }) +
        UI.campo({ nombre: 'cargo', label: 'Cargo', valor: u.cargo }) +
        UI.campo({ nombre: 'telefono', label: 'Teléfono', tipo: 'tel', valor: u.telefono }) +
        UI.campo({ nombre: 'estado', label: 'Estado', tipo: 'select', valor: u.estado, opcionesHtml: "<option value='Activo'>Activo</option><option value='Inactivo'>Inactivo</option>" }) +
        '<div class="field col-2"><label>Contraseña ' + (id ? '(dejar en blanco para conservar)' : '') + '</label>' +
        '<input type="password" data-campo="clave" placeholder="Mínimo 6 caracteres"></div>' +
        '</form>' +
        '<div class="alert-box alert-info mt">El perfil determina lo que el usuario puede hacer: crear, modificar, eliminar y administrar la configuración.</div>',
      footer: '<button class="btn" data-x="cancelar">Cancelar</button><button class="btn btn-primary" data-x="guardar">' + (id ? 'Guardar' : 'CREAR USUARIO') + '</button>',
      onOpen: function (modal) {
        modal.querySelector('[data-x="cancelar"]').onclick = function () { U.Modal.cerrar(); };
        var btn = modal.querySelector('[data-x="guardar"]');
        btn.onclick = function () {
          var datos = UI.leerCampos(modal.querySelector('#form-usuario'));
          var clave = datos.clave; delete datos.clave;
          if (id) datos.id = id;
          if (clave && clave.length < 6) { U.toast('La contraseña debe tener al menos 6 caracteres', 'err'); return; }
          btn.disabled = true;
          Promise.resolve().then(function () { return CSN.store.guardarUsuario(datos, clave); })
            .then(function () { U.Modal.cerrar(); U.toast(id ? 'Usuario actualizado' : 'Usuario creado', 'ok'); if (cb) cb(); })
            .catch(function (e) { btn.disabled = false; U.toast(e.message, 'err'); });
        };
      }
    });
  };

  Vu.cambiarClave = function (id, cb) {
    var u = CSN.store.todas('usuarios').filter(function (x) { return x.id === id; })[0];
    U.Modal.abrir({
      title: 'Cambiar contraseña', icon: '🔑', slim: true,
      body: '<div class="small muted mb">Usuario: <b>' + U.escapeHtml(u.nombre) + '</b> (' + U.escapeHtml(u.email) + ')</div>' +
        '<div class="field"><label>Nueva contraseña</label><input type="password" id="nc1" placeholder="Mínimo 6 caracteres"></div>' +
        '<div class="field"><label>Repetir contraseña</label><input type="password" id="nc2"></div>',
      footer: '<button class="btn" data-x="cancelar">Cancelar</button><button class="btn btn-primary" data-x="guardar">Cambiar</button>',
      onOpen: function (modal) {
        modal.querySelector('[data-x="cancelar"]').onclick = function () { U.Modal.cerrar(); };
        modal.querySelector('[data-x="guardar"]').onclick = function () {
          var a = modal.querySelector('#nc1').value, b = modal.querySelector('#nc2').value;
          if (!a || a.length < 6) { U.toast('La contraseña debe tener al menos 6 caracteres', 'err'); return; }
          if (a !== b) { U.toast('Las contraseñas no coinciden', 'err'); return; }
          CSN.store.guardarUsuario({ id: id }, a).then(function () {
            U.Modal.cerrar(); U.toast('Contraseña actualizada', 'ok'); if (cb) cb();
          }).catch(function (e) { U.toast(e.message, 'err'); });
        };
      }
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
