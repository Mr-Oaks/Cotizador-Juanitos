// POST /api/lead — validates a quote / maintenance request and forwards it to Google Apps Script,
// which appends the row to the "Leads" tab and sends the confirmation email.
const str = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
const num = (v, max = 1e9) => Math.min(Math.max(Number(v) || 0, 0), max);
const TIPOS = ['residencial', 'industrial', 'mantenimiento'];

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
    return res.status(400).json({ ok: false, error: 'Faltan datos: nombre, correo válido, estado y colonia.' });
  }

  if (b.acepta_aviso !== true) return res.status(400).json({ ok: false, error: 'Debes aceptar el aviso de privacidad.' });
  lead.acepta_aviso = 'Sí, ' + new Date().toISOString();

  if (lead.tipo === 'mantenimiento') {
    const m = b.mantenimiento || {};
    lead.mantenimiento = { segmento: m.segmento === 'Industrial' ? 'Industrial' : 'Residencial', modelo: str(m.modelo, 120), problema: str(m.problema, 1500) };
    if (!lead.mantenimiento.modelo || !lead.mantenimiento.problema) return res.status(400).json({ ok: false, error: 'Indica el modelo y el problema del equipo.' });
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
    if (!lead.btu || !lead.medidas.volumen) return res.status(400).json({ ok: false, error: 'Faltan las medidas del espacio.' });
    lead.opciones = (Array.isArray(b.opciones) ? b.opciones : []).slice(0, 3).map((o) => ({
      etiqueta: str(o.etiqueta, 20), id: str(o.id, 20), marca: str(o.marca, 60), modelo: str(o.modelo, 80), tipo: str(o.tipo, 60),
      capacidad_btu: num(o.capacidad_btu), cantidad: num(o.cantidad, 99), precio_unitario: num(o.precio_unitario), total: num(o.total, 1e10),
    }));
  }

  const d = new Date();
  lead.folio = `JC-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const url = process.env.APPS_SCRIPT_URL;
  if (!url) return res.status(503).json({ ok: false, error: 'APPS_SCRIPT_URL is not configured' });

  try {
    const r = await fetch(url, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script reads the raw body
      body: JSON.stringify({ token: process.env.SHEETS_TOKEN || '', lead }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Apps Script error');
    return res.status(200).json({ ok: true, folio: lead.folio });
  } catch (err) {
    console.error('Lead not saved:', err.message, JSON.stringify({ ...lead, mantenimiento: lead.mantenimiento && { ...lead.mantenimiento, foto: undefined } }));
    return res.status(502).json({ ok: false, error: 'No se pudo registrar la solicitud.' });
  }
};
