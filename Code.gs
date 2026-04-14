// ============================================================
// PCI App – Google Apps Script v4.0
// ESE Hospital Regional Noroccidental
// ============================================================
// HOJAS creadas automáticamente:
//   Usuarios      → id, nombre, usuario, passwordHash, rol,
//                   codigoEBS, estado, creadoEn, ultimoAcceso
//   PCI_Registros → todos los planes de cuidado
//   ErrorLog      → errores internos
//
// DESPLIEGUE:
//   1. Sheets → Extensiones → Apps Script → pegar → Guardar
//   2. Implementar → Nueva implementación
//      Tipo: Aplicación web | Ejecutar como: Yo | Acceso: Cualquier persona
//   3. Copiar URL /exec → pegar en app.js (GAS_URL)
// ============================================================

var H_USUARIOS  = 'Usuarios';
var H_REGISTROS = 'PCI_Registros';
var H_ERRORES   = 'ErrorLog';

var COLS_USR = ['id','nombre','usuario','passwordHash','rol','codigoEBS','estado','creadoEn','ultimoAcceso'];

var COLS_PCI_FIJAS = [
  '_id','_timestamp','_status','_sincronizado','_usuario',
  'fecha_atencion','eps','nombre_apellido','documento',
  'fecha_nacimiento','edad','direccion','celular','municipio',
  'codigo_microterritorio','codigo_familia','codigo_ebs',
  'ciclo_vital','ciclo_vital_label','otras_intervenciones'
];

