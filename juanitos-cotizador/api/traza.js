// GET /api/traza?folio=JC-AAMMDD-XXXX — timeline of one request, read from the "Bitacora" tab.
// Returns step, result and time only: no customer data.
module.exports = async (req, res) => {
  const folio = String(new URL(req.url, 'http://x').searchParams.get('folio') || '').trim().toUpperCase();
  if (!/^JC-\d{6}-[A-Z0-9]{4}$/.test(folio)) return res.status(400).json({ ok: false, codigo: 'E-VAL', error: 'El folio tiene la forma JC-000000-XXXX.' });
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) return res.status(503).json({ ok: false, codigo: 'E-CFG', error: 'El servidor no tiene configurada la conexión con la hoja de cálculo.' });
  try {
    const r = await fetch(`${url}?action=traza&folio=${encodeURIComponent(folio)}&token=${encodeURIComponent(process.env.SHEETS_TOKEN || '')}`, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    let j = null;
    try { j = JSON.parse(await r.text()); } catch (e) { /* HTML page */ }
    if (!j) return res.status(502).json({ ok: false, codigo: 'E-ACCESO', error: 'Google rechazó la conexión con Apps Script.' });
    if (!j.ok) return res.status(502).json({ ok: false, codigo: j.error === 'unauthorized' ? 'E-TOKEN' : 'E-HOJA', error: 'Apps Script no pudo leer la bitácora.' });
    if (!j.traza) return res.status(502).json({ ok: false, codigo: 'E-VERSION', error: 'Apps Script corre una versión anterior de Code.gs.' });
    return res.status(200).json({ ok: true, folio, pasos: j.pasos });
  } catch (err) {
    return res.status(502).json({ ok: false, codigo: 'E-RED', error: 'Google Apps Script no respondió a tiempo.' });
  }
};
