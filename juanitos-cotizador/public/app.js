/* Juanitos Corporation — cotizador. Sin dependencias. */

// ---------- Datos de cálculo ----------
const ZONAS = {
  templado: { nombre: 'templado', res: 170, k: 1.0 },
  calido: { nombre: 'cálido', res: 210, k: 1.15 },
  extremo: { nombre: 'muy cálido', res: 250, k: 1.3 },
};

const ESTADOS = {
  'Aguascalientes': 'templado', 'Baja California': 'extremo', 'Baja California Sur': 'extremo',
  'Campeche': 'extremo', 'Chiapas': 'calido', 'Chihuahua': 'extremo', 'Ciudad de México': 'templado',
  'Coahuila': 'extremo', 'Colima': 'calido', 'Durango': 'calido', 'Estado de México': 'templado',
  'Guanajuato': 'templado', 'Guerrero': 'calido', 'Hidalgo': 'templado', 'Jalisco': 'calido',
  'Michoacán': 'calido', 'Morelos': 'calido', 'Nayarit': 'calido', 'Nuevo León': 'extremo',
  'Oaxaca': 'calido', 'Puebla': 'templado', 'Querétaro': 'templado', 'Quintana Roo': 'extremo',
  'San Luis Potosí': 'calido', 'Sinaloa': 'extremo', 'Sonora': 'extremo', 'Tabasco': 'extremo',
  'Tamaulipas': 'extremo', 'Tlaxcala': 'templado', 'Veracruz': 'calido', 'Yucatán': 'extremo',
  'Zacatecas': 'templado',
};

const ESPACIOS_RES = {
  recamara: { label: 'Recámara', extra: 0 },
  sala: { label: 'Sala o comedor', extra: 0 },
  cocina: { label: 'Cocina o sala con cocina abierta', extra: 4000 },
  estudio: { label: 'Estudio u oficina en casa', extra: 1000 },
};

// BTU/h por m³ de base y por persona, según el uso del recinto.
const USOS_IND = {
  oficinas: { label: 'Oficinas o corporativo', m3: 180, persona: 450 },
  auditorio: { label: 'Auditorio o salón de escuela', m3: 160, persona: 500 },
  foro_tv: { label: 'Foro de televisión o estudio', m3: 220, persona: 600 },
  farma: { label: 'Farmacéutica, laboratorio o cuarto limpio', m3: 350, persona: 600 },
  comercio: { label: 'Tienda o local comercial', m3: 220, persona: 500 },
  restaurante: { label: 'Restaurante o cocina comercial', m3: 260, persona: 550 },
  gimnasio: { label: 'Gimnasio', m3: 220, persona: 900 },
  nave: { label: 'Nave, bodega o planta', m3: 110, persona: 600 },
  datacenter: { label: 'Site o centro de datos', m3: 150, persona: 400 },
};

const zonaDe = (estado) => ZONAS[ESTADOS[estado] || 'calido'];
const redondear = (btu) => Math.ceil(btu / 500) * 500;

function calcResidencial({ volumen, estado, espacio, personas, sol, techo }) {
  const z = zonaDe(estado);
  let btu = volumen * z.res;
  btu += Math.max(0, (personas || 0) - 2) * 600;
  btu += (ESPACIOS_RES[espacio] || ESPACIOS_RES.recamara).extra;
  if (sol) btu *= 1.1;
  if (techo) btu *= 1.1;
  return redondear(btu);
}

function calcIndustrial({ volumen, estado, uso, personas, kw }) {
  const z = zonaDe(estado);
  const u = USOS_IND[uso] || USOS_IND.oficinas;
  let btu = volumen * u.m3 * z.k;
  btu += (personas || 0) * u.persona;
  btu += (kw || 0) * 3412; // 1 kW de equipo o iluminación = 3,412 BTU/h
  return redondear(btu * 1.1); // 10 % de margen
}