// ─── RESPUESTA ────────────────────────────────────────────────
function R(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── GET ──────────────────────────────────────────────────────
function doGet(e) {
  try {
    var p = e && e.parameter ? e.parameter : {};
    if (p.action === 'ping')          return R({ ok:true, version:'4.0' });
    if (p.action === 'get_registros') return getRegistros(p.ebs || '', p.rol || '', p.codigoEBS || '');
    return R({ ok:true, version:'4.0', ts: new Date().toISOString() });
  } catch(err) {
    logErr(err,'doGet');
    return R({ ok:false, error:String(err) });
  }
}

// ─── POST ─────────────────────────────────────────────────────
function doPost(e) {
  try {
    var raw  = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    var body = JSON.parse(raw);
    var act  = String(body.action || body._action || '');

    // Log para depuración (ver en ErrorLog)
    logErr('doPost action=' + act + ' adminId=' + (body._adminId||'') + ' tokenLen=' + (body._adminToken||'').length, 'DEBUG');

    switch(act) {
      case 'login':           return login(body);
      case 'listar_usuarios': return listarUsuarios(body);
      case 'crear_usuario':   return crearUsuario(body);
      case 'editar_usuario':  return editarUsuario(body);
      case 'eliminar_usuario':return eliminarUsuario(body);
      case 'toggle_estado':   return toggleEstado(body);
      case 'guardar_registro':return guardarRegistro(body);
      case 'guardar_lote':    return guardarLote(body);
      default:                return guardarRegistro(body); // compatibilidad
    }
  } catch(err) {
    logErr(err,'doPost');
    return R({ ok:false, error:String(err) });
  }
}

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════
function login(body) {
  var uInput = String(body.usuario      || '').toLowerCase().trim();
  var hInput = String(body.passwordHash || '').toLowerCase().trim();

  if (!uInput || !hInput) return R({ ok:false, error:'Faltan credenciales' });

  var hoja  = hojaUsuarios();
  var datos = hoja.getDataRange().getValues();
  if (datos.length <= 1) return R({ ok:false, error:'Sin usuarios registrados. Ejecute testCrearAdmin() en el editor.' });

  var E = idx(datos[0]);

  for (var i = 1; i < datos.length; i++) {
    var fila   = datos[i];
    var uHoja  = String(fila[E.usuario]      || '').toLowerCase().trim();
    var hHoja  = String(fila[E.passwordHash] || '').toLowerCase().trim();
    var estado = String(fila[E.estado]       || '');

    if (uHoja === uInput && hHoja === hInput) {
      if (estado !== 'activo') return R({ ok:false, error:'Cuenta inactiva' });

      // Actualizar último acceso
      try { hoja.getRange(i+1, E.ultimoAcceso+1).setValue(new Date().toISOString()); } catch(e){}

      return R({
        ok: true,
        usuario: {
          id:        String(fila[E.id]        || ''),
          nombre:    String(fila[E.nombre]    || ''),
          usuario:   uHoja,
          rol:       String(fila[E.rol]       || ''),
          codigoEBS: String(fila[E.codigoEBS] || ''),
          estado:    estado,
          // Devolver hash para que el frontend lo use como token
          _hash:     hHoja
        }
      });
    }
  }
  return R({ ok:false, error:'Usuario o contraseña incorrectos' });
}

// ═══════════════════════════════════════════════════════════════
// VERIFICACIÓN ADMIN
// ═══════════════════════════════════════════════════════════════
function esAdmin(body) {
  var adminId    = String(body._adminId    || '').trim();
  var adminToken = String(body._adminToken || '').toLowerCase().trim();

  if (!adminId || !adminToken) {
    logErr('esAdmin: campos vacíos. adminId=['+adminId+'] tokenLen='+adminToken.length, 'AUTH');
    return false;
  }

  var hoja  = hojaUsuarios();
  var datos = hoja.getDataRange().getValues();
  if (datos.length <= 1) return false;

  var E = idx(datos[0]);

  for (var i = 1; i < datos.length; i++) {
    var fila   = datos[i];
    var filaId = String(fila[E.id]           || '').trim();
    var filaH  = String(fila[E.passwordHash] || '').toLowerCase().trim();
    var filaRol= String(fila[E.rol]          || '');
    var filaEst= String(fila[E.estado]       || '');

    if (filaId === adminId && filaH === adminToken && filaRol === 'admin' && filaEst === 'activo') {
      return true;
    }
  }

  logErr('esAdmin: no match para adminId='+adminId, 'AUTH');
  return false;
}

// ═══════════════════════════════════════════════════════════════
// CRUD USUARIOS
// ═══════════════════════════════════════════════════════════════
function listarUsuarios(body) {
  if (!esAdmin(body)) return R({ ok:false, error:'Sin permisos de administrador' });

  var hoja  = hojaUsuarios();
  var datos = hoja.getDataRange().getValues();
  if (datos.length <= 1) return R({ ok:true, usuarios:[] });

  var E        = idx(datos[0]);
  var usuarios = [];

  for (var i = 1; i < datos.length; i++) {
    var f = datos[i];
    usuarios.push({
      id:          String(f[E.id]          || ''),
      nombre:      String(f[E.nombre]      || ''),
      usuario:     String(f[E.usuario]     || ''),
      rol:         String(f[E.rol]         || ''),
      codigoEBS:   String(f[E.codigoEBS]   || ''),
      estado:      String(f[E.estado]      || ''),
      creadoEn:    String(f[E.creadoEn]    || ''),
      ultimoAcceso:String(f[E.ultimoAcceso]|| '')
      // NO incluir passwordHash
    });
  }
  return R({ ok:true, usuarios:usuarios });
}

function crearUsuario(body) {
  if (!esAdmin(body)) return R({ ok:false, error:'Sin permisos de administrador' });

  var nombre  = String(body.nombre        || '').trim();
  var usuario = String(body.usuario       || '').toLowerCase().trim();
  var hash    = String(body.passwordHash  || '').toLowerCase().trim();
  var rol     = String(body.rol           || 'usuario');
  var ebs     = String(body.codigoEBS     || '').toUpperCase().trim();
  var estado  = String(body.estado        || 'activo');

  if (!nombre || !usuario || !hash || !ebs) {
    return R({ ok:false, error:'Faltan campos: nombre, usuario, contraseña o codigoEBS' });
  }

  var hoja  = hojaUsuarios();
  var datos = hoja.getDataRange().getValues();
  var E     = idx(datos[0]);

  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][E.usuario]||'').toLowerCase() === usuario) {
      return R({ ok:false, error:'El usuario "'+usuario+'" ya existe' });
    }
  }

  var newId = 'usr_' + new Date().getTime();
  var fila  = COLS_USR.map(function(col) {
    switch(col) {
      case 'id':           return newId;
      case 'nombre':       return nombre;
      case 'usuario':      return usuario;
      case 'passwordHash': return hash;
      case 'rol':          return rol;
      case 'codigoEBS':    return ebs;
      case 'estado':       return estado;
      case 'creadoEn':     return new Date().toISOString();
      case 'ultimoAcceso': return '';
      default:             return '';
    }
  });
  hoja.appendRow(fila);
  return R({ ok:true, id:newId, mensaje:'Usuario creado' });
}

