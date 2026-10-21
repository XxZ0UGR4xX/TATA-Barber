require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('./db');
const mail = require('./mail');
const agenda = require('./agenda');
const NEGOCIO_BASE = require('./negocio');

const PORT = process.env.PORT || 3000;
// En Render, RENDER_EXTERNAL_URL trae la URL pública (https://...onrender.com). BASE_URL solo hace falta
// para un dominio propio o fuera de Render.
const BASE_URL = (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const TZ = 'America/Mexico_City';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
// Contraseñas de ejemplo (están a la vista en el repositorio): sirven para probar, nunca en producción
const PASS_EJEMPLO = ['admin123', 'cambia-esta-clave', 'cambia-esta-contraseña'];
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
// Ruta secreta del panel: el sitio no tiene botones hacia él y /admin.html no existe. Su API vive bajo la misma
// etiqueta (/api/<ruta>/...), así que /api/admin/... tampoco responde. Se elige con PANEL_RUTA; si no, se deriva
// de SESSION_SECRET y se muestra al arrancar (en Render: pestaña Logs).
const RUTA_PANEL = (() => {
  const r = String(process.env.PANEL_RUTA || '').trim().replace(/^\/+|\/+$/g, '');
  if (!r) return 'panel-' + crypto.createHash('sha256').update(`${SESSION_SECRET}|panel`).digest('hex').slice(0, 16);
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(r)) {
    console.error('✖ PANEL_RUTA debe tener de 12 a 64 caracteres: letras, números, guiones o guiones bajos.');
    process.exit(1);
  }
  return r;
})();
const API_PANEL = `/api/${RUTA_PANEL}`;
const HOLD_MINUTES = 15; // tiempo que se aparta un horario mientras se paga

const PASO = 30; // minutos entre horarios (las duraciones de los servicios son múltiplos de esto)

// Horario de la barbería (se edita en el panel): { 0: null | ['10:00','19:00'], ... } con 0 = domingo
function horario() {
  return Object.fromEntries(db.prepare('SELECT dia, abre, cierra FROM horario ORDER BY dia').all()
    .map((h) => [h.dia, h.abre && h.cierra ? [h.abre, h.cierra] : null]));
}

// ---------- Mercado Pago ----------
const MP_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const MODO_DEMO = !MP_TOKEN;
let mpClient = null, Preference = null, Payment = null;
if (!MODO_DEMO) {
  const mp = require('mercadopago');
  mpClient = new mp.MercadoPagoConfig({ accessToken: MP_TOKEN });
  Preference = mp.Preference;
  Payment = mp.Payment;
}
const MP_ES_PRUEBA = MP_TOKEN.startsWith('TEST-');

// En producción (Render define RENDER=true) no se arranca con un panel abierto ni con pagos simulados:
// cualquiera podría entrar con admin123 o agendar citas "pagadas" sin pagar.
if (process.env.RENDER || process.env.NODE_ENV === 'production') {
  const faltan = [];
  if (!process.env.ADMIN_PASS || PASS_EJEMPLO.includes(ADMIN_PASS) || ADMIN_PASS.length < 8) {
    faltan.push('ADMIN_PASS (contraseña propia del panel, mínimo 8 caracteres)');
  }
  if (!process.env.SESSION_SECRET) faltan.push('SESSION_SECRET (Render lo genera solo con el Blueprint)');
  if (MODO_DEMO && process.env.PERMITIR_DEMO !== '1') {
    faltan.push('MP_ACCESS_TOKEN (o PERMITIR_DEMO=1 para probar sin cobrar)');
  }
  if (faltan.length) {
    console.error(`✖ No se puede arrancar en producción. Falta configurar: ${faltan.join('; ')}.`);
    process.exit(1);
  }
}

if (MODO_DEMO) console.log('⚠  Sin MP_ACCESS_TOKEN: el pago funciona en MODO DEMO (simulado).');
else console.log(`Mercado Pago activo (${MP_ES_PRUEBA ? 'credenciales de PRUEBA' : 'credenciales REALES'}).`);
if (PASS_EJEMPLO.includes(ADMIN_PASS)) {
  console.log(`⚠  El panel usa la contraseña de ejemplo → usuario: ${ADMIN_USER}  contraseña: ${ADMIN_PASS}  (cámbiala en .env, ADMIN_PASS)`);
}

