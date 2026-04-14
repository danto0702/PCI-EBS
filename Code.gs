// ============================================================
// PCI App – Google Apps Script v3.0
// ESE Hospital Regional Noroccidental
// Backend completo: autenticación, usuarios, registros PCI
// ============================================================
//
// HOJAS que se crean automáticamente:
//   Usuarios      → credenciales y configuración de usuarios
//   PCI_Registros → planes de cuidado individual
//   ErrorLog      → registro de errores internos
//
// DESPLIEGUE:
//   1. Sheets → Extensiones → Apps Script → pegar código → Guardar
//   2. Implementar → Nueva implementación
//      Tipo: Aplicación web
//      Ejecutar como: Yo
//      Acceso: Cualquier persona
//   3. Copiar URL /exec → pegar en app.js como GAS_URL
// ============================================================

var H_USUARIOS  = 'Usuarios';
var H_REGISTROS = 'PCI_Registros';
var H_ERRORES   = 'ErrorLog';

// Columnas de la hoja Usuarios (orden fijo)
var COLS_USUARIOS = [
  'id', 'nombre', 'usuario', 'passwordHash',
  'rol', 'codigoEBS', 'estado', 'creadoEn', 'ultimoAcceso'
];

// Columnas fijas de registros PCI (las de intervenciones se agregan dinámicamente)
var COLS_REGISTROS_FIJAS = [
  '_id', '_timestamp', '_status', '_sincronizado', '_usuario',
  'fecha_atencion', 'eps', 'nombre_apellido', 'documento',
  'fecha_nacimiento', 'edad', 'direccion', 'celular', 'municipio',
  'codigo_microterritorio', 'codigo_familia', 'codigo_ebs',
  'ciclo_vital', 'ciclo_vital_label', 'otras_intervenciones'
];

