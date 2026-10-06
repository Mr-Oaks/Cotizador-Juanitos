/**
 * Juanitos Corporation — Google Sheets bridge.
 * Paste into the spreadsheet (Extensions > Apps Script) or into a standalone project at script.google.com.
 * Then Deploy > New deployment > Web app (Execute as: Me · Who has access: Anyone) and copy the /exec URL
 * into Vercel as APPS_SCRIPT_URL.
 *
 * Script properties (Project Settings > Script properties):
 *   SHEET_ID       ID of the spreadsheet to use: the part of its URL between /d/ and /edit.
 *                  Optional when the script lives inside that spreadsheet.
 *   TOKEN          same value as SHEETS_TOKEN in Vercel
 *   CORREO_VENTAS  inbox that receives each new lead (optional; defaults to the script owner)
 */
const CONFIG = {
  HOJA_EQUIPOS: 'Equipos',
  HOJA_LEADS: 'Leads',
  EMPRESA: 'Juanitos Corporation',
  CARPETA_FOTOS: 'Juanitos - Fotos de mantenimiento',
  COSTO_VISITA: '$1,000 MXN',
  TELEFONO: '55 22 23 24 25',
  HORARIO: 'lunes a sábado, de 9:00 a 19:00',
  COBERTURA: 'Ciudad de México y área metropolitana',
};
const COLUMNAS_LEADS = ['fecha', 'folio', 'tipo', 'nombre', 'correo', 'telefono', 'estado', 'colonia', 'medidas', 'volumen_m3', 'uso', 'personas',
  'btu_requeridos', 'toneladas', 'opcion_economica', 'opcion_recomendada', 'opcion_premium', 'equipo_mantenimiento', 'modelo', 'problema', 'foto_url', 'estatus', 'acepto_aviso', 'datos_json'];

function libro() {
  const id = prop('SHEET_ID');
  const l = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!l) throw new Error('Falta la propiedad SHEET_ID');
  return l;
}
const prop = (k) => PropertiesService.getScriptProperties().getProperty(k);
const json = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const autorizado = (t) => { const s = prop('TOKEN'); return !s || t === s; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const celda = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v); // no formulas from user input
const pesos = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' MXN';
const miles = (n) => Number(n || 0).toLocaleString('en-US');

function doGet(e) {
  if (!autorizado(e.parameter.token)) return json({ ok: false, error: 'unauthorized' });
  try { return json({ ok: true, equipos: leerEquipos() }); } catch (err) { return json({ ok: false, error: String(err) }); }
}

function leerEquipos() {
  const hoja = libro().getSheetByName(CONFIG.HOJA_EQUIPOS);
  if (!hoja) throw new Error('No existe la pestaña ' + CONFIG.HOJA_EQUIPOS);
  const valores = hoja.getDataRange().getValues();
  const encabezados = valores.shift().map((h) => String(h).trim().toLowerCase());
  return valores.filter((f) => String(f[0]).trim() !== '').map((f) => {
    const o = {}; encabezados.forEach((h, i) => { if (h) o[h] = f[i]; }); return o;
  });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!autorizado(body.token)) return json({ ok: false, error: 'unauthorized' });
    const lead = body.lead;
    const fotoUrl = guardarFoto(lead);
    if (lead.mantenimiento) delete lead.mantenimiento.foto;
    guardarLead(lead, fotoUrl);
    enviarCorreos(lead, fotoUrl);
    return json({ ok: true, folio: lead.folio });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function guardarFoto(lead) {
  const foto = lead.mantenimiento && lead.mantenimiento.foto;
  if (!foto || !foto.base64) return '';
  const carpetas = DriveApp.getFoldersByName(CONFIG.CARPETA_FOTOS);
  const carpeta = carpetas.hasNext() ? carpetas.next() : DriveApp.createFolder(CONFIG.CARPETA_FOTOS);
  const blob = Utilities.newBlob(Utilities.base64Decode(foto.base64), 'image/jpeg', lead.folio + '.jpg');
  return carpeta.createFile(blob).getUrl();
}

function textoOpcion(o) {
  return o ? (o.cantidad > 1 ? o.cantidad + ' x ' : '') + o.marca + ' ' + o.modelo + ' (' + miles(o.capacidad_btu) + ' BTU) ' + pesos(o.total) : '';
}