// ---------- datos del negocio ----------
// negocio.js trae los valores de instalación; lo que el dueño guarda en el panel (tabla ajustes) los reemplaza.
const CAMPOS_NEGOCIO = ['nombre', 'eslogan', 'direccion', 'ciudadEstado', 'telefono', 'whatsapp', 'correo', 'instagram', 'facebook', 'tiktok'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const diezDigitos = (s) => String(s ?? '').replace(/\D/g, '').slice(-10);
const COLOR = /^#[0-9a-f]{3,8}$/i;

function negocio() {
  const guardados = Object.fromEntries(db.prepare('SELECT clave, valor FROM ajustes').all().map((r) => [r.clave, r.valor]));
  const n = { ...NEGOCIO_BASE };
  CAMPOS_NEGOCIO.forEach((k) => { if (k in guardados) n[k] = guardados[k]; else n[k] = String(n[k] ?? ''); });
  const tel = diezDigitos(n.telefono), wa = diezDigitos(n.whatsapp);
  const [primera, ...resto] = n.nombre.trim().split(/\s+/);
  const colores = { acento: '#d8b45f', acentoClaro: '#f1d792', acentoOscuro: '#b88a35' };
  Object.keys(colores).forEach((k) => { if (COLOR.test(n.colores?.[k] || '')) colores[k] = n.colores[k]; });
  return {
    ...n, ...colores,
    ciudad: n.ciudadEstado.split(',')[0].trim(),
    // Encabezado: primera palabra en blanco y el resto en dorado
    marcaHtml: resto.length ? `${esc(primera)} <span>${esc(resto.join(' '))}</span>` : `<span>${esc(primera)}</span>`,
    telLink: tel.length === 10 ? `+52${tel}` : '',
    waNumero: wa.length === 10 ? `52${wa}` : '',
    waLink: wa.length === 10 ? `https://wa.me/52${wa}` : '',
    mapa: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${n.direccion}, ${n.ciudadEstado}`),
    instagramUrl: n.instagram ? `https://www.instagram.com/${encodeURIComponent(n.instagram)}` : '',
    facebookUrl: n.facebook ? `https://www.facebook.com/${encodeURIComponent(n.facebook)}` : '',
    tiktokUrl: n.tiktok ? `https://www.tiktok.com/@${encodeURIComponent(n.tiktok)}` : '',
    hayRedes: !!(n.instagram || n.facebook || n.tiktok),
    anio: new Date().getFullYear(),
  };
}

// Plantillas mínimas para las páginas: {{campo}} (escapado), {{{campo}}} (HTML ya seguro) y
// {{#campo}}…{{/campo}} (solo si el campo tiene valor).
const secciones = (texto, datos) =>
  texto.replace(/{{#(\w+)}}([\s\S]*?){{\/\1}}/g, (_, k, dentro) => (datos[k] ? secciones(dentro, datos) : ''));
function plantilla(texto, datos) {
  // Una sola pasada: lo que se inserta no se vuelve a leer, así un dato con "{{nonce}}" se queda como texto
  return secciones(texto, datos).replace(/{{{(\w+)}}}|{{(\w+)}}/g, (_, crudo, k) => (crudo ? String(datos[crudo] ?? '') : esc(datos[k])));
}
const PUBLIC = path.join(__dirname, 'public');
const PAGINAS = new Map(fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'))
  .map((f) => [f, fs.readFileSync(path.join(PUBLIC, f), 'utf8')]));

function datosPagina() {
  const n = negocio();
  // Lo que el JavaScript de las páginas necesita (sin "<" para no cerrar el <script>)
  const json = JSON.stringify({ nombre: n.nombre, direccion: n.direccion, telLink: n.telLink, waNumero: n.waNumero })
    .replace(/</g, '\\u003c');
  return { ...n, negocioJson: json };
}

// Política de contenido: solo corren los scripts del propio sitio y los que llevan el nonce de esa respuesta,
// así un script inyectado (p. ej. <img onerror=…>) no se ejecuta aunque llegara a colarse en la página.
const politica = (nonce) => [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}'`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "media-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('case sensitive routing', true); // la ruta del panel debe escribirse exacta (mayúsculas incluidas)
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (BASE_URL.startsWith('https')) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());

// ---------- encapsulado de la API ----------
// Límite general por IP (el aviso de Mercado Pago tiene el suyo) para frenar barridos y ataques de fuerza bruta
const limiteApi = limitePorIp(300, 5 * 60 * 1000, 'Demasiadas solicitudes. Espera unos minutos.');
const limiteWebhook = limitePorIp(600, 10 * 60 * 1000, 'Demasiados avisos');
app.use('/api', (req, res, next) => (req.path === '/mp/webhook' ? limiteWebhook : limiteApi)(req, res, next));
// Las acciones (POST/PUT/DELETE) solo se aceptan desde el propio sitio: el navegador manda Origin y Sec-Fetch-Site
// y otra página no puede falsificarlos. El aviso de Mercado Pago es de servidor a servidor y no los trae.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/mp/webhook') return next();
  const sitio = req.get('sec-fetch-site');
  const origen = req.get('origin');
  let mismoHost = true;
  if (origen) { try { mismoHost = new URL(origen).host === req.get('host'); } catch { mismoHost = false; } }
  if ((sitio && !['same-origin', 'none'].includes(sitio)) || !mismoHost) {
    return res.status(403).json({ error: 'Origen no permitido' });
  }
  next();
});
// Datos privados (citas, clientes, sesión) nunca se guardan en caché del navegador ni de proxies
app.use([API_PANEL, '/api/reservas', '/api/demo'], (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const idValido = (v) => (/^\d{1,9}$/.test(String(v)) ? Number(v) : null);
// Las páginas HTML se llenan con los datos del negocio; lo demás (CSS, imágenes, JS) se sirve tal cual
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const archivo = req.path === '/' ? 'index.html' : req.path.slice(1);
  const pagina = PAGINAS.get(archivo);
  if (!pagina) return next();
  const nonce = crypto.randomBytes(16).toString('base64');
  res.type('html').set({ 'Cache-Control': 'no-cache', 'Content-Security-Policy': politica(nonce) })
    .send(plantilla(pagina, { ...datosPagina(), nonce }));
});
// Chequeo de salud (lo usan Render y el monitor externo): 200 solo si el servidor y la base de datos responden
app.get('/salud', (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    db.prepare('SELECT 1').get();
    res.json({ ok: true });
  } catch (e) {
    console.error('[salud]', e.message);
    res.status(503).json({ ok: false });
  }
});
const PANEL_HTML = fs.readFileSync(path.join(__dirname, 'privado', 'panel.html'), 'utf8');
app.get(`/${RUTA_PANEL}`, (req, res) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.type('html').set({
    'Cache-Control': 'no-store', 'Content-Security-Policy': politica(nonce),
    'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', // que la ruta no aparezca en buscadores ni se filtre
  }).send(plantilla(PANEL_HTML, { ...datosPagina(), nonce, apiPanel: API_PANEL }));
});
// Fotos de barberos e imágenes de referencia: se entregan solo como imagen (con sandbox), así que aunque un
// archivo trajera código no se ejecuta
const servirImagen = (sql) => (req, res, next) => {
  const id = idValido(req.params.id);
  const f = id && db.prepare(sql).get(id);
  if (!f) return next();
  res.set({
    'Content-Type': f.tipo,
    'Cache-Control': req.query.v === f.version ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'same-origin',
  }).send(f.datos);
};
app.get('/fotos/barberos/:id', servirImagen('SELECT tipo, datos, version FROM fotos_barberos WHERE barbero_id = ?'));
app.get('/fotos/referencias/:id', servirImagen('SELECT tipo, datos, version FROM referencias WHERE id = ?'));
app.use(express.static(PUBLIC, { index: false }));

// ---------- utilidades ----------
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Fecha y minuto del día en hora de México para un instante dado
function partesMX(fecha = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(fecha).map((x) => [x.type, x.value])
  );
  return { fecha: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
const ahoraMX = () => partesMX();
const fechaHoraMX = (d) => { const p = partesMX(d); return `${p.fecha} ${toHHMM(p.min)}`; }; // 'YYYY-MM-DD HH:MM'

function diaSemana(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f + 'T12:00:00Z'));

// Citas que bloquean un horario: pagadas, o pendientes recientes (apartadas)
const SQL_OCUPADAS = `
  SELECT hora, duracion FROM citas
  WHERE barbero_id = ? AND fecha = ?
    AND (estado = 'pagada' OR (estado = 'pendiente' AND creada_en > datetime('now', ?)))`;

