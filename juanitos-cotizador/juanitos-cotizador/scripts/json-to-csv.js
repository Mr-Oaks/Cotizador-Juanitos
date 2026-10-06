// Regenerates data/equipos.csv from data/equipos.json (import the CSV into the "Equipos" tab).
const fs = require('fs'), path = require('path');
const rows = require('../data/equipos.json');
const cols = ['id','segmento','tipo','marca','modelo','capacidad_btu','toneladas','voltaje','precio_min_mxn','precio_max_mxn','precio_promedio_mxn','nivel','aplicaciones','fuente_precio','notas','activo'];
const q = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const out = [cols.join(',')].concat(rows.map(r => cols.map(c => q(c === 'toneladas' ? +(r.capacidad_btu / 12000).toFixed(1) : r[c])).join(',')));
fs.writeFileSync(path.join(__dirname, '../data/equipos.csv'), '\uFEFF' + out.join('\n') + '\n');
console.log('equipos.csv:', rows.length, 'rows');