function editarUsuario(body) {
  if (!esAdmin(body)) return R({ ok:false, error:'Sin permisos de administrador' });

  var id = String(body.id || '').trim();
  if (!id) return R({ ok:false, error:'ID requerido' });

  var hoja  = hojaUsuarios();
  var datos = hoja.getDataRange().getValues();
  var E     = idx(datos[0]);

  var filaNum = -1;
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][E.id]||'').trim() === id) { filaNum = i+1; break; }
  }
  if (filaNum < 0) return R({ ok:false, error:'Usuario no encontrado' });

  // Verificar duplicado de username (excluyendo al mismo usuario)
  var nuevoUsr = String(body.usuario||'').toLowerCase().trim();
  for (var j = 1; j < datos.length; j++) {
    if (j+1 !== filaNum && String(datos[j][E.usuario]||'').toLowerCase() === nuevoUsr) {
      return R({ ok:false, error:'El nombre de usuario "'+nuevoUsr+'" ya existe' });
    }
  }

  if (body.nombre)    hoja.getRange(filaNum, E.nombre+1).setValue(String(body.nombre).trim());
  if (nuevoUsr)       hoja.getRange(filaNum, E.usuario+1).setValue(nuevoUsr);
  if (body.rol)       hoja.getRange(filaNum, E.rol+1).setValue(body.rol);
  if (body.codigoEBS) hoja.getRange(filaNum, E.codigoEBS+1).setValue(String(body.codigoEBS).toUpperCase().trim());
  if (body.estado)    hoja.getRange(filaNum, E.estado+1).setValue(body.estado);
  if (body.passwordHash) hoja.getRange(filaNum, E.passwordHash+1).setValue(String(body.passwordHash).toLowerCase().trim());

  return R({ ok:true, mensaje:'Usuario actualizado' });
}

function eliminarUsuario(body) {
  if (!esAdmin(body)) return R({ ok:false, error:'Sin permisos de administrador' });

  var id = String(body.id || '').trim();
  if (!id) return R({ ok:false, error:'ID requerido' });
  if (body._adminId === id) return R({ ok:false, error:'No puede eliminar su propia cuenta' });

  var hoja  = hojaUsuarios();
  var datos = hoja.getDataRange().getValues();
  var E     = idx(datos[0]);

  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][E.id]||'').trim() === id) {
      hoja.deleteRow(i+1);
      return R({ ok:true, mensaje:'Usuario eliminado' });
    }
  }
  return R({ ok:false, error:'Usuario no encontrado' });
}