function slotsDelDia(barberoId, fecha, duracion) {
  const delDia = horario()[diaSemana(fecha)];
  if (!delDia) return [];
  const ocupadas = db.prepare(SQL_OCUPADAS).all(barberoId, fecha, `-${HOLD_MINUTES} minutes`)
    .map((c) => [toMin(c.hora), toMin(c.hora) + c.duracion]);
  const ahora = ahoraMX();
  const [ini, fin] = delDia.map(toMin);
  const slots = [];
  for (let t = ini; t + duracion <= fin; t += PASO) {
    const choca = ocupadas.some(([a, b]) => t < b && t + duracion > a);
    const pasado = fecha < ahora.fecha || (fecha === ahora.fecha && t <= ahora.min + 30);
    slots.push({ hora: toHHMM(t), disponible: !choca && !pasado });
  }
  return slots;
}

function citaCompleta(where, ...params) {
  return db.prepare(`
    SELECT c.*, b.nombre AS barbero_nombre, s.nombre AS servicio_nombre
    FROM citas c
    JOIN barberos b ON b.id = c.barbero_id
    JOIN servicios s ON s.id = c.servicio_id
    WHERE ${where}`).get(...params);
}

// Registra el pago de una cita una sola vez. Si mientras se pagaba el horario lo ganó otra cita pagada,
// la cita estaba cancelada o la hora ya pasó (p. ej. un OXXO pagado tarde), NO se agenda: queda en
// 'conflicto' para que la barbería reagende o devuelva el dinero. Devuelve el estado nuevo o null.
const registrarPago = db.transaction((citaId) => {
  const c = db.prepare('SELECT * FROM citas WHERE id = ?').get(citaId);
  if (!c || c.pagada_en) return null; // no existe o este pago ya se registró (MP avisa varias veces)
  const ini = toMin(c.hora), fin = ini + c.duracion;
  const choca = db.prepare(`SELECT hora, duracion FROM citas
                            WHERE id != ? AND barbero_id = ? AND fecha = ? AND estado = 'pagada'`)
    .all(c.id, c.barbero_id, c.fecha)
    .some((o) => ini < toMin(o.hora) + o.duracion && fin > toMin(o.hora));
  const ahora = ahoraMX();
  const yaPaso = c.fecha < ahora.fecha || (c.fecha === ahora.fecha && ini <= ahora.min);
  const estado = c.estado === 'cancelada' || choca || yaPaso ? 'conflicto' : 'pagada';
  db.prepare("UPDATE citas SET estado = ?, pagada_en = datetime('now') WHERE id = ?").run(estado, c.id);
  return estado;
});

// Marca la cita como pagada y manda los correos solo la primera vez
async function marcarPagada(citaId) {
  const estado = registrarPago(citaId);
  const cita = citaCompleta('c.id = ?', citaId);
  const log = (quien) => (e) => console.error(`[correo ${quien}]`, e.message);
  if (cita && estado === 'pagada') {
    mail.avisarBarberia(cita, negocio()).catch(log('barbería'));
    mail.confirmarCliente(cita, negocio()).catch(log('cliente'));
    sincronizarAgenda();
  } else if (cita && estado === 'conflicto') {
    console.warn(`[pago] Cita ${cita.codigo} pagada sin horario disponible: queda por revisar.`);
    mail.avisarConflicto(cita).catch(log('barbería'));
    mail.conflictoCliente(cita, negocio()).catch(log('cliente'));
  }
  return cita;
}

// Consulta un pago en Mercado Pago y, si está aprobado, marca la cita. Devuelve {estado, cita}.
async function procesarPago(paymentId) {
  const pago = await new Payment(mpClient).get({ id: paymentId });
  const citaId = Number(pago.external_reference);
  if (!citaId) return { estado: pago.status };
  if (pago.status === 'approved') {
    const precio = db.prepare('SELECT precio FROM citas WHERE id = ?').get(citaId)?.precio;
    if (precio === undefined || pago.currency_id !== 'MXN' || Number(pago.transaction_amount) < precio) {
      console.error(`[pago] El pago ${paymentId} no coincide con el precio de la cita ${citaId}: no se agenda.`);
      return { estado: 'monto_invalido', cita: citaCompleta('c.id = ?', citaId) };
    }
    return { estado: 'approved', cita: await marcarPagada(citaId) };
  }
  return { estado: pago.status, cita: citaCompleta('c.id = ?', citaId) };
}

function publica(c) {
  return {
    codigo: c.codigo, estado: c.estado, cliente: c.cliente_nombre, servicio: c.servicio_nombre,
    barbero: c.barbero_nombre, fecha: c.fecha, hora: c.hora, duracion: c.duracion, precio: c.precio,
  };
}

// ---------- webhook de Mercado Pago ----------
// MP avisa aquí cada cambio de pago. Confirmamos SIEMPRE consultando el pago con nuestro
// token (no confiamos en el cuerpo del aviso), así que un aviso falso no agenda nada.
app.post('/api/mp/webhook', async (req, res) => {
  try {
    if (MODO_DEMO) return res.sendStatus(200);
    const tipo = req.query.type || req.query.topic || req.body?.type;
    const id = req.query['data.id'] || req.query.id || req.body?.data?.id;
    if (tipo === 'payment' && id) await procesarPago(id);
  } catch (e) {
    console.error('[webhook MP]', e.message);
  }
  res.sendStatus(200); // responder rápido para que MP no reintente de más
});

// ---------- barberos y sus fotos ----------
const SQL_BARBEROS = `SELECT b.id, b.nombre, b.descripcion, b.activo, f.version
  FROM barberos b LEFT JOIN fotos_barberos f ON f.barbero_id = b.id`;
const urlFoto = (id, version) => (version ? `/fotos/barberos/${id}?v=${version}` : null);
const conFoto = ({ version, ...b }) => ({ ...b, foto: urlFoto(b.id, version) });
const SQL_REFERENCIAS = "SELECT id, titulo, '/fotos/referencias/' || id || '?v=' || version AS foto FROM referencias ORDER BY orden, id";
const MAX_REFERENCIAS = 30;
// Solo JPG, PNG y WebP, reconocidos por sus primeros bytes (no por lo que diga quien sube el archivo)
function tipoImagen(buf) {
  if (buf.length < 16) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
// Imagen subida desde el panel (cuerpo crudo): { tipo, version } o { error, status }
const recibirImagen = (limite) => express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: limite });
function leerImagen(req) {
  if (!Buffer.isBuffer(req.body)) return { status: 415, error: 'Sube una imagen JPG, PNG o WebP' };
  const tipo = tipoImagen(req.body);
  if (!tipo) return { status: 400, error: 'El archivo no es una imagen JPG, PNG o WebP' };
  return { tipo, version: crypto.createHash('sha256').update(req.body).digest('hex').slice(0, 12) };
}