function guardarLead(lead, fotoUrl) {
  const doc = libro();
  const hoja = doc.getSheetByName(CONFIG.HOJA_LEADS) || doc.insertSheet(CONFIG.HOJA_LEADS);
  if (hoja.getLastRow() === 0) hoja.setFrozenRows(1);
  hoja.getRange(1, 1, 1, COLUMNAS_LEADS.length).setValues([COLUMNAS_LEADS]);
  const m = lead.medidas || {}, mt = lead.mantenimiento || {}, ops = lead.opciones || [];
  const op = (et) => textoOpcion(ops.filter((o) => o.etiqueta === et)[0]);
  const fila = [
    new Date(), lead.folio, lead.tipo, lead.nombre, lead.correo, lead.telefono, lead.estado, lead.colonia,
    lead.medidas ? (m.porVolumen ? 'Volumen directo' : m.largo + ' x ' + m.ancho + ' x ' + m.alto + ' m') : '',
    m.volumen || '', lead.uso || '', lead.personas || '', lead.btu || '', lead.btu ? Math.round(lead.btu / 1200) / 10 : '',
    op('Económica'), op('Recomendada'), op('Premium'), mt.segmento || '', mt.modelo || '', mt.problema || '', fotoUrl, 'Nuevo', lead.acepta_aviso || '', JSON.stringify(lead),
  ];
  hoja.appendRow(fila.map(celda));
}

function enviarCorreos(lead, fotoUrl, soloCliente) {
  const ventas = prop('CORREO_VENTAS') || Session.getEffectiveUser().getEmail();
  const esMant = lead.tipo === 'mantenimiento';
  const asunto = (esMant ? 'Recibimos tu solicitud de mantenimiento ' : 'Tu cotización de aire acondicionado ') + lead.folio;

  let cuerpo = '';
  if (esMant) {
    const mt = lead.mantenimiento;
    cuerpo = '<p>Registramos tu solicitud de mantenimiento. Un técnico la revisa y te contacta para agendar.</p>' +
      tabla([['Equipo', mt.segmento], ['Marca y modelo', mt.modelo], ['Problema', mt.problema], ['Foto', fotoUrl ? 'Recibida' : 'No adjuntaste foto']]);
  } else {
    cuerpo = '<p>Con las medidas que nos diste, tu espacio necesita abatir <strong>' + miles(lead.btu) + ' BTU/h</strong> (' +
      (Math.round(lead.btu / 1200) / 10) + ' toneladas de refrigeración).</p>' +
      tabla([['Uso', lead.uso], ['Volumen', miles(lead.medidas.volumen) + ' m³'], ['Ubicación', lead.colonia + ', ' + lead.estado]]) +
      '<h3 style="margin:24px 0 8px;color:#124e50">Tus tres opciones</h3>' +
      tabla((lead.opciones || []).map((o) => [o.etiqueta, (o.cantidad > 1 ? o.cantidad + ' × ' : '') + esc(o.marca + ' ' + o.modelo) + '<br><span style="color:#7d8b8d">' +
        esc(o.tipo) + ' · ' + miles(o.capacidad_btu) + ' BTU/h</span><br><strong>' + pesos(o.total) + '</strong>']), true) +
      '<p style="background:#d2e5e2;border-left:5px solid #1f7a78;padding:12px 14px;margin-top:20px"><strong>Instalación.</strong> ' +
      (lead.tipo === 'industrial'
        ? 'En proyectos comerciales e industriales revisamos en sitio qué se necesita hacer y la cotizamos por proyecto. '
        : 'Instalar un equipo residencial ronda los $4,000 MXN e incluye 20 metros de tubería e instalación simple en tablero. ') +
      'Para confirmar el costo hacemos una visita en sitio de ' + CONFIG.COSTO_VISITA + '; si aceptas el servicio, ese importe se descuenta de tu cuenta final. ' +
      'Nuestras instalaciones tienen 2 años de garantía.</p>' +
      '<p style="color:#7d8b8d;font-size:13px">Los precios son promedios de mercado del último año, solo del equipo, y pueden variar. El cálculo es una estimación que se confirma en la visita.</p>';
  }

  const html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#263134;max-width:600px;margin:auto">' +
    '<div style="background:#263134;color:#fff;padding:18px 22px;font-size:20px;font-weight:bold">Juanitos <span style="color:#8fc9c4;font-weight:normal">Corporation</span></div>' +
    '<div style="padding:22px;background:#f5f7f6"><p>Hola ' + esc(lead.nombre) + ':</p>' + cuerpo +
    '<p>Folio: <strong>' + esc(lead.folio) + '</strong>. Para agendar tu visita o resolver dudas, responde a este correo o llámanos al ' + CONFIG.TELEFONO + ', ' + CONFIG.HORARIO + '.</p>' +
    '<p style="color:#7d8b8d;font-size:13px">Cobertura: ' + CONFIG.COBERTURA + '. Fuera de esta zona el servicio se cotiza por separado.</p>' +
    '<p>Gracias por confiar en ' + CONFIG.EMPRESA + '.</p></div></div>';

  MailApp.sendEmail({ to: lead.correo, subject: asunto, htmlBody: html, name: CONFIG.EMPRESA, replyTo: ventas });
  if (soloCliente) return;
  MailApp.sendEmail({
    to: ventas, subject: 'Nuevo lead ' + lead.tipo + ' ' + lead.folio + ' · ' + lead.nombre, name: 'Cotizador ' + CONFIG.EMPRESA, replyTo: lead.correo,
    htmlBody: '<p>' + esc(lead.nombre) + ' · ' + esc(lead.correo) + ' · ' + esc(lead.telefono || 'sin teléfono') + '<br>' + esc(lead.colonia) + ', ' + esc(lead.estado) + '</p>' +
      (fotoUrl ? '<p><a href="' + fotoUrl + '">Ver foto</a></p>' : '') + html,
  });
}