// ─── RESPUESTA JSON ───────────────────────────────────────────
function R(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════
// ENRUTADORES PRINCIPALES
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    switch (p.action) {
      case 'ping':           return R({ ok: true, version: '3.0' });
      case 'get_registros':  return accionGetRegistros(p);
      default:               return R({ ok: true, version: '3.0', ts: new Date().toISOString() });
    }
  } catch (err) {
    logError(err, 'doGet');
    return R({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var raw    = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var body   = JSON.parse(raw);
    var accion = body.action || body._action || '';

    switch (accion) {
      // ── Autenticación ──────────────────────────────────────
      case 'login':              return accionLogin(body);

      // ── Usuarios (solo admin) ──────────────────────────────
      case 'crear_usuario':      return accionCrearUsuario(body);
      case 'editar_usuario':     return accionEditarUsuario(body);
      case 'eliminar_usuario':   return accionEliminarUsuario(body);
      case 'listar_usuarios':    return accionListarUsuarios(body);
      case 'toggle_estado':      return accionToggleEstado(body);

      // ── Registros PCI ──────────────────────────────────────
      case 'guardar_registro':   return accionGuardarRegistro(body);
      case 'guardar_lote':       return accionGuardarLote(body);

      // ── Compatibilidad versión anterior ────────────────────
      case 'guardar_registro_v1':
      case '':                   return accionGuardarRegistro(body);

      default:
        return R({ ok: false, error: 'Acción desconocida: ' + accion });
    }
  } catch (err) {
    logError(err, 'doPost');
    return R({ ok: false, error: String(err) });
  }
}

// ═══════════════════════════════════════════════════════════════
// AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════════

function accionLogin(body) {
  var usuario  = String(body.usuario  || '').toLowerCase().trim();
  var hashPwd  = String(body.passwordHash || '');

  if (!usuario || !hashPwd) {
    return R({ ok: false, error: 'Usuario y contraseña requeridos' });
  }

  var hoja = obtenerHojaUsuarios();
  var datos = hoja.getDataRange().getValues();
  if (datos.length <= 1) return R({ ok: false, error: 'Sin usuarios registrados' });

  var enc = datos[0];
  var iUsuario  = enc.indexOf('usuario');
  var iHash     = enc.indexOf('passwordHash');
  var iEstado   = enc.indexOf('estado');
  var iRol      = enc.indexOf('rol');
  var iNombre   = enc.indexOf('nombre');
  var iEBS      = enc.indexOf('codigoEBS');
  var iId       = enc.indexOf('id');
  var iAcceso   = enc.indexOf('ultimoAcceso');

  for (var i = 1; i < datos.length; i++) {
    var fila = datos[i];
    var uLogin = String(fila[iUsuario] || '').toLowerCase().trim();
    var uHash  = String(fila[iHash]   || '');
    var estado = String(fila[iEstado] || '');

    if (uLogin === usuario && uHash === hashPwd) {
      if (estado !== 'activo') {
        return R({ ok: false, error: 'Cuenta inactiva. Contacte al administrador.' });
      }
      // Actualizar último acceso
      hoja.getRange(i + 1, iAcceso + 1).setValue(new Date().toISOString());

      return R({
        ok: true,
        usuario: {
          id:         String(fila[iId]     || ''),
          nombre:     String(fila[iNombre] || ''),
          usuario:    String(fila[iUsuario]|| ''),
          rol:        String(fila[iRol]    || ''),
          codigoEBS:  String(fila[iEBS]    || ''),
          estado:     estado
        }
      });
    }
  }

  return R({ ok: false, error: 'Usuario o contraseña incorrectos' });
}

// ═══════════════════════════════════════════════════════════════
// GESTIÓN DE USUARIOS
// ═══════════════════════════════════════════════════════════════

function accionListarUsuarios(body) {
  if (!esAdmin(body)) return R({ ok: false, error: 'Sin permisos de administrador' });

  var hoja  = obtenerHojaUsuarios();
  var datos = hoja.getDataRange().getValues();
  if (datos.length <= 1) return R({ ok: true, usuarios: [] });

  var enc      = datos[0];
  var iHash    = enc.indexOf('passwordHash');
  var usuarios = [];

  for (var i = 1; i < datos.length; i++) {
    var obj = {};
    enc.forEach(function(col, j) {
      if (col !== 'passwordHash') obj[col] = datos[i][j]; // NO exponer hash
    });
    usuarios.push(obj);
  }

  return R({ ok: true, usuarios: usuarios });
}

function accionCrearUsuario(body) {
  if (!esAdmin(body)) return R({ ok: false, error: 'Sin permisos de administrador' });

  var nombre   = String(body.nombre   || '').trim();
  var usuario  = String(body.usuario  || '').toLowerCase().trim();
  var hashPwd  = String(body.passwordHash || '');
  var rol      = String(body.rol      || 'usuario');
  var ebs      = String(body.codigoEBS|| '').toUpperCase().trim();
  var estado   = String(body.estado   || 'activo');

  if (!nombre || !usuario || !hashPwd || !ebs) {
    return R({ ok: false, error: 'Faltan campos obligatorios: nombre, usuario, contraseña, codigoEBS' });
  }

  var hoja  = obtenerHojaUsuarios();
  var datos = hoja.getDataRange().getValues();
  var enc   = datos[0];
  var iUsr  = enc.indexOf('usuario');

  // Verificar duplicado
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][iUsr] || '').toLowerCase() === usuario) {
      return R({ ok: false, error: 'El nombre de usuario "' + usuario + '" ya existe' });
    }
  }

  var nuevoId = 'usr_' + new Date().getTime();
  var ahora   = new Date().toISOString();

  var fila = COLS_USUARIOS.map(function(col) {
    switch (col) {
      case 'id':           return nuevoId;
      case 'nombre':       return nombre;
      case 'usuario':      return usuario;
      case 'passwordHash': return hashPwd;
      case 'rol':          return rol;
      case 'codigoEBS':    return ebs;
      case 'estado':       return estado;
      case 'creadoEn':     return ahora;
      case 'ultimoAcceso': return '';
      default:             return '';
    }
  });

  hoja.appendRow(fila);
  return R({ ok: true, id: nuevoId, mensaje: 'Usuario creado correctamente' });
}

