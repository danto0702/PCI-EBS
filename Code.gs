// ============================================================
// Google Apps Script – doPost()
// PCI App – ESE Hospital Regional Noroccidental
// Resolución 3280 de 2018
//
// INSTRUCCIONES DE DESPLIEGUE:
// 1. En Google Sheets: Extensiones → Apps Script
// 2. Pegar este código y guardar
// 3. Implementar → Nueva implementación
//    - Tipo: Aplicación web
//    - Ejecutar como: Yo (tu cuenta)
//    - Quién tiene acceso: Cualquier persona
// 4. Copiar la URL de implementación y pegarla en app.js (GAS_URL)
// ============================================================

// Nombre de la hoja de cálculo donde se guardarán los datos
var SHEET_NAME = 'PCI_Registros';

// ─── CORS HEADERS ────────────────────────────────────────────
function setCORSHeaders(output) {
  return output
    .addHeader('Access-Control-Allow-Origin', '*')
    .addHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    .addHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ─── GET (health check) ───────────────────────────────────────
function doGet(e) {
  var output = ContentService.createTextOutput(
    JSON.stringify({ status: 'ok', message: 'PCI App API activa', timestamp: new Date().toISOString() })
  ).setMimeType(ContentService.MimeType.JSON);
  return setCORSHeaders(output);
}

// ─── POST (recibir registro) ──────────────────────────────────
function doPost(e) {
  try {
    // Parsear el JSON recibido
    var rawData = e.postData ? e.postData.contents : '{}';
    var data = JSON.parse(rawData);

    // Obtener o crear la hoja
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      // La cabecera se crea automáticamente con el primer registro
    }

    // Si la hoja está vacía, crear encabezados
    if (sheet.getLastRow() === 0) {
      var headers = buildHeaders(data);
      sheet.appendRow(headers);
      // Estilo para encabezados
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground('#0f4c81')
                 .setFontColor('#ffffff')
                 .setFontWeight('bold')
                 .setFontSize(9);
      sheet.setFrozenRows(1);
    }

    // Construir la fila de datos en el mismo orden que los encabezados
    var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var row = existingHeaders.map(function(h) {
      return data.hasOwnProperty(h) ? data[h] : '';
    });

    // Agregar fila
    sheet.appendRow(row);

    // Auto-ajustar columnas (solo primera vez, no impacta rendimiento)
    if (sheet.getLastRow() <= 5) {
      sheet.autoResizeColumns(1, sheet.getLastColumn());
    }

    // Respuesta exitosa
    var response = ContentService.createTextOutput(
      JSON.stringify({
        status: 200,
        success: true,
        message: 'Registro guardado correctamente',
        id: data._id || '',
        timestamp: new Date().toISOString(),
        row: sheet.getLastRow()
      })
    ).setMimeType(ContentService.MimeType.JSON);

    return setCORSHeaders(response);

  } catch (err) {
    // Loguear el error en la hoja de logs
    logError(err, e);

    var errorResponse = ContentService.createTextOutput(
      JSON.stringify({
        status: 500,
        success: false,
        message: 'Error al procesar el registro',
        error: err.toString()
      })
    ).setMimeType(ContentService.MimeType.JSON);

    return setCORSHeaders(errorResponse);
  }
}

// ─── HELPERS ──────────────────────────────────────────────────

/**
 * Construye la lista de encabezados a partir de las claves del primer registro.
 * Los campos fijos siempre van primero, luego las intervenciones.
 */
function buildHeaders(data) {
  // Campos fijos en orden lógico
  var fixed = [
    '_id', '_timestamp', '_status',
    'fecha_atencion', 'eps', 'nombre_apellido', 'documento',
    'fecha_nacimiento', 'edad', 'direccion', 'celular',
    'municipio', 'codigo_microterritorio', 'codigo_familia',
    'ciclo_vital', 'ciclo_vital_label', 'otras_intervenciones'
  ];

  // Campos de intervenciones (todos los que no están en fixed y no empiezan con _)
  var interv = Object.keys(data).filter(function(k) {
    return fixed.indexOf(k) === -1 && !k.startsWith('_');
  }).sort();

  return fixed.concat(interv);
}

/**
 * Registra errores en una hoja separada para auditoría.
 */
function logError(err, e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName('ErrorLog') || ss.insertSheet('ErrorLog');
    if (logSheet.getLastRow() === 0) {
      logSheet.appendRow(['Timestamp', 'Error', 'PostData']);
    }
    logSheet.appendRow([
      new Date().toISOString(),
      err.toString(),
      e.postData ? e.postData.contents : 'N/A'
    ]);
  } catch (logErr) {
    console.error('Error al loguear:', logErr);
  }
}

// ─── FUNCIÓN AUXILIAR: SINCRONIZACIÓN MASIVA (opcional) ──────
/**
 * Puedes llamar esta función manualmente desde el editor de Scripts
 * para procesar un JSON de múltiples registros a la vez.
 */
function procesarLote(registros) {
  registros.forEach(function(registro) {
    doPost({ postData: { contents: JSON.stringify(registro) } });
  });
}