function toggleEstado(body) {
  if (!esAdmin(body)) return R({ ok:false, error:'Sin permisos de administrador' });

  var id    = String(body.id || '').trim();
  var hoja  = hojaUsuarios();
  var datos = hoja.getDataRange().getValues();
  var E     = idx(datos[0]);

  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][E.id]||'').trim() === id) {
      var actual = String(datos[i][E.estado]||'activo');
      var nuevo  = actual === 'activo' ? 'inactivo' : 'activo';
      hoja.getRange(i+1, E.estado+1).setValue(nuevo);
      return R({ ok:true, nuevoEstado:nuevo });
    }
  }
  return R({ ok:false, error:'Usuario no encontrado' });
}

// ═══════════════════════════════════════════════════════════════
// REGISTROS PCI
// ═══════════════════════════════════════════════════════════════
function getRegistros(filtroEBS) {
  try {
    var libro = SpreadsheetApp.getActiveSpreadsheet();
    var hoja  = libro.getSheetByName(H_REGISTROS);
    if (!hoja || hoja.getLastRow() <= 1) return R({ ok:true, registros:[], total:0 });

    var datos = hoja.getDataRange().getValues();
    var enc   = datos[0];
    var lista = [];

    for (var i = 1; i < datos.length; i++) {
      var fila = {};
      for (var j = 0; j < enc.length; j++) fila[enc[j]] = datos[i][j];
      if (!filtroEBS || fila['codigo_ebs'] === filtroEBS) lista.push(fila);
    }
    return R({ ok:true, registros:lista, total:lista.length });
  } catch(err) {
    logErr(err,'getRegistros');
    return R({ ok:false, error:String(err) });
  }
}

function guardarRegistro(datos) {
  try {
    var libro = SpreadsheetApp.getActiveSpreadsheet();
    var hoja  = libro.getSheetByName(H_REGISTROS);
    if (!hoja) hoja = libro.insertSheet(H_REGISTROS);

    if (hoja.getLastRow() === 0) {
      var enc = buildEncPCI(datos);
      hoja.appendRow(enc);
      fmtCabecera(hoja, enc.length);
    }

    var numCols  = hoja.getLastColumn();
    var encActual = hoja.getRange(1,1,1,numCols).getValues()[0];

    // Agregar columnas nuevas de intervenciones
    Object.keys(datos).forEach(function(k) {
      if (k !== 'action' && k !== '_action' && encActual.indexOf(k) < 0) {
        encActual.push(k);
        var c = hoja.getRange(1, encActual.length);
        c.setValue(k); c.setBackground('#1e40af'); c.setFontColor('#fff'); c.setFontWeight('bold');
      }
    });

    var fila = encActual.map(function(col) {
      var v = datos[col]; return (v===undefined||v===null)?'':v;
    });
    hoja.appendRow(fila);
    if (hoja.getLastRow() <= 20) { try { hoja.autoResizeColumns(1, Math.min(encActual.length,30)); } catch(e){} }

    return R({ ok:true, id:datos._id||'', fila:hoja.getLastRow() });
  } catch(err) {
    logErr(err,'guardarRegistro');
    return R({ ok:false, error:String(err) });
  }
}

function guardarLote(datos) {
  var lista = datos.registros || [];
  var ok=0, fail=0;
  lista.forEach(function(r){ try{ guardarRegistro(r); ok++; } catch(e){ logErr(e,'lote'); fail++; } });
  return R({ ok:true, guardados:ok, fallidos:fail });
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

// Retorna objeto {columna: índice} para acceso rápido por nombre
function idx(encabezados) {
  var m = {};
  encabezados.forEach(function(col, i) { m[col] = i; });
  return m;
}

function hojaUsuarios() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja  = libro.getSheetByName(H_USUARIOS);
  if (!hoja) {
    hoja = libro.insertSheet(H_USUARIOS);
    hoja.appendRow(COLS_USR);
    fmtCabecera(hoja, COLS_USR.length);
    // Admin por defecto: usuario=admin, contraseña=admin123
    // SHA-256('admin123') en minúsculas:
    var hashAdmin = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
    hoja.appendRow([
      'usr_admin_default', 'Administrador', 'admin',
      hashAdmin, 'admin', 'ADMIN', 'activo',
      new Date().toISOString(), ''
    ]);
  }
  return hoja;
}