// Elige tres opciones: la más barata, la de mejor ajuste y la de gama alta.
function sugerir(equipos, segmento, btu, uso) {
  let lista = equipos.filter((e) => e.segmento === segmento);
  if (uso) {
    const porUso = lista.filter((e) => String(e.aplicaciones).split(',').map((s) => s.trim()).includes(uso));
    if (porUso.length >= 3) lista = porUso;
  }
  let cand = lista.map((e) => {
    const cantidad = Math.max(1, Math.ceil((btu * 0.95) / e.capacidad_btu));
    return { ...e, cantidad, total: cantidad * e.precio_promedio_mxn, sobra: (cantidad * e.capacidad_btu) / btu };
  });
  const pocos = cand.filter((c) => c.cantidad <= 6);
  if (pocos.length >= 3) cand = pocos;
  const justos = cand.filter((c) => c.sobra <= 1.75);
  if (justos.length >= 3) cand = justos;

  const tomar = (arr, orden) => {
    if (!arr.length) return null;
    const pick = [...arr].sort(orden)[0];
    cand = cand.filter((c) => c.id !== pick.id);
    return pick;
  };
  const porTotal = (a, b) => a.total - b.total;
  const porAjuste = (a, b) => a.cantidad - b.cantidad || a.sobra - b.sobra || a.total - b.total;

  // Menos unidades = menos instalaciones: la opción barata no puede fragmentar de más.
  const minCant = Math.min(...cand.map((c) => c.cantidad));
  const barata = tomar(cand.filter((c) => c.cantidad <= minCant + 1), porTotal);
  const rec = cand.filter((c) => c.nivel === 'Recomendado');
  const ajustada = tomar(rec.length ? rec : cand, porAjuste);
  const prem = cand.filter((c) => c.nivel === 'Premium');
  const alta = prem.length ? tomar(prem, porAjuste) : tomar(cand, (x, y) => y.total - x.total);

  const etiquetas = ['Económica', 'Recomendada', 'Premium'];
  return [barata, ajustada, alta].filter(Boolean).sort(porTotal).map((o, i, arr) => ({ ...o, etiqueta: arr.length === 3 ? etiquetas[i] : etiquetas[i === arr.length - 1 && i > 0 ? 2 : i] }));
}

if (typeof module !== 'undefined') module.exports = { calcResidencial, calcIndustrial, sugerir, ESTADOS, USOS_IND };