function accionEditarUsuario(body) {
  if (!esAdmin(body)) return R({ ok: false, error: 'Sin permisos de administrador' });

  var id = String(body.id || '');
  if (!id) return R({ ok: false, error: 'ID de usuario requerido' });

  var hoja  = obtenerHojaUsuarios();
  var datos = hoja.getDataRange().getValues();
  var enc   = datos[0];
  var iId   = enc.indexOf('id');
  var iUsr  = enc.indexOf('usuario');

  // Buscar la fila del usuario
  var filaNum = -1;
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][iId] || '') === id) { filaNum = i + 1; break; }
  }
  if (filaNum === -1) return R({ ok: false, error: 'Usuario no encontrado' });

  // Verificar duplicado de username (excluyendo al propio usuario)
  var nuevoUsuario = String(body.usuario || '').toLowerCase().trim();
  for (var j = 1; j < datos.length; j++) {
    if (j + 1 !== filaNum && String(datos[j][iUsr] || '').toLowerCase() === nuevoUsuario) {
      return R({ ok: false, error: 'El nombre de usuario "' + nuevoUsuario + '" ya existe' });
    }
  }

  // Actualizar campos editables
  var campos = { nombre: body.nombre, usuario: nuevoUsuario, rol: body.rol, codigoEBS: String(body.codigoEBS || '').toUpperCase(), estado: body.estado };
  Object.keys(campos).forEach(function(campo) {
    var col = enc.indexOf(campo);
    if (col >= 0 && campos[campo] !== undefined && campos[campo] !== '') {
      hoja.getRange(filaNum, col + 1).setValue(campos[campo]);
    }
  });

  // Actualizar contraseña solo si se envía
  if (body.passwordHash) {
    var iHash = enc.indexOf('passwordHash');
    if (iHash >= 0) hoja.getRange(filaNum, iHash + 1).setValue(body.passwordHash);
  }

  return R({ ok: true, mensaje: 'Usuario actualizado correctamente' });
}

function accionEliminarUsuario(body) {
  if (!esAdmin(body)) return R({ ok: false, error: 'Sin permisos de administrador' });

  var id = String(body.id || '');
  if (!id) return R({ ok: false, error: 'ID requerido' });

  // Proteger: no eliminar el propio admin que está haciendo la petición
  if (body.adminId && body.adminId === id) {
    return R({ ok: false, error: 'No puede eliminar su propia cuenta' });
  }

  var hoja  = obtenerHojaUsuarios();
  var datos = hoja.getDataRange().getValues();
  var enc   = datos[0];
  var iId   = enc.indexOf('id');

  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][iId] || '') === id) {
      hoja.deleteRow(i + 1);
      return R({ ok: true, mensaje: 'Usuario eliminado' });
    }
  }
  return R({ ok: false, error: 'Usuario no encontrado' });
}

function accionToggleEstado(body) {
  if (!esAdmin(body)) return R({ ok: false, error: 'Sin permisos de administrador' });

  var id    = String(body.id || '');
  var hoja  = obtenerHojaUsuarios();
  var datos = hoja.getDataRange().getValues();
  var enc   = datos[0];
  var iId     = enc.indexOf('id');
  var iEstado = enc.indexOf('estado');

  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][iId] || '') === id) {
      var actual  = String(datos[i][iEstado] || 'activo');
      var nuevo   = actual === 'activo' ? 'inactivo' : 'activo';
      hoja.getRange(i + 1, iEstado + 1).setValue(nuevo);
      return R({ ok: true, nuevoEstado: nuevo });
    }
  }
  return R({ ok: false, error: 'Usuario no encontrado' });
}

// ═══════════════════════════════════════════════════════════════
// REGISTROS PCI
// ═══════════════════════════════════════════════════════════════

