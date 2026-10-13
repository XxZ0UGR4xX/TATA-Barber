require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const mail = require('./mail');

const PORT = process.env.PORT || 3000;
// En Render, RENDER_EXTERNAL_URL trae la URL pública (https://...onrender.com). BASE_URL solo hace falta
// para un dominio propio o fuera de Render.
const BASE_URL = (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const TZ = 'America/Mexico_City';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const HOLD_MINUTES = 15; // tiempo que se aparta un horario mientras se paga

// Horario de la barbería: 0 = domingo ... 6 = sábado. null = cerrado.
const HORARIO = {
  0: null,
  1: ['10:00', '19:00'],
  2: ['10:00', '19:00'],
  3: ['10:00', '19:00'],
  4: ['10:00', '19:00'],
  5: ['10:00', '20:00'],
  6: ['09:00', '18:00'],
};
const PASO = 30; // minutos entre horarios

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

if (MODO_DEMO) console.log('⚠  Sin MP_ACCESS_TOKEN: el pago funciona en MODO DEMO (simulado).');
else console.log(`Mercado Pago activo (${MP_ES_PRUEBA ? 'credenciales de PRUEBA' : 'credenciales REALES'}).`);
if (ADMIN_PASS === 'admin123') console.log('⚠  Usando contraseña de admin por defecto. Cámbiala en .env (ADMIN_PASS).');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- utilidades ----------
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function ahoraMX() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date()).map((x) => [x.type, x.value])
  );
  return { fecha: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

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
  const horario = HORARIO[diaSemana(fecha)];
  if (!horario) return [];
  const ocupadas = db.prepare(SQL_OCUPADAS).all(barberoId, fecha, `-${HOLD_MINUTES} minutes`)
    .map((c) => [toMin(c.hora), toMin(c.hora) + c.duracion]);
  const ahora = ahoraMX();
  const [ini, fin] = horario.map(toMin);
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
    mail.avisarBarberia(cita).catch(log('barbería'));
    mail.confirmarCliente(cita).catch(log('cliente'));
  } else if (cita && estado === 'conflicto') {
    console.warn(`[pago] Cita ${cita.codigo} pagada sin horario disponible: queda por revisar.`);
    mail.avisarConflicto(cita).catch(log('barbería'));
    mail.conflictoCliente(cita).catch(log('cliente'));
  }
  return cita;
}