// ---------- Interfaz ----------
if (typeof document !== 'undefined') {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pesos = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
  const miles = (n) => new Intl.NumberFormat('es-MX').format(n);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let equipos = [];
  let modulo = 'residencial';
  const form = $('#cotizador');

  // Selects
  $('#estado').insertAdjacentHTML('beforeend', Object.keys(ESTADOS).map((e) => `<option>${e}</option>`).join(''));
  $('#espacio').innerHTML = Object.entries(ESPACIOS_RES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  $('#uso').innerHTML = Object.entries(USOS_IND).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');

  // Catálogo
  fetch('/api/equipos').then((r) => r.json()).then((d) => { equipos = d.equipos || []; pintarTabla('Todos'); })
    .catch(() => { $('#tabla-equipos tbody').innerHTML = '<tr><td colspan="6">No pudimos cargar el catálogo. Recarga la página.</td></tr>'; });

  function pintarTabla(filtro) {
    const filas = equipos.filter((e) => filtro === 'Todos' || e.segmento === filtro);
    $('#tabla-equipos tbody').innerHTML = filas.map((e) => `
      <tr>
        <td><span class="tag tag-${e.segmento === 'Industrial' ? 'ind' : 'res'}">${esc(e.segmento)}</span></td>
        <td><strong>${esc(e.marca)}</strong><br>${esc(e.modelo)}</td>
        <td>${esc(e.tipo)}</td>
        <td class="num">${miles(e.capacidad_btu)}<br><small>${(e.capacidad_btu / 12000).toFixed(1)} TR</small></td>
        <td class="num">${pesos(e.precio_promedio_mxn)}<br><small>${pesos(e.precio_min_mxn)} a ${pesos(e.precio_max_mxn)}</small></td>
        <td>${esc(e.notas)}</td>
      </tr>`).join('');
  }
  $$('.filtros button').forEach((b) => b.addEventListener('click', () => {
    $$('.filtros button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    pintarTabla(b.dataset.filtro);
  }));

  // Módulos
  function cambiarModulo(m) {
    modulo = m;
    $$('[role=tab]').forEach((t) => t.setAttribute('aria-selected', t.dataset.modulo === m));
    $$('[data-solo]').forEach((el) => {
      const visible = el.dataset.solo.split(' ').includes(m);
      el.hidden = !visible;
      $$('input,select,textarea', el).forEach((i) => { i.disabled = !visible; });
    });
    $('#enviar').textContent = m === 'mantenimiento' ? 'Solicitar mantenimiento' : 'Calcular y recibir mi cotización';
    $('#resultado').hidden = true;
    modoMedidas();
    actualizarPlaca();
  }
  $$('[role=tab]').forEach((t) => t.addEventListener('click', () => cambiarModulo(t.dataset.modulo)));
  $$('[data-ir]').forEach((a) => a.addEventListener('click', () => cambiarModulo(a.dataset.ir)));

  function modoMedidas() {
    const porVolumen = form.elements.modo.value === 'volumen';
    $('#campos-medidas').hidden = porVolumen;
    $('#campo-volumen').hidden = !porVolumen;
    const activo = modulo !== 'mantenimiento';
    $$('#campos-medidas input').forEach((i) => { i.disabled = porVolumen || !activo; });
    $('#volumen').disabled = !porVolumen || !activo;
  }
  $$('input[name=modo]').forEach((r) => r.addEventListener('change', () => { modoMedidas(); actualizarPlaca(); }));

  const num = (id) => parseFloat($(id).value) || 0;
  function leer() {
    const porVolumen = form.elements.modo.value === 'volumen';
    const largo = num('#largo'), ancho = num('#ancho'), alto = num('#alto');
    const volumen = porVolumen ? num('#volumen') : largo * ancho * alto;
    const estado = $('#estado').value;
    const base = { volumen: +volumen.toFixed(1), estado, largo, ancho, alto, porVolumen };
    if (modulo === 'industrial') {
      const d = { ...base, uso: $('#uso').value, personas: num('#personas-ind'), kw: num('#kw') };
      return { ...d, btu: volumen > 0 ? calcIndustrial(d) : 0 };
    }
    const d = { ...base, espacio: $('#espacio').value, personas: num('#personas-res'), sol: $('#sol').checked, techo: $('#techo').checked };
    return { ...d, btu: volumen > 0 ? calcResidencial(d) : 0 };
  }

  function actualizarPlaca() {
    const placa = $('#placa');
    placa.classList.toggle('placa-mant', modulo === 'mantenimiento');
    if (modulo === 'mantenimiento') {
      $('#placa-btu').textContent = 'Servicio';
      $('#placa-unidad').textContent = 'diagnóstico y mantenimiento';
      $('#placa-vol').textContent = '—'; $('#placa-tr').textContent = '—';
      $('#placa-clima').textContent = $('#estado').value ? `${$('#estado').value}` : 'elige tu estado';
      return;
    }
    const d = leer();
    $('#placa-btu').textContent = d.btu ? miles(d.btu) : '0';
    $('#placa-unidad').textContent = 'BTU/h que hay que abatir';
    $('#placa-vol').textContent = d.volumen ? `${miles(d.volumen)} m³` : '—';
    $('#placa-tr').textContent = d.btu ? `${(d.btu / 12000).toFixed(1)} TR` : '—';
    $('#placa-clima').textContent = d.estado ? `${d.estado}, clima ${zonaDe(d.estado).nombre}` : 'elige tu estado';
  }
  form.addEventListener('input', actualizarPlaca);

  // Foto: se reduce en el navegador antes de enviarla.
  function reducirFoto(file) {
    return new Promise((resolve) => {
      if (!file) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, 1280 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve({ nombre: file.name.replace(/\.[^.]+$/, '') + '.jpg', dataUrl: c.toDataURL('image/jpeg', 0.72) });
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const aviso = $('#aviso');
    aviso.textContent = '';
    if (!form.reportValidity()) return;

    const contacto = {
      nombre: $('#nombre').value.trim(), correo: $('#correo').value.trim(), telefono: $('#telefono').value.trim(),
      estado: $('#estado').value, colonia: $('#colonia').value.trim(), website: $('#website').value, acepta_aviso: $('#acepto').checked,
    };
    let payload = { tipo: modulo, ...contacto };
    let opciones = [];

    if (modulo === 'mantenimiento') {
      payload.mantenimiento = {
        segmento: form.elements.segmento.value, modelo: $('#modelo').value.trim(),
        problema: $('#problema').value.trim(), foto: await reducirFoto($('#foto').files[0]),
      };
    } else {
      const d = leer();
      if (!d.btu) { aviso.textContent = 'Escribe las medidas del espacio para calcular la carga.'; return; }
      const segmento = modulo === 'industrial' ? 'Industrial' : 'Residencial';
      opciones = sugerir(equipos, segmento, d.btu, modulo === 'industrial' ? d.uso : null);
      payload.medidas = { largo: d.largo, ancho: d.ancho, alto: d.alto, volumen: d.volumen, porVolumen: d.porVolumen };
      payload.uso = modulo === 'industrial' ? USOS_IND[d.uso].label : ESPACIOS_RES[d.espacio].label;
      payload.personas = d.personas;
      payload.btu = d.btu;
      payload.opciones = opciones.map((o) => ({
        etiqueta: o.etiqueta, id: o.id, marca: o.marca, modelo: o.modelo, tipo: o.tipo,
        capacidad_btu: o.capacidad_btu, cantidad: o.cantidad, precio_unitario: o.precio_promedio_mxn, total: o.total,
      }));
      pintarResultado(d, opciones);
    }

    const boton = $('#enviar');
    boton.disabled = true;
    const estadoEnvio = $('#estado-envio');
    estadoEnvio.textContent = 'Enviando tu solicitud…';
    $('#resultado').hidden = false;
    if (modulo === 'mantenimiento') { $('#res-titulo').textContent = 'Solicitud de mantenimiento'; $('#res-resumen').textContent = ''; $('#opciones').innerHTML = ''; $('#res-notas').hidden = true; }
    $('#resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const r = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Error');
      estadoEnvio.innerHTML = `Solicitud enviada. Tu folio es <strong>${esc(j.folio)}</strong> y la confirmación va en camino a ${esc(contacto.correo)}.`;
      estadoEnvio.className = 'envio ok';
    } catch (e) {
      estadoEnvio.textContent = 'No pudimos registrar tu solicitud. Revisa tu conexión y vuelve a enviarla; tus datos siguen en el formulario.';
      estadoEnvio.className = 'envio error';
    } finally { boton.disabled = false; }
  });

  function pintarResultado(d, opciones) {
    $('#res-notas').hidden = false;
    $('#res-titulo').textContent = `Tu espacio necesita ${miles(d.btu)} BTU/h`;
    $('#res-resumen').textContent = `Son ${(d.btu / 12000).toFixed(1)} toneladas de refrigeración para ${miles(d.volumen)} m³ en clima ${zonaDe(d.estado).nombre}. Estas tres opciones lo cubren:`;
    $('#opciones').innerHTML = opciones.map((o) => `
      <article class="opcion ${o.etiqueta === 'Recomendada' ? 'opcion-rec' : ''}">
        <p class="opcion-nivel">${o.etiqueta}</p>
        <h3>${esc(o.marca)}</h3>
        <p class="opcion-modelo">${esc(o.modelo)}</p>
        <p class="opcion-tipo">${esc(o.tipo)}</p>
        <dl>
          <div><dt>Capacidad</dt><dd>${o.cantidad > 1 ? o.cantidad + ' × ' : ''}${miles(o.capacidad_btu)} BTU/h</dd></div>
          <div><dt>Precio promedio${o.cantidad > 1 ? ' c/u' : ''}</dt><dd>${pesos(o.precio_promedio_mxn)}</dd></div>
          ${o.cantidad > 1 ? `<div><dt>Total equipos</dt><dd>${pesos(o.total)}</dd></div>` : ''}
        </dl>
        <p class="opcion-nota">${esc(o.notas)}</p>
      </article>`).join('') || '<p>Todavía no tenemos equipos cargados para esta capacidad. Te contactamos con una propuesta a medida.</p>';
  }

  // ---------- Chat ----------
  const chat = $('#chat'), historial = [];
  const abrir = (v) => { chat.hidden = !v; $('#chat-abrir').setAttribute('aria-expanded', v); if (v) $('#chat-texto').focus(); };
  $('#chat-abrir').addEventListener('click', () => abrir(chat.hidden));
  $('#chat-cerrar').addEventListener('click', () => abrir(false));
  $$('[data-chat]').forEach((b) => b.addEventListener('click', () => abrir(true)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !chat.hidden) abrir(false); });

  function burbuja(rol, texto) {
    const p = document.createElement('p');
    p.className = 'msg msg-' + rol; p.textContent = texto;
    $('#chat-mensajes').appendChild(p); p.scrollIntoView({ block: 'end' });
    return p;
  }
  $('#chat-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const texto = $('#chat-texto').value.trim();
    if (!texto) return;
    $('#chat-texto').value = '';
    burbuja('user', texto);
    historial.push({ role: 'user', content: texto });
    const espera = burbuja('assistant', 'Escribiendo…');
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: historial.slice(-12) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      espera.textContent = j.reply;
      historial.push({ role: 'assistant', content: j.reply });
    } catch (e) {
      historial.pop();
      espera.textContent = 'El asistente no está disponible en este momento. Deja tus datos en el cotizador y te contactamos.';
    }
  });

  cambiarModulo('residencial');
}