// ---------- API pública ----------
app.get('/api/config', (req, res) => {
  const h = horario();
  res.json({
    barberos: db.prepare(`${SQL_BARBEROS} WHERE b.activo = 1 ORDER BY b.id`).all().map(conFoto).map(({ activo, ...b }) => b),
    referencias: db.prepare(SQL_REFERENCIAS).all(),
    servicios: db.prepare('SELECT id, nombre, descripcion, precio, duracion FROM servicios WHERE activo = 1').all(),
    diasCerrados: Object.keys(h).filter((d) => !h[d]).map(Number),
    horario: h,
    demo: MODO_DEMO,
    hoy: ahoraMX().fecha,
  });
});

app.get('/api/disponibilidad', (req, res) => {
  const barberoId = Number(req.query.barbero);
  const servicioId = Number(req.query.servicio);
  const fecha = String(req.query.fecha || '');
  if (!fechaValida(fecha)) return res.status(400).json({ error: 'Fecha inválida' });
  const servicio = db.prepare('SELECT duracion FROM servicios WHERE id = ? AND activo = 1').get(servicioId);
  const barbero = db.prepare('SELECT id FROM barberos WHERE id = ? AND activo = 1').get(barberoId);
  if (!servicio || !barbero) return res.status(400).json({ error: 'Servicio o barbero inválido' });
  res.json({ fecha, slots: slotsDelDia(barberoId, fecha, servicio.duracion) });
});

// Límite simple por IP (en memoria): evita que alguien aparte todos los horarios sin pagar
function limitePorIp(max, ventanaMs, mensaje) {
  const usos = new Map(); // ip -> [instantes]
  setInterval(() => {
    const desde = Date.now() - ventanaMs;
    for (const [ip, v] of usos) { const r = v.filter((t) => t > desde); r.length ? usos.set(ip, r) : usos.delete(ip); }
  }, ventanaMs).unref();
  return (req, res, next) => {
    const ahora = Date.now(), v = (usos.get(req.ip) || []).filter((t) => t > ahora - ventanaMs);
    if (v.length >= max) return res.status(429).json({ error: mensaje });
    v.push(ahora); usos.set(req.ip, v); next();
  };
}
const DIAS_MAXIMOS = 60; // hasta cuántos días adelante se puede reservar
const CORREO = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