// Consulta un pago en Mercado Pago y, si está aprobado, marca la cita. Devuelve {estado, cita}.
async function procesarPago(paymentId) {
  const pago = await new Payment(mpClient).get({ id: paymentId });
  const citaId = Number(pago.external_reference);
  if (!citaId) return { estado: pago.status };
  if (pago.status === 'approved') return { estado: 'approved', cita: await marcarPagada(citaId) };
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

// ---------- API pública ----------
app.get('/api/config', (req, res) => {
  res.json({
    barberos: db.prepare('SELECT id, nombre, especialidad FROM barberos WHERE activo = 1').all(),
    servicios: db.prepare('SELECT id, nombre, descripcion, precio, duracion FROM servicios WHERE activo = 1').all(),
    diasCerrados: Object.keys(HORARIO).filter((d) => !HORARIO[d]).map(Number),
    horario: HORARIO,
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

app.post('/api/reservas', async (req, res) => {
  try {
    const { nombre, email, telefono, barberoId, servicioId, fecha, hora } = req.body || {};
    const n = String(nombre || '').trim();
    const e = String(email || '').trim().toLowerCase();
    const t = String(telefono || '').replace(/[^\d+]/g, '');
    if (n.length < 2 || n.length > 80) return res.status(400).json({ error: 'Escribe tu nombre' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return res.status(400).json({ error: 'Correo inválido' });
    if (t.replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Teléfono inválido (10 dígitos)' });
    if (!fechaValida(String(fecha)) || !/^\d{2}:\d{2}$/.test(String(hora))) return res.status(400).json({ error: 'Fecha u hora inválida' });

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
      return res.json({ url: `${BASE_URL}/pago-demo.html?codigo=${codigo}`, codigo });
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
        statement_descriptor: 'TATA BARBER',
        back_urls: {
          success: `${BASE_URL}/gracias.html`,
          pending: `${BASE_URL}/gracias.html`,
          failure: `${BASE_URL}/index.html?cancelado=1`,
        },
        // auto_return solo funciona con URL https pública
        ...(BASE_URL.startsWith('https') ? { auto_return: 'approved' } : {}),
        notification_url: `${BASE_URL}/api/mp/webhook`,
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
    if (!paymentId) return res.status(400).json({ error: 'Falta el pago' });
    const r = await procesarPago(paymentId);
    if (!r.cita) return res.status(404).json({ error: 'Cita no encontrada' });
    if (r.estado !== 'approved') return res.status(402).json({ error: 'pendiente', ...publica(r.cita) });
    res.json(publica(r.cita));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo confirmar el pago' });
  }
});

// Modo demo: datos de la cita y "pago" simulado
app.get('/api/demo/:codigo', (req, res) => {
  if (!MODO_DEMO) return res.sendStatus(404);
  const c = citaCompleta('c.codigo = ?', String(req.params.codigo).toUpperCase());
  if (!c) return res.status(404).json({ error: 'Cita no encontrada' });
  res.json(publica(c));
});
app.post('/api/demo/:codigo/pagar', async (req, res) => {
  if (!MODO_DEMO) return res.sendStatus(404);
  const c = citaCompleta('c.codigo = ?', String(req.params.codigo).toUpperCase());
  if (!c) return res.status(404).json({ error: 'Cita no encontrada' });
  if (c.estado === 'cancelada') return res.status(409).json({ error: 'La cita fue cancelada' });
  res.json(publica(await marcarPagada(c.id)));
});

// ---------- admin ----------
const intentos = new Map(); // ip -> {n, hasta}
const firmar = (payload) => {
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${b}.${crypto.createHmac('sha256', SESSION_SECRET).update(b).digest('base64url')}`;
};
function verificar(token) {
  if (!token || !token.includes('.')) return null;
  const [b, sig] = token.split('.');
  const esperado = crypto.createHmac('sha256', SESSION_SECRET).update(b).digest('base64url');
  const a = Buffer.from(sig), z = Buffer.from(esperado);
  if (a.length !== z.length || !crypto.timingSafeEqual(a, z)) return null;
  try {
    const p = JSON.parse(Buffer.from(b, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}
const igual = (x, y) => {
  const a = crypto.createHash('sha256').update(String(x)).digest();
  const b = crypto.createHash('sha256').update(String(y)).digest();
  return crypto.timingSafeEqual(a, b);
};
const requireAdmin = (req, res, next) =>
  verificar(req.cookies.admin_session) ? next() : res.status(401).json({ error: 'No autorizado' });

app.post('/api/admin/login', (req, res) => {
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
  res.cookie('admin_session', firmar({ u: ADMIN_USER, exp: Date.now() + 8 * 3600 * 1000 }), {
    httpOnly: true, sameSite: 'strict', secure: BASE_URL.startsWith('https'), maxAge: 8 * 3600 * 1000,
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => { res.clearCookie('admin_session'); res.json({ ok: true }); });
app.get('/api/admin/sesion', (req, res) => res.json({ activa: !!verificar(req.cookies.admin_session) }));

app.get('/api/admin/citas', requireAdmin, (req, res) => {
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

app.get('/api/admin/resumen', requireAdmin, (req, res) => {
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
    GROUP BY b.id ORDER BY citas DESC`).all();
  res.json({ ...tot, porBarbero, fecha: hoy }); // `hoy` es el número de citas de hoy
});

app.post('/api/admin/citas/:id/cancelar', requireAdmin, (req, res) => {
  const r = db.prepare("UPDATE citas SET estado='cancelada' WHERE id = ? AND estado != 'cancelada'").run(Number(req.params.id));
  res.json({ ok: r.changes === 1 });
});

app.listen(PORT, () => {
  console.log(`Barbería lista en ${BASE_URL}`);
  console.log(`Panel admin: ${BASE_URL}/admin.html`);
});