// filas: [etiqueta, valor]. Con html=true el valor ya viene armado y escapado.
function tabla(filas, html) {
  return '<table style="border-collapse:collapse;width:100%;background:#fff">' + filas.map((f) =>
    '<tr><td style="padding:9px 12px;border:1px solid #cfd7d6;color:#7d8b8d;width:32%;vertical-align:top">' + esc(f[0]) +
    '</td><td style="padding:9px 12px;border:1px solid #cfd7d6">' + (html ? f[1] : esc(f[1])) + '</td></tr>').join('') + '</table>';
}

/** Run once from the editor to grant Sheets, Drive and Mail permissions. */
function autorizar() {
  Logger.log('Hoja conectada: ' + libro().getName());
  DriveApp.getRootFolder().getName();
  Logger.log('Cuota de correos restante hoy: ' + MailApp.getRemainingDailyQuota());
}

/** Run from the editor to send yourself a sample confirmation and add a test row to Leads. */
function probarCorreo() {
  const lead = {
    folio: 'JC-PRUEBA', tipo: 'residencial', nombre: 'Cliente de prueba', correo: Session.getEffectiveUser().getEmail(), telefono: '',
    estado: 'Ciudad de México', colonia: 'Centro', uso: 'Recámara', personas: 2, btu: 12000, acepta_aviso: 'Prueba',
    medidas: { largo: 4, ancho: 3.5, alto: 2.5, volumen: 35, porVolumen: false },
    opciones: [{ etiqueta: 'Recomendada', marca: 'Mirage', modelo: 'X5 Inverter 1 TR', tipo: 'Minisplit inverter', capacidad_btu: 12000, cantidad: 1, total: 6300 }],
  };
  guardarLead(lead, '');
  enviarCorreos(lead, '');
}

/**
 * Menú "Juanitos" dentro de la hoja (solo aparece si el script se creó desde Extensiones > Apps Script de esa hoja).
 * Permite enviar o reenviar la cotización de cualquier fila de Leads cuando se requiera.
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Juanitos')
    .addItem('Enviar cotización de la fila seleccionada', 'reenviarCotizacion')
    .addItem('Enviarme un correo de prueba', 'probarCorreo')
    .addToUi();
}

function reenviarCotizacion() {
  const ui = SpreadsheetApp.getUi();
  const hoja = SpreadsheetApp.getActiveSheet();
  const fila = hoja.getActiveCell().getRow();
  if (hoja.getName() !== CONFIG.HOJA_LEADS || fila < 2) { ui.alert('Selecciona una fila de la pestaña ' + CONFIG.HOJA_LEADS + '.'); return; }
  const col = (n) => COLUMNAS_LEADS.indexOf(n);
  const v = hoja.getRange(fila, 1, 1, COLUMNAS_LEADS.length).getValues()[0];
  if (!v[col('datos_json')]) { ui.alert('Esta fila no tiene los datos de la cotización guardados.'); return; }
  const lead = JSON.parse(v[col('datos_json')]);
  lead.correo = String(v[col('correo')]).trim() || lead.correo; // respeta correcciones hechas en la hoja
  lead.nombre = String(v[col('nombre')]).trim() || lead.nombre;
  if (ui.alert('¿Enviar ' + lead.folio + ' a ' + lead.correo + '?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  enviarCorreos(lead, v[col('foto_url')], true);
  hoja.getRange(fila, col('estatus') + 1).setValue('Cotización enviada ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'));
}