function accionGetRegistros(params) {
  try {
    var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(H_REGISTROS);
    if (!hoja || hoja.getLastRow() <= 1) return R({ ok: true, registros: [], total: 0 });

    var datos   = hoja.getDataRange().getValues();
    var enc     = datos[0];
    var filtroEBS = String(params.ebs || '').trim();
    var registros = [];

    for (var i = 1; i < datos.length; i++) {
      var fila = {};
      enc.forEach(function(col, j) { fila[col] = datos[i][j]; });
      if (!filtroEBS || fila['codigo_ebs'] === filtroEBS) {
        registros.push(fila);
      }
    }
    return R({ ok: true, registros: registros, total: registros.length });
  } catch (err) {
    logError(err, 'accionGetRegistros');
    return R({ ok: false, error: String(err) });
  }
}

function accionGuardarRegistro(datos) {
  try {
    var libro = SpreadsheetApp.getActiveSpreadsheet();
    var hoja  = libro.getSheetByName(H_REGISTROS);
    if (!hoja) hoja = libro.insertSheet(H_REGISTROS);

    // Crear encabezados si hoja vacía
    if (hoja.getLastRow() === 0) {
      var enc = construirEncabezadosRegistro(datos);
      hoja.appendRow(enc);
      formatearEncabezado(hoja, enc.length);
    }

    // Leer encabezados actuales
    var numCols    = hoja.getLastColumn();
    var encActual  = hoja.getRange(1, 1, 1, numCols).getValues()[0];

    // Agregar columnas nuevas de intervenciones si no existen
    Object.keys(datos).forEach(function(k) {
      if (k !== 'action' && k !== '_action' && encActual.indexOf(k) === -1) {
        encActual.push(k);
        var celda = hoja.getRange(1, encActual.length);
        celda.setValue(k);
        celda.setBackground('#1e40af');
        celda.setFontColor('#ffffff');
        celda.setFontWeight('bold');
        celda.setFontSize(8);
      }
    });

    // Construir y agregar fila
    var fila = encActual.map(function(col) {
      var v = datos[col];
      return (v === undefined || v === null) ? '' : v;
    });
    hoja.appendRow(fila);

    // Autoajustar las primeras veces
    if (hoja.getLastRow() <= 20) {
      try { hoja.autoResizeColumns(1, Math.min(encActual.length, 30)); } catch (e) {}
    }

    return R({ ok: true, id: datos._id || '', fila: hoja.getLastRow() });
  } catch (err) {
    logError(err, 'accionGuardarRegistro');
    return R({ ok: false, error: String(err) });
  }
}

function accionGuardarLote(datos) {
  var lista = datos.registros || [];
  var ok = 0, fallo = 0;
  lista.forEach(function(reg) {
    try { accionGuardarRegistro(reg); ok++; }
    catch (err) { logError(err, 'lote_item'); fallo++; }
  });
  return R({ ok: true, guardados: ok, fallidos: fallo, total: lista.length });
}

// ═══════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ═══════════════════════════════════════════════════════════════

function obtenerHojaUsuarios() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja  = libro.getSheetByName(H_USUARIOS);
  if (!hoja) {
    hoja = libro.insertSheet(H_USUARIOS);
    hoja.appendRow(COLS_USUARIOS);
    formatearEncabezado(hoja, COLS_USUARIOS.length);
    hoja.setColumnWidth(1, 160);
    hoja.setColumnWidth(4, 200); // passwordHash - ancho pero no visible fácilmente
    // Crear admin por defecto: admin / admin123
    // Hash SHA-256 de "admin123":
    var hashAdmin = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
    hoja.appendRow([
      'usr_default_admin',
      'Administrador',
      'admin',
      hashAdmin,
      'admin',
      'ADMIN',
      'activo',
      new Date().toISOString(),
      ''
    ]);
    Logger.log('Admin por defecto creado: admin / admin123');
  }
  return hoja;
}

function esAdmin(body) {
  // Verificar que quien hace la petición es un admin activo
  var adminToken = String(body._adminToken || '');
  var adminId    = String(body._adminId    || '');
  if (!adminToken || !adminId) return false;

  var hoja  = obtenerHojaUsuarios();
  var datos = hoja.getDataRange().getValues();
  var enc   = datos[0];
  var iId     = enc.indexOf('id');
  var iHash   = enc.indexOf('passwordHash');
  var iRol    = enc.indexOf('rol');
  var iEstado = enc.indexOf('estado');

  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][iId] || '') === adminId &&
        String(datos[i][iHash] || '') === adminToken &&
        String(datos[i][iRol] || '') === 'admin' &&
        String(datos[i][iEstado] || '') === 'activo') {
      return true;
    }
  }
  return false;
}

