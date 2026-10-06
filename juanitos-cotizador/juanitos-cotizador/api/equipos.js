// GET /api/equipos — equipment catalog from Google Sheets (via Apps Script), with a bundled fallback.
const fallback = require('../data/equipos.json');

const NUMERIC = ['capacidad_btu', 'precio_min_mxn', 'precio_max_mxn', 'precio_promedio_mxn'];

function normalize(rows) {
  return rows
    .map((r) => {
      const o = { ...r };
      NUMERIC.forEach((k) => { o[k] = Number(String(o[k]).replace(/[^\d.]/g, '')) || 0; });
      o.segmento = /^ind/i.test(String(o.segmento)) ? 'Industrial' : 'Residencial';
      return o;
    })
    .filter((o) => o.id && o.capacidad_btu > 0 && o.precio_promedio_mxn > 0 && String(o.activo || 'SI').toUpperCase() !== 'NO');
}

async function loadEquipos() {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) return { equipos: normalize(fallback), source: 'fallback' };
  try {
    const r = await fetch(`${url}?action=equipos&token=${encodeURIComponent(process.env.SHEETS_TOKEN || '')}`, { redirect: 'follow' });
    const j = await r.json();
    const equipos = normalize(j.equipos || []);
    if (!j.ok || !equipos.length) throw new Error(j.error || 'empty sheet');
    return { equipos, source: 'sheets' };
  } catch (err) {
    console.error('Sheets read failed, using fallback:', err.message);
    return { equipos: normalize(fallback), source: 'fallback' };
  }
}

module.exports = async (req, res) => {
  const data = await loadEquipos();
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  res.status(200).json(data);
};
module.exports.loadEquipos = loadEquipos;
