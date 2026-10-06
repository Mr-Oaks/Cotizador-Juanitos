// GET /api/health — configuration and connectivity checks, shown at /estado.html. Returns no secrets.
module.exports = async (req, res) => {
  const checks = [];
  const add = (id, nombre, ok, detalle, codigo) => checks.push({ id, nombre, ok, detalle, codigo: ok ? undefined : codigo });

  const url = process.env.APPS_SCRIPT_URL || '';
  const urlOk = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url);
  add('url', 'Variable APPS_SCRIPT_URL', urlOk, !url ? 'Falta en Vercel.' : urlOk ? 'Configurada.' : 'No tiene la forma https://script.google.com/macros/s/…/exec', 'E-CFG');
  add('token', 'Variable SHEETS_TOKEN', !!process.env.SHEETS_TOKEN, process.env.SHEETS_TOKEN ? 'Configurada.' : 'Falta en Vercel.', 'E-CFG');

  if (url) {
    const t0 = Date.now();
    try {
      const r = await fetch(`${url}?action=ping&token=${encodeURIComponent(process.env.SHEETS_TOKEN || '')}`, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      const texto = await r.text();
      let j = null;
      try { j = JSON.parse(texto); } catch (e) { /* HTML: login or error page */ }
      const ms = Date.now() - t0;
      if (!j) add('apps', 'Conexión con Apps Script', false, 'Google devolvió una página en lugar de datos: la implementación no tiene acceso "Cualquier usuario" o la URL no es la de /exec.', 'E-ACCESO');
      else if (!j.ok && j.error === 'unauthorized') add('apps', 'Conexión con Apps Script', false, 'Apps Script responde, pero SHEETS_TOKEN no coincide con la propiedad TOKEN.', 'E-TOKEN');
      else if (!j.ok) add('apps', 'Conexión con Apps Script', false, 'Apps Script respondió con un error al abrir la hoja. Revisa la pestaña Bitacora o las ejecuciones del script.', 'E-HOJA');
      else if (!j.ping) add('apps', 'Conexión con Apps Script', true, `Responde en ${ms} ms, pero con una versión anterior de Code.gs: pega la nueva y publica una nueva versión de la implementación.`);
      else {
        add('apps', 'Conexión con Apps Script', true, `Responde en ${ms} ms.`);
        add('hojas', 'Pestañas Equipos y Leads', j.hojas.equipos && j.hojas.leads, j.hojas.equipos && j.hojas.leads ? 'Las dos existen.' : `Falta la pestaña ${j.hojas.equipos ? 'Leads' : 'Equipos'}.`, 'E-HOJA');
        add('catalogo', 'Catálogo en la hoja', j.equipos > 0, j.equipos > 0 ? `${j.equipos} equipos.` : 'La pestaña Equipos está vacía: la página usa el catálogo de respaldo.', 'A-CATALOGO');
        add('correo', 'Cuota de correo de hoy', j.cuota_correo > 1, `${j.cuota_correo} envíos disponibles.`, 'E-CORREO');
      }
    } catch (err) {
      add('apps', 'Conexión con Apps Script', false, 'No respondió a tiempo.', 'E-RED');
    }
  }

  const proveedor = (process.env.LLM_PROVIDER || 'none').toLowerCase();
  add('chat', 'Asistente del chat', true, proveedor === 'none' ? 'Responde con reglas fijas (modelo por definir).' : `Proveedor: ${proveedor}.`);

  res.setHeader('Cache-Control', 's-maxage=60');
  res.status(200).json({ ok: checks.every((c) => c.ok), fecha: new Date().toISOString(), checks });
};