app.post('/api/reservas', limitePorIp(6, 15 * 60 * 1000, 'Demasiadas reservas seguidas. Espera unos minutos e intenta de nuevo.'), async (req, res) => {
  try {
    const { nombre, email, telefono, barberoId, servicioId, fecha, hora } = req.body || {};
    // Sin caracteres de control ni < >: el nombre viaja a correos, a Mercado Pago y al panel
    const n = String(nombre || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
    const e = String(email || '').trim().toLowerCase();
    const t = String(telefono || '').replace(/[^\d+]/g, '').slice(0, 15);
    if (n.length < 2 || n.length > 80) return res.status(400).json({ error: 'Escribe tu nombre' });
    if (e.length > 100 || !CORREO.test(e)) return res.status(400).json({ error: 'Correo inválido' });
    if (t.replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Teléfono inválido (10 dígitos)' });
    if (!fechaValida(String(fecha)) || !/^\d{2}:\d{2}$/.test(String(hora))) return res.status(400).json({ error: 'Fecha u hora inválida' });
    const limite = new Date(Date.parse(ahoraMX().fecha + 'T12:00:00Z') + DIAS_MAXIMOS * 86400000).toISOString().slice(0, 10);
    if (fecha > limite) return res.status(400).json({ error: `Solo se puede reservar con hasta ${DIAS_MAXIMOS} días de anticipación` });
    // Un mismo teléfono no puede tener más de 2 horarios apartados sin pagar a la vez
    const apartadas = db.prepare(`SELECT COUNT(*) AS n FROM citas WHERE cliente_tel = ? AND estado = 'pendiente'
                                  AND creada_en > datetime('now', ?)`).get(t, `-${HOLD_MINUTES} minutes`).n;
    if (apartadas >= 2) return res.status(429).json({ error: 'Ya tienes horarios apartados. Termina tu pago o espera 15 minutos.' });

    const servicio = db.prepare('SELECT * FROM servicios WHERE id = ? AND activo = 1').get(Number(servicioId));
    const barbero = db.prepare('SELECT * FROM barberos WHERE id = ? AND activo = 1').get(Number(barberoId));
    if (!servicio || !barbero) return res.status(400).json({ error: 'Servicio o barbero inválido' });

    const codigo = crypto.randomBytes(4).toString('hex').toUpperCase();

    // Verificar disponibilidad y apartar el horario en una sola transacción (evita doble reserva)
    const crear = db.transaction(() => {
      const libre = slotsDelDia(barbero.id, fecha, servicio.duracion).find((s) => s.hora === hora);
      if (!libre || !libre.disponible) return null;
      const info = db.prepare(`INSERT INTO citas
        (codigo, cliente_nombre, cliente_email, cliente_tel, barbero_id, servicio_id, fecha, hora, duracion, precio)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(codigo, n, e, t, barbero.id, servicio.id, fecha, hora, servicio.duracion, servicio.precio);
      return info.lastInsertRowid;
    });
    const citaId = crear();
    if (!citaId) return res.status(409).json({ error: 'Ese horario ya no está disponible. Elige otro.' });

    if (MODO_DEMO) {
      // Ruta relativa: funciona igual en esta computadora, en el celular por la red local o en línea
      return res.json({ url: `/pago-demo.html?codigo=${codigo}`, codigo });
    }

    // Crear preferencia de pago en Mercado Pago (Checkout Pro)
    const pref = await new Preference(mpClient).create({
      body: {
        items: [{
          id: String(servicio.id),
          title: `${servicio.nombre} con ${barbero.nombre}`,
          description: `${fecha} a las ${hora}`,
          quantity: 1,
          unit_price: servicio.precio,
          currency_id: 'MXN',
        }],
        payer: { name: n, email: e },
        external_reference: String(citaId),
        metadata: { cita_id: citaId, codigo },
        // Lo que aparece en el estado de cuenta: solo letras, números y espacios ("STYLE CUTS")
        statement_descriptor: negocio().nombre.normalize('NFD').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().slice(0, 22),
        back_urls: {
          success: `${BASE_URL}/gracias.html`,
          pending: `${BASE_URL}/gracias.html`,
          failure: `${BASE_URL}/index.html?cancelado=1`,
        },
        // auto_return solo funciona con URL https pública
        ...(BASE_URL.startsWith('https') ? { auto_return: 'approved' } : {}),
        // El aviso de Mercado Pago solo llega a una dirección pública con https; en pruebas locales el pago
        // se confirma cuando el cliente regresa a gracias.html
        ...(BASE_URL.startsWith('https') ? { notification_url: `${BASE_URL}/api/mp/webhook` } : {}),
        expires: true,
        // El enlace de pago dura lo mismo que el apartado del horario
        expiration_date_to: new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString(),
      },
    });
    db.prepare('UPDATE citas SET mp_preference_id = ? WHERE id = ?').run(pref.id, citaId);
    const url = MP_ES_PRUEBA ? pref.sandbox_init_point : pref.init_point;
    res.json({ url, codigo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo crear la reserva. Intenta de nuevo.' });
  }
});

// Confirmación al volver de Mercado Pago. Verifica con MP que el pago sí se aprobó.
app.get('/api/reservas/confirmar', async (req, res) => {
  try {
    if (MODO_DEMO) return res.status(400).json({ error: 'Modo demo' });
    const paymentId = String(req.query.payment_id || req.query.collection_id || '');
    const preferenceId = String(req.query.preference_id || '');
    if (!/^\d{1,20}$/.test(paymentId)) return res.status(400).json({ error: 'Falta el pago' });
    const r = await procesarPago(paymentId);
    // Mercado Pago regresa al cliente con su preference_id: sin él no mostramos datos de la cita
    // (evita que alguien consulte citas ajenas probando números de pago)
    if (!r.cita || !preferenceId || r.cita.mp_preference_id !== preferenceId) return res.status(404).json({ error: 'Cita no encontrada' });
    if (r.estado !== 'approved') return res.status(402).json({ error: 'pendiente', ...publica(r.cita) });
    res.json(publica(r.cita));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo confirmar el pago' });
  }
});

// Modo demo: datos de la cita y "pago" simulado
const CODIGO = /^[0-9A-Fa-f]{8}$/;
app.get('/api/demo/:codigo', (req, res) => {
  if (!MODO_DEMO || !CODIGO.test(req.params.codigo)) return res.status(404).json({ error: 'No encontrado' });
  const c = citaCompleta('c.codigo = ?', String(req.params.codigo).toUpperCase());
  if (!c) return res.status(404).json({ error: 'Cita no encontrada' });
  res.json(publica(c));
});
app.post('/api/demo/:codigo/pagar', async (req, res) => {
  if (!MODO_DEMO || !CODIGO.test(req.params.codigo)) return res.status(404).json({ error: 'No encontrado' });
  const c = citaCompleta('c.codigo = ?', String(req.params.codigo).toUpperCase());
  if (!c) return res.status(404).json({ error: 'Cita no encontrada' });
  if (c.estado === 'cancelada') return res.status(409).json({ error: 'La cita fue cancelada' });
  res.json(publica(await marcarPagada(c.id)));
});

// ---------- admin ----------
const intentos = new Map(); // ip -> {n, hasta}
setInterval(() => { const ahora = Date.now(); for (const [ip, r] of intentos) if (r.hasta < ahora) intentos.delete(ip); }, 15 * 60 * 1000).unref();
// Sesiones: la cookie solo lleva una llave aleatoria de 256 bits, sin datos dentro (nada que leer ni que alterar).
// En la base se guarda únicamente su huella SHA-256, así que ni con una copia de la base se arma una cookie válida.
// Cerrar sesión la borra del servidor, y cambiar ADMIN_PASS (o SESSION_SECRET) invalida todas las sesiones.
const HUELLA_ADMIN = crypto.createHash('sha256').update(`${SESSION_SECRET}|${ADMIN_USER}|${ADMIN_PASS}`).digest('hex');
const CON_HTTPS = BASE_URL.startsWith('https');
const COOKIE = CON_HTTPS ? '__Host-sesion' : 'sesion'; // __Host-: solo HTTPS, solo este dominio, no la pisa un subdominio
const DURACION_SESION = 8 * 3600 * 1000;
const OPCIONES_COOKIE = { httpOnly: true, sameSite: 'strict', secure: CON_HTTPS, path: '/' };
const huellaDe = (llave) => crypto.createHash('sha256').update(llave).digest('hex');
db.prepare('DELETE FROM sesiones WHERE expira < ? OR huella != ?').run(Date.now(), HUELLA_ADMIN);
setInterval(() => db.prepare('DELETE FROM sesiones WHERE expira < ?').run(Date.now()), 3600 * 1000).unref();

function abrirSesion(res) {
  const llave = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sesiones (id_hash, huella, expira) VALUES (?, ?, ?)').run(huellaDe(llave), HUELLA_ADMIN, Date.now() + DURACION_SESION);
  // Máximo 5 sesiones abiertas a la vez: se cierran las más viejas
  db.prepare('DELETE FROM sesiones WHERE id_hash NOT IN (SELECT id_hash FROM sesiones ORDER BY expira DESC LIMIT 5)').run();
  res.cookie(COOKIE, llave, { ...OPCIONES_COOKIE, maxAge: DURACION_SESION });
}
function sesionValida(req) {
  const llave = req.cookies?.[COOKIE];
  if (typeof llave !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(llave)) return false;
  return !!db.prepare('SELECT 1 FROM sesiones WHERE id_hash = ? AND huella = ? AND expira > ?').get(huellaDe(llave), HUELLA_ADMIN, Date.now());
}
function cerrarSesion(req, res) {
  const llave = req.cookies?.[COOKIE];
  if (typeof llave === 'string') db.prepare('DELETE FROM sesiones WHERE id_hash = ?').run(huellaDe(llave));
  res.clearCookie(COOKIE, OPCIONES_COOKIE);
}
const igual = (x, y) => {
  const a = crypto.createHash('sha256').update(String(x)).digest();
  const b = crypto.createHash('sha256').update(String(y)).digest();
  return crypto.timingSafeEqual(a, b);
};
const requireAdmin = (req, res, next) => (sesionValida(req) ? next() : res.status(401).json({ error: 'No autorizado' }));

app.post(`${API_PANEL}/login`, (req, res) => {
  const ip = req.ip;
  const reg = intentos.get(ip);
  if (reg && reg.n >= 5 && reg.hasta > Date.now()) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  const { usuario, password } = req.body || {};
  const ok = igual(usuario ?? '', ADMIN_USER) & igual(password ?? '', ADMIN_PASS);
  if (!ok) {
    intentos.set(ip, { n: (reg && reg.hasta > Date.now() ? reg.n : 0) + 1, hasta: Date.now() + 15 * 60 * 1000 });
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  intentos.delete(ip);
  abrirSesion(res);
  res.json({ ok: true });
});

app.post(`${API_PANEL}/logout`, (req, res) => { cerrarSesion(req, res); res.json({ ok: true }); });
app.get(`${API_PANEL}/sesion`, (req, res) => res.json({ activa: sesionValida(req) }));

app.get(`${API_PANEL}/citas`, requireAdmin, (req, res) => {
  const { barbero, desde, hasta, estado } = req.query;
  const cond = ["c.estado != 'pendiente'"]; // las pendientes son intentos sin pagar
  const params = [];
  if (['pagada', 'cancelada', 'conflicto'].includes(estado)) { cond[0] = 'c.estado = ?'; params.push(estado); }
  if (barbero) { cond.push('c.barbero_id = ?'); params.push(Number(barbero)); }
  if (desde && fechaValida(desde)) { cond.push('c.fecha >= ?'); params.push(desde); }
  if (hasta && fechaValida(hasta)) { cond.push('c.fecha <= ?'); params.push(hasta); }
  const citas = db.prepare(`
    SELECT c.id, c.codigo, c.cliente_nombre, c.cliente_email, c.cliente_tel, c.fecha, c.hora, c.duracion,
           c.precio, c.estado, c.pagada_en, b.nombre AS barbero, s.nombre AS servicio
    FROM citas c JOIN barberos b ON b.id = c.barbero_id JOIN servicios s ON s.id = c.servicio_id
    WHERE ${cond.join(' AND ')}
    ORDER BY c.fecha DESC, c.hora DESC`).all(...params);
  res.json({ citas });
});

app.get(`${API_PANEL}/resumen`, requireAdmin, (req, res) => {
  const hoy = ahoraMX().fecha;
  const tot = db.prepare(`SELECT
      COUNT(*) FILTER (WHERE estado='pagada') AS pagadas,
      COUNT(*) FILTER (WHERE estado='cancelada') AS canceladas,
      COUNT(*) FILTER (WHERE estado='conflicto') AS revisar,
      COALESCE(SUM(precio) FILTER (WHERE estado='pagada'),0) AS ingresos,
      COUNT(*) FILTER (WHERE estado='pagada' AND fecha = ?) AS hoy,
      COUNT(*) FILTER (WHERE estado='pagada' AND fecha > ?) AS proximas
    FROM citas`).get(hoy, hoy);
  const porBarbero = db.prepare(`
    SELECT b.nombre AS barbero, COUNT(c.id) AS citas, COALESCE(SUM(c.precio),0) AS ingresos
    FROM barberos b LEFT JOIN citas c ON c.barbero_id = b.id AND c.estado = 'pagada'
    GROUP BY b.id HAVING b.activo = 1 OR COUNT(c.id) > 0 ORDER BY citas DESC`).all();
  res.json({ ...tot, porBarbero, fecha: hoy }); // `hoy` es el número de citas de hoy
});

// ---------- admin: barberos, servicios y horario ----------
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function leerBarbero(b = {}) {
  const nombre = texto(b.nombre, 40), descripcion = texto(String(b.descripcion ?? '').replace(/\s+/g, ' '), 160);
  if (nombre.length < 2) return { error: 'Escribe el nombre del barbero' };
  return { valores: [nombre, descripcion, b.activo === false ? 0 : 1] };
}
function leerServicio(s = {}) {
  const nombre = texto(s.nombre, 50), descripcion = texto(s.descripcion, 100);
  const precio = Number(s.precio), duracion = Number(s.duracion);
  if (nombre.length < 2) return { error: 'Escribe el nombre del servicio' };
  if (!Number.isInteger(precio) || precio < 1 || precio > 100000) return { error: 'El precio debe ser un número entero de pesos' };
  if (!Number.isInteger(duracion) || duracion < PASO || duracion > 240 || duracion % PASO) {
    return { error: `La duración debe ser de ${PASO} en ${PASO} minutos (máximo 240)` };
  }
  return { valores: [nombre, descripcion, precio, duracion, s.activo === false ? 0 : 1] };
}
const responder = (res, r, ejecutar) => (r.error ? res.status(400).json({ error: r.error }) : res.json(ejecutar(r.valores)));

app.get(`${API_PANEL}/catalogo`, requireAdmin, (req, res) => {
  res.json({
    barberos: db.prepare(`${SQL_BARBEROS} ORDER BY b.id`).all().map(conFoto),
    servicios: db.prepare('SELECT id, nombre, descripcion, precio, duracion, activo FROM servicios ORDER BY id').all(),
    horario: horario(),
    paso: PASO,
    negocio: Object.fromEntries(CAMPOS_NEGOCIO.map((k) => [k, negocio()[k]])),
    agenda: agenda.estado(),
  });
});

// Datos de contacto del negocio (los que el dueño puede cambiar)
app.put(`${API_PANEL}/negocio`, requireAdmin, (req, res) => {
  const b = req.body || {};
  const red = (v) => texto(v, 80).replace(/^https?:\/\/(www\.)?[^/]+\//i, '').replace(/^@/, '').replace(/\/.*$/, '');
  const v = {
    nombre: texto(b.nombre, 40), eslogan: texto(b.eslogan, 120),
    direccion: texto(b.direccion, 100), ciudadEstado: texto(b.ciudadEstado, 60),
    telefono: texto(b.telefono, 20), whatsapp: texto(b.whatsapp, 20), correo: texto(b.correo, 80).toLowerCase(),
    instagram: red(b.instagram), facebook: red(b.facebook), tiktok: red(b.tiktok),
  };
  if (v.nombre.length < 2) return res.status(400).json({ error: 'Escribe el nombre de la barbería' });
  if (!v.direccion || !v.ciudadEstado) return res.status(400).json({ error: 'Escribe la dirección y la ciudad' });
  for (const k of ['telefono', 'whatsapp']) {
    if (v[k] && diezDigitos(v[k]).length !== 10) return res.status(400).json({ error: `El ${k === 'telefono' ? 'teléfono' : 'WhatsApp'} debe tener 10 dígitos` });
  }
  if (v.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.correo)) return res.status(400).json({ error: 'Correo inválido' });
  for (const k of ['instagram', 'facebook', 'tiktok']) {
    if (v[k] && !/^[\w.-]{1,50}$/.test(v[k])) return res.status(400).json({ error: `Revisa el usuario de ${k}` });
  }
  const up = db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor');
  db.transaction(() => Object.entries(v).forEach(([k, val]) => up.run(k, val)))();
  res.json({ ok: true });
});

app.post(`${API_PANEL}/barberos`, requireAdmin, (req, res) => responder(res, leerBarbero(req.body), (v) =>
  ({ id: Number(db.prepare('INSERT INTO barberos (nombre, descripcion, activo) VALUES (?,?,?)').run(...v).lastInsertRowid) })));
app.put(`${API_PANEL}/barberos/:id`, requireAdmin, (req, res) => {
  const id = idValido(req.params.id); if (!id) return res.status(404).json({ error: 'No encontrado' });
  responder(res, leerBarbero(req.body), (v) => ({ ok: db.prepare('UPDATE barberos SET nombre = ?, descripcion = ?, activo = ? WHERE id = ?').run(...v, id).changes === 1 }));
});
// Foto del barbero: el panel la recorta y reduce a 600×600 (≈60 KB, sin datos de ubicación) antes de subirla
app.put(`${API_PANEL}/barberos/:id/foto`, requireAdmin, recibirImagen('1mb'), (req, res) => {
  const id = idValido(req.params.id);
  if (!id || !db.prepare('SELECT 1 FROM barberos WHERE id = ?').get(id)) return res.status(404).json({ error: 'No encontrado' });
  const img = leerImagen(req);
  if (img.error) return res.status(img.status).json({ error: img.error });
  db.prepare(`INSERT INTO fotos_barberos (barbero_id, tipo, datos, version) VALUES (?,?,?,?)
    ON CONFLICT(barbero_id) DO UPDATE SET tipo = excluded.tipo, datos = excluded.datos, version = excluded.version`)
    .run(id, img.tipo, req.body, img.version);
  res.json({ ok: true, foto: urlFoto(id, img.version) });
});
app.delete(`${API_PANEL}/barberos/:id/foto`, requireAdmin, (req, res) => {
  const id = idValido(req.params.id); if (!id) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: db.prepare('DELETE FROM fotos_barberos WHERE barbero_id = ?').run(id).changes === 1 });
});

// ---------- admin: respaldo de la base de datos ----------
// Copia completa y consistente (citas, clientes, configuración y fotos), hecha con la base funcionando
app.get(`${API_PANEL}/respaldo`, requireAdmin, async (req, res, next) => {
  const tmp = path.join(os.tmpdir(), `respaldo-${crypto.randomBytes(8).toString('hex')}.db`);
  const borrar = () => fs.rm(tmp, { force: true }, () => {});
  try {
    await db.backup(tmp);
    const { fecha, min } = ahoraMX();
    const nombre = negocio().nombre.normalize('NFD').replace(/[\u0300-\u036f'’]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'barberia';
    res.download(tmp, `respaldo-${nombre}-${fecha}-${toHHMM(min).replace(':', '')}.db`, (err) => {
      borrar();
      if (err && !res.headersSent) next(err);
    });
  } catch (e) { borrar(); next(e); }
});

// ---------- admin: imágenes de referencia (carrusel del sitio) ----------
// El panel las reduce a máximo 1600 px y les quita los datos ocultos antes de subirlas (≈150–300 KB)
app.get(`${API_PANEL}/referencias`, requireAdmin, (req, res) => {
  res.json({ referencias: db.prepare(SQL_REFERENCIAS).all(), max: MAX_REFERENCIAS });
});
app.post(`${API_PANEL}/referencias`, requireAdmin, recibirImagen('2mb'), (req, res) => {
  if (db.prepare('SELECT COUNT(*) AS n FROM referencias').get().n >= MAX_REFERENCIAS) {
    return res.status(409).json({ error: `Máximo ${MAX_REFERENCIAS} imágenes. Borra alguna para subir otra.` });
  }
  const img = leerImagen(req);
  if (img.error) return res.status(img.status).json({ error: img.error });
  const orden = db.prepare('SELECT COALESCE(MAX(orden), 0) + 1 AS o FROM referencias').get().o;
  const titulo = texto(String(req.query.titulo ?? '').replace(/\s+/g, ' '), 80);
  const id = Number(db.prepare('INSERT INTO referencias (titulo, tipo, datos, version, orden) VALUES (?,?,?,?,?)')
    .run(titulo, img.tipo, req.body, img.version, orden).lastInsertRowid);
  res.json({ ok: true, id });
});
app.put(`${API_PANEL}/referencias/orden`, requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(idValido) : [];
  const actuales = db.prepare('SELECT id FROM referencias').all().map((r) => r.id);
  if (ids.length !== actuales.length || ids.some((id) => !actuales.includes(id)) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: 'Orden inválido' });
  }
  const upd = db.prepare('UPDATE referencias SET orden = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, i) => upd.run(i + 1, id)))();
  res.json({ ok: true });
});
app.put(`${API_PANEL}/referencias/:id`, requireAdmin, (req, res) => {
  const id = idValido(req.params.id); if (!id) return res.status(404).json({ error: 'No encontrado' });
  const titulo = texto(String(req.body?.titulo ?? '').replace(/\s+/g, ' '), 80);
  res.json({ ok: db.prepare('UPDATE referencias SET titulo = ? WHERE id = ?').run(titulo, id).changes === 1 });
});
app.delete(`${API_PANEL}/referencias/:id`, requireAdmin, (req, res) => {
  const id = idValido(req.params.id); if (!id) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: db.prepare('DELETE FROM referencias WHERE id = ?').run(id).changes === 1 });
});

app.post(`${API_PANEL}/servicios`, requireAdmin, (req, res) => responder(res, leerServicio(req.body), (v) =>
  ({ id: Number(db.prepare('INSERT INTO servicios (nombre, descripcion, precio, duracion, activo) VALUES (?,?,?,?,?)').run(...v).lastInsertRowid) })));
app.put(`${API_PANEL}/servicios/:id`, requireAdmin, (req, res) => {
  const id = idValido(req.params.id); if (!id) return res.status(404).json({ error: 'No encontrado' });
  responder(res, leerServicio(req.body), (v) => ({ ok: db.prepare('UPDATE servicios SET nombre = ?, descripcion = ?, precio = ?, duracion = ?, activo = ? WHERE id = ?').run(...v, id).changes === 1 }));
});

// Cuerpo: { dias: { "0": null, "1": ["10:00","19:00"], ... } }
app.put(`${API_PANEL}/horario`, requireAdmin, (req, res) => {
  const dias = req.body?.dias || {};
  const filas = [];
  for (let d = 0; d <= 6; d++) {
    const v = dias[d];
    if (v === null || v === undefined) { filas.push([null, null, d]); continue; }
    if (!Array.isArray(v) || !HHMM.test(v[0]) || !HHMM.test(v[1]) || toMin(v[0]) >= toMin(v[1])) {
      return res.status(400).json({ error: 'Revisa el horario: la apertura debe ser antes del cierre' });
    }
    filas.push([v[0], v[1], d]);
  }
  const upd = db.prepare('UPDATE horario SET abre = ?, cierra = ? WHERE dia = ?');
  db.transaction(() => filas.forEach((f) => upd.run(...f)))();
  res.json({ ok: true, horario: horario() });
});

app.post(`${API_PANEL}/citas/:id/cancelar`, requireAdmin, (req, res) => {
  const id = idValido(req.params.id); if (!id) return res.status(404).json({ error: 'No encontrado' });
  const r = db.prepare("UPDATE citas SET estado='cancelada' WHERE id = ? AND estado != 'cancelada'").run(id);
  if (r.changes) sincronizarAgenda(); // se quita de la agenda de Google
  res.json({ ok: r.changes === 1 });
});

// ---------- agenda de Google: citas pagadas al calendario de la barbería ----------
// Agrega las citas pagadas de hoy en adelante que aún no están y quita las canceladas. Si Google no responde,
// se reintenta en la siguiente vuelta (cada 10 min o con el siguiente pago); el id del evento evita duplicados.
let sincronizando = null, otraVuelta = false;
function sincronizarAgenda() {
  if (!agenda.activa()) return Promise.resolve();
  if (sincronizando) { otraVuelta = true; return sincronizando; }
  sincronizando = (async () => {
    do {
      otraVuelta = false;
      const nuevas = db.prepare("SELECT id FROM citas WHERE estado = 'pagada' AND agenda_en IS NULL AND fecha >= ? ORDER BY id LIMIT 50")
        .all(ahoraMX().fecha);
      for (const { id } of nuevas) {
        let marca = "datetime('now')";
        try { await agenda.agregar(citaCompleta('c.id = ?', id), negocio()); } catch (e) {
          if (!e.permanente) throw e; // Google caído o sin permiso: se reintenta después
          console.error('[agenda de Google] cita', id, e.message);
          marca = "'omitida'"; // Google rechaza esta cita: no se reintenta en cada vuelta
        }
        db.prepare(`UPDATE citas SET agenda_en = ${marca} WHERE id = ?`).run(id);
      }
      const canceladas = db.prepare("SELECT id, codigo FROM citas WHERE estado = 'cancelada' AND agenda_en IS NOT NULL LIMIT 50").all();
      for (const c of canceladas) {
        await agenda.quitar(c.codigo);
        db.prepare('UPDATE citas SET agenda_en = NULL WHERE id = ?').run(c.id);
      }
    } while (otraVuelta);
  })().catch((e) => console.error('[agenda de Google]', e.message)).finally(() => { sincronizando = null; });
  return sincronizando;
}
setTimeout(sincronizarAgenda, 20 * 1000);
setInterval(sincronizarAgenda, 10 * 60 * 1000);

// ---------- recordatorios: correo al cliente un día antes de su cita ----------
// Cada 10 min busca citas pagadas que empiezan en las próximas 24 h y aún no tienen recordatorio.
// No avisa si la cita se pagó hace menos de 3 h (el cliente acaba de recibir su confirmación).
async function enviarRecordatorios() {
  if (!mail.configurado()) return;
  const desde = fechaHoraMX(new Date()), hasta = fechaHoraMX(new Date(Date.now() + 24 * 3600 * 1000));
  const pendientes = db.prepare(`SELECT id FROM citas
    WHERE estado = 'pagada' AND recordatorio_en IS NULL
      AND (fecha || ' ' || hora) > ? AND (fecha || ' ' || hora) <= ?
      AND pagada_en <= datetime('now', '-3 hours')`).all(desde, hasta);
  for (const { id } of pendientes) {
    // Se marca antes de enviar: un correo que falla no se reintenta cada 10 minutos
    db.prepare("UPDATE citas SET recordatorio_en = datetime('now') WHERE id = ?").run(id);
    const cita = citaCompleta('c.id = ?', id);
    await mail.recordatorioCliente(cita, negocio()).catch((e) => console.error('[recordatorio]', cita.codigo, e.message));
  }
}
const revisarRecordatorios = () => enviarRecordatorios().catch((e) => console.error('[recordatorios]', e.message));
setTimeout(revisarRecordatorios, 30 * 1000);
setInterval(revisarRecordatorios, 10 * 60 * 1000);

// Rutas que no existen: respuesta neutra, sin revelar con qué está hecho el servidor
app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));
app.use((req, res) => res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>No encontrado</title>' +
  '<p style="font-family:sans-serif;padding:40px;text-align:center">Página no encontrada. <a href="/">Volver al inicio</a></p>'));

// Errores: nunca se muestran rutas ni el stack del servidor al visitante
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Solicitud inválida' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Solicitud demasiado grande' });
  console.error(err);
  res.status(500).json({ error: 'Error del servidor' });
});

app.listen(PORT, () => {
  console.log(`Barbería lista en ${BASE_URL}`);
  console.log(`Panel admin (ruta privada, no la compartas): ${BASE_URL}/${RUTA_PANEL}`);
  // En pruebas locales: las direcciones para abrir el sitio desde el celular u otra computadora de la misma red
  // Se omiten las 169.254.x.x (adaptador sin conexión) y los adaptadores virtuales van al final
  if (!process.env.BASE_URL && !process.env.RENDER_EXTERNAL_URL) {
    const VIRTUAL = /vethernet|virtual|vmware|vbox|wsl|hyper-v|docker|bridge|tailscale|zerotier|vpn|loopback/i;
    const redes = Object.entries(os.networkInterfaces())
      .flatMap(([nombre, lista]) => (lista || []).map((i) => ({ nombre, ...i })))
      .filter((i) => !i.internal && (i.family === 'IPv4' || i.family === 4) && !i.address.startsWith('169.254.'))
      // 192.168.137.x es la "zona con cobertura" (hotspot) de Windows: solo sirve si el celular se conecta a ella
      .map((i) => ({ ...i, virtual: VIRTUAL.test(i.nombre), hotspot: i.address.startsWith('192.168.137.') }))
      .sort((a, b) => (a.virtual + a.hotspot * 0.5) - (b.virtual + b.hotspot * 0.5));
    if (!redes.length) console.log('No hay red local: conecta esta computadora al Wi-Fi para probar desde el celular.');
    for (const r of redes) {
      const nota = r.virtual ? ', adaptador virtual: probablemente no sirve'
        : r.hotspot ? ', hotspot de esta PC: solo si el celular se conecta a ese hotspot' : '';
      console.log(`En tu red [${r.nombre}${nota}]: http://${r.address}:${PORT}  ·  panel: http://${r.address}:${PORT}/${RUTA_PANEL}`);
    }
    if (redes.length) console.log(`¿No abre en el celular? Escribe la dirección completa con :${PORT} y revisa el Firewall de Windows (README, sección 2).`);
  }
  if (agenda.activa()) console.log(`Agenda de Google activa → ${agenda.estado().calendario}`);
});
