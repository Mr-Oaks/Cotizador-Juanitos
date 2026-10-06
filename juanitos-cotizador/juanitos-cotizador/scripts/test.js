const assert = require('assert');
const { calcResidencial, calcIndustrial, sugerir } = require('../public/app.js');
const equipos = require('../data/equipos.json');
const show = (t, btu, ops) => console.log(t, btu, 'BTU/h →', ops.map((o) => `${o.etiqueta}: ${o.cantidad}× ${o.marca} ${o.modelo} ($${o.total})`).join(' | '));

let btu = calcResidencial({ volumen: 4 * 3.5 * 2.5, estado: 'Ciudad de México', espacio: 'recamara', personas: 2 });
assert.strictEqual(btu, 6000); show('Recámara CDMX', btu, sugerir(equipos, 'Residencial', btu));
btu = calcResidencial({ volumen: 6 * 5 * 2.7, estado: 'Sonora', espacio: 'cocina', personas: 5, sol: true });
show('Sala-cocina Sonora', btu, sugerir(equipos, 'Residencial', btu));
for (const [uso, vol, p, kw] of [['auditorio', 20 * 15 * 6, 300, 10], ['farma', 12 * 10 * 3, 15, 20], ['foro_tv', 25 * 20 * 8, 60, 80], ['oficinas', 10 * 8 * 2.7, 20, 5]]) {
  btu = calcIndustrial({ volumen: vol, estado: 'Estado de México', uso, personas: p, kw });
  const ops = sugerir(equipos, 'Industrial', btu, uso);
  assert.strictEqual(ops.length, 3); assert.strictEqual(new Set(ops.map((o) => o.id)).size, 3);
  ops.forEach((o) => assert.ok(o.cantidad * o.capacidad_btu >= btu * 0.95));
  show(uso, btu, ops);
}
console.log('OK');