function construirEncabezadosRegistro(datos) {
  var extras = Object.keys(datos).filter(function(k) {
    return COLS_REGISTROS_FIJAS.indexOf(k) === -1 &&
           k !== 'action' && k !== '_action';
  }).sort();
  return COLS_REGISTROS_FIJAS.concat(extras);
}

function formatearEncabezado(hoja, numCols) {
  if (numCols < 1) return;
  try {
    var r = hoja.getRange(1, 1, 1, numCols);
    r.setBackground('#0f4c81');
    r.setFontColor('#ffffff');
    r.setFontWeight('bold');
    r.setFontSize(9);
    hoja.setFrozenRows(1);
  } catch (e) {}
}

function logError(err, ctx) {
  try {
    var libro = SpreadsheetApp.getActiveSpreadsheet();
    var hoja  = libro.getSheetByName(H_ERRORES);
    if (!hoja) {
      hoja = libro.insertSheet(H_ERRORES);
      hoja.appendRow(['Timestamp', 'Contexto', 'Error']);
      formatearEncabezado(hoja, 3);
    }
    hoja.appendRow([new Date().toISOString(), ctx || '', String(err)]);
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════
// FUNCIONES DE PRUEBA (ejecutar manualmente desde el editor)
// ═══════════════════════════════════════════════════════════════

function testLogin() {
  // Hash SHA-256 de "admin123"
  var hash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
  var res = doPost({ postData: { contents: JSON.stringify({
    action: 'login', usuario: 'admin', passwordHash: hash
  })}});
  Logger.log('LOGIN → ' + res.getContent());
}

function testCrearUsuario() {
  // Primero hacer login para obtener el token de admin
  var hashAdmin = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
  // Hash de "enfermera123":
  var hashNuevo = '1a2b3c4d5e6f'; // Reemplazar con hash real al probar

  var res = doPost({ postData: { contents: JSON.stringify({
    action: 'crear_usuario',
    _adminId: 'usr_default_admin',
    _adminToken: hashAdmin,
    nombre: 'María García',
    usuario: 'enfermera01',
    passwordHash: hashNuevo,
    rol: 'usuario',
    codigoEBS: 'EBS-001',
    estado: 'activo'
  })}});
  Logger.log('CREAR USUARIO → ' + res.getContent());
}

function testGuardarRegistro() {
  var res = doPost({ postData: { contents: JSON.stringify({
    action: 'guardar_registro',
    _id: 'TEST_' + Date.now(),
    _timestamp: new Date().toISOString(),
    _status: 'Sincronizado',
    _sincronizado: 'Sí',
    _usuario: 'admin',
    fecha_atencion: '2025-04-14',
    eps: 'Coosalud',
    nombre_apellido: 'Paciente Prueba',
    documento: '1234567890',
    fecha_nacimiento: '1985-06-15',
    edad: '39 año(s)',
    municipio: 'Ábrego',
    codigo_ebs: 'EBS-001',
    ciclo_vital: 'adultez',
    ciclo_vital_label: 'Adultez (29-59 años)',
    adu_consulta_med: 'Sí',
    adu_tamizaje_salud_mental: 'No'
  })}});
  Logger.log('GUARDAR REGISTRO → ' + res.getContent());
}

function testListarUsuarios() {
  var hashAdmin = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
  var res = doPost({ postData: { contents: JSON.stringify({
    action: 'listar_usuarios',
    _adminId: 'usr_default_admin',
    _adminToken: hashAdmin
  })}});
  Logger.log('USUARIOS → ' + res.getContent());
}

function testPing() {
  var res = doGet({ parameter: { action: 'ping' } });
  Logger.log('PING → ' + res.getContent());
}
