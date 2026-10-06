// POST /api/lead — validates a quote / maintenance request and forwards it to Google Apps Script,
// which appends the row to the "Leads" tab and sends the confirmation email.
const str = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
const num = (v, max = 1e9) => Math.min(Math.max(Number(v) || 0, 0), max);
const TIPOS = ['residencial', 'industrial', 'mantenimiento'];

// Every response carries a trace ("traza"): one entry per pipeline step with ok / code / customer-safe detail.
// Raw error text never goes to the browser; it is logged here (Vercel logs) and in the "Bitacora" tab of the sheet.
const invalido = (res, msg) => res.status(400).json({ ok: false, error: msg, codigo: 'E-VAL', traza: [{ paso: 'validacion', ok: false, codigo: 'E-VAL', detalle: msg }] });

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  if (b.website) return res.status(200).json({ ok: true, folio: 'JC-000000' }); // honeypot: bots fill it

  const lead = {
    tipo: TIPOS.includes(b.tipo) ? b.tipo : null,
    nombre: str(b.nombre, 100), correo: str(b.correo, 120).toLowerCase(), telefono: str(b.telefono, 20),
    estado: str(b.estado, 40), colonia: str(b.colonia, 100),
  };
  if (!lead.tipo || !lead.nombre || !lead.estado || !lead.colonia || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.correo)) {
    return invalido(res, 'Faltan datos: nombre, correo válido, estado y colonia.');
  }

  if (b.acepta_aviso !== true) return invalido(res, 'Debes aceptar el aviso de privacidad.');
  lead.acepta_aviso = 'Sí, ' + new Date().toISOString();

  if (lead.tipo === 'mantenimiento') {
    const m = b.mantenimiento || {};
    lead.mantenimiento = { segmento: m.segmento === 'Industrial' ? 'Industrial' : 'Residencial', modelo: str(m.modelo, 120), problema: str(m.problema, 1500) };
    if (!lead.mantenimiento.modelo || !lead.mantenimiento.problema) return invalido(res, 'Indica el modelo y el problema del equipo.');
    const f = m.foto;
    if (f && typeof f.dataUrl === 'string' && /^data:image\/jpeg;base64,/.test(f.dataUrl) && f.dataUrl.length < 3_500_000) {
      lead.mantenimiento.foto = { nombre: str(f.nombre, 80), base64: f.dataUrl.split(',')[1] };
    }
  } else {
    const m = b.medidas || {};
    lead.medidas = { largo: num(m.largo, 1000), ancho: num(m.ancho, 1000), alto: num(m.alto, 100), volumen: num(m.volumen, 1e7), porVolumen: !!m.porVolumen };
    lead.uso = str(b.uso, 80);
    lead.personas = num(b.personas, 100000);
    lead.btu = num(b.btu, 1e9);
    if (!lead.btu || !lead.medidas.volumen) return invalido(res, 'Faltan las medidas del espacio.');
    lead.opciones = (Array.isArray(b.opciones) ? b.opciones : []).slice(0, 3).map((o) => ({
      etiqueta: str(o.etiqueta, 20), id: str(o.id, 20), marca: str(o.marca, 60), modelo: str(o.modelo, 80), tipo: str(o.tipo, 60),
      capacidad_btu: num(o.capacidad_btu), cantidad: num(o.cantidad, 99), precio_unitario: num(o.precio_unitario), total: num(o.total, 1e10),
    }));
  }

  const d = new Date();
  lead.folio = `JC-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // Timestamps: browser steps (sent by the page, accepted only if within the last hour) + this function's own.
  const ahora = () => new Date().toISOString();
  const iso = (v) => { const t = new Date(v); return isNaN(t) || Math.abs(Date.now() - t) > 3600e3 ? null : t.toISOString(); };
  const horas = b.horas || {};
  const previos = ['formulario', 'calculo', 'equipos']
    .filter((k) => k === 'formulario' || lead.tipo !== 'mantenimiento')
    .map((k) => ({ paso: k, hora: iso(horas[k]) })).filter((p) => p.hora);
  const traza = [{ paso: 'validacion', ok: true, detalle: 'Datos completos', hora: ahora() }, { paso: 'folio', ok: true, detalle: lead.folio, hora: ahora() }];
  previos.push({ paso: 'validacion', hora: traza[0].hora }, { paso: 'folio', hora: traza[1].hora, detalle: lead.folio });
  const teniaFoto = !!(lead.mantenimiento && lead.mantenimiento.foto);
  const responder = (status, ok, interno) => {
    const codigo = (traza.find((t) => !t.ok && t.paso !== 'aviso') || {}).codigo;
    console.log(JSON.stringify({ evento: 'lead', folio: lead.folio, tipo: lead.tipo, ok, codigo, traza, interno }));
    return res.status(status).json({ ok, folio: lead.folio, codigo, traza });
  };
  const falla = (codigo, detalle) => traza.push({ paso: 'registro', ok: false, codigo, detalle, hora: ahora() });

  const url = process.env.APPS_SCRIPT_URL;
  if (!url) { falla('E-CFG', 'El servidor no tiene configurada la conexión con la hoja de cálculo.'); return responder(503, false, 'APPS_SCRIPT_URL missing'); }

  const t0 = Date.now();
  let texto;
  try {
    const r = await fetch(url, {
      method: 'POST', redirect: 'follow', signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script reads the raw body
      body: JSON.stringify({ token: process.env.SHEETS_TOKEN || '', lead, previos }),
    });
    texto = await r.text();
  } catch (err) {
    falla('E-RED', 'Google Apps Script no respondió a tiempo.');
    return responder(502, false, err.message);
  }
  const ms = Date.now() - t0;

  let j;
  try { j = JSON.parse(texto); } catch (err) {
    falla('E-ACCESO', 'Google rechazó la conexión: la implementación de Apps Script no es pública o la URL no es la correcta.');
    return responder(502, false, texto.slice(0, 200));
  }
  if (!j.ok && (j.codigo === 'E-TOKEN' || j.error === 'unauthorized')) {
    falla('E-TOKEN', 'La clave del servidor no coincide con la de Apps Script.');
    return responder(502, false, 'unauthorized');
  }

  // Older Code.gs versions answer without "pasos": treat ok as "row saved and email sent".
  const p = j.pasos || (j.ok ? { hoja: { ok: true }, correo_cliente: { ok: true } } : { hoja: { ok: false, error: j.error } });
  const hojaOk = !!(p.hoja && p.hoja.ok);
  if (teniaFoto) {
    const ok = !(p.foto && p.foto.ok === false);
    traza.push({ paso: 'foto', ok, codigo: ok ? undefined : 'E-FOTO', detalle: ok ? 'Foto guardada' : 'La foto no se pudo guardar; el resto de la solicitud sigue su curso.', hora: (p.foto && p.foto.hora) || ahora() });
  }
  traza.push({ paso: 'registro', ok: hojaOk, codigo: hojaOk ? undefined : 'E-HOJA', detalle: hojaOk ? 'Solicitud guardada' : 'No se pudo escribir en la hoja de cálculo.', ms, hora: (p.hoja && p.hoja.hora) || ahora() });
  if (p.correo_cliente) {
    const ok = !!p.correo_cliente.ok;
    traza.push({ paso: 'correo', ok, codigo: ok ? undefined : 'E-CORREO', detalle: ok ? 'Enviado a ' + lead.correo : 'El correo de confirmación no pudo enviarse.', hora: p.correo_cliente.hora || ahora() });
  }
  if (p.correo_ventas) traza.push({ paso: 'aviso', ok: !!p.correo_ventas.ok, codigo: p.correo_ventas.ok ? undefined : 'E-AVISO', detalle: p.correo_ventas.ok ? 'Aviso enviado a ventas' : 'El aviso interno a ventas no salió.', hora: p.correo_ventas.hora || ahora() });
  return responder(hojaOk ? 200 : 502, hojaOk, j.pasos || j.error);
};