function buildEncPCI(datos) {
  var extras = Object.keys(datos).filter(function(k) {
    return COLS_PCI_FIJAS.indexOf(k) < 0 && k !== 'action' && k !== '_action';
  }).sort();
  return COLS_PCI_FIJAS.concat(extras);
}

function fmtCabecera(hoja, n) {
  if (n < 1) return;
  try {
    var r = hoja.getRange(1,1,1,n);
    r.setBackground('#0f4c81'); r.setFontColor('#fff');
    r.setFontWeight('bold');    r.setFontSize(9);
    hoja.setFrozenRows(1);
  } catch(e){}
}

function logErr(err, ctx) {
  try {
    var libro = SpreadsheetApp.getActiveSpreadsheet();
    var hoja  = libro.getSheetByName(H_ERRORES);
    if (!hoja) { hoja = libro.insertSheet(H_ERRORES); hoja.appendRow(['Timestamp','Contexto','Error']); fmtCabecera(hoja,3); }
    hoja.appendRow([new Date().toISOString(), ctx||'', String(err)]);
  } catch(e){}
}

// ═══════════════════════════════════════════════════════════════
// PRUEBAS (ejecutar manualmente desde el editor de Apps Script)
// ═══════════════════════════════════════════════════════════════

function testPing() {
  Logger.log(doGet({ parameter:{ action:'ping' } }).getContent());
}

// Ejecutar esto si la hoja de Usuarios está vacía o corrupta
function testCrearAdmin() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  // Eliminar hoja existente para recrearla limpia
  var hojaVieja = libro.getSheetByName(H_USUARIOS);
  if (hojaVieja) libro.deleteSheet(hojaVieja);
  hojaUsuarios(); // esto la recrea con el admin por defecto
  Logger.log('Hoja Usuarios recreada. Admin: admin / admin123');
}

function testLogin() {
  // SHA-256 de 'admin123'
  var hash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
  var res  = doPost({ postData:{ contents: JSON.stringify({ action:'login', usuario:'admin', passwordHash:hash }) } });
  Logger.log('LOGIN: ' + res.getContent());
}

function testListarUsuarios() {
  var hash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
  var res  = doPost({ postData:{ contents: JSON.stringify({
    action:'listar_usuarios',
    _adminId:'usr_admin_default',
    _adminToken: hash
  }) } });
  Logger.log('LISTAR: ' + res.getContent());
}

function testCrearUsuario() {
  var hashAdmin = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
  // SHA-256 de 'enfermera123' — cámbialo por el hash real si quieres otra contraseña
  var hashNuevo = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
  var res = doPost({ postData:{ contents: JSON.stringify({
    action:'crear_usuario',
    _adminId:'usr_admin_default',
    _adminToken: hashAdmin,
    nombre:'Enfermera Prueba',
    usuario:'enfermera01',
    passwordHash: hashNuevo,
    rol:'usuario',
    codigoEBS:'EBS-001',
    estado:'activo'
  }) } });
  Logger.log('CREAR: ' + res.getContent());
}

function testGuardarRegistro() {
  var res = doPost({ postData:{ contents: JSON.stringify({
    action:'guardar_registro',
    _id:'TEST_'+Date.now(),
    _timestamp: new Date().toISOString(),
    _status:'Sincronizado',
    _sincronizado:'Sí',
    _usuario:'admin',
    fecha_atencion:'2025-04-14',
    eps:'Coosalud',
    nombre_apellido:'Paciente Prueba',
    documento:'1234567',
    municipio:'Ábrego',
    codigo_ebs:'EBS-001',
    ciclo_vital:'adultez',
    ciclo_vital_label:'Adultez',
    adu_consulta_med:'Sí'
  }) } });
  Logger.log('REGISTRO: ' + res.getContent());
}
