// Rule-based answers used while no LLM provider is configured (LLM_PROVIDER=none) or when the provider fails.
// Keep in sync with wiki/empresa.md.
const C = {
  tel: '55 22 23 24 25',
  horario: 'lunes a sábado de 9:00 a 19:00',
};
const REGLAS = [
  [/horario|abren|cierran|a qu[eé] hora|s[aá]bado|domingo/i, `Atendemos de ${C.horario}.`],
  [/garant/i, 'Damos 2 años de garantía sobre la instalación que realizamos. La garantía del equipo la da el fabricante.'],
  [/visita/i, 'La visita en sitio cuesta $1,000 MXN y, si aceptas el servicio, se descuenta de tu cuenta final.'],
  [/instala/i, 'La instalación de un equipo residencial ronda los $4,000 MXN e incluye 20 metros de tubería y conexión simple al tablero, con 2 años de garantía. En proyectos comerciales e industriales se define después de la visita en sitio.'],
  [/cobertura|zona|d[oó]nde|fuera|for[aá]neo|estado/i, 'Damos servicio en Ciudad de México y área metropolitana. Fuera de esa zona el servicio se cotiza por separado.'],
  [/mantenimiento|falla|no enfr[ií]a|gotea|ruido|error|repara/i, 'Para mantenimiento o fallas usa la pestaña Mantenimiento: indica marca y modelo, el problema y, si puedes, una foto.'],
  [/precio|cu[aá]nto|cuesta|cotiz|btu|tonelada/i, 'Usa el cotizador de esta página: con las medidas de tu espacio calculamos los BTU y te enviamos tres opciones con precio a tu correo.'],
  [/tel[eé]fono|whats|llamar|contact|hablar|persona|asesor/i, `Llámanos al ${C.tel}, de ${C.horario}.`],
];
module.exports = (texto) => {
  const r = REGLAS.find(([re]) => re.test(texto));
  return (r ? r[1] + ' ' : 'Puedo orientarte sobre horarios, cobertura, visita en sitio, instalación, garantía y mantenimiento. ') +
    (r && /Llámanos/.test(r[1]) ? '' : `Para más detalle llámanos al ${C.tel}.`);
};
