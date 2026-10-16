// Agenda de Google (Google Calendar): cada cita pagada aparece sola en el calendario de la barbería
// y se quita si se cancela. Entra con una "cuenta de servicio" de Google a la que el dueño le compartió
// su calendario (ver DESPLIEGUE.md). Sin GOOGLE_CALENDAR_ID y GOOGLE_CREDENCIALES, no hace nada.
const crypto = require('crypto');
const fs = require('fs');

const TZ = 'America/Mexico_City';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const URL_API = 'https://www.googleapis.com/calendar/v3';
const ALCANCE = 'https://www.googleapis.com/auth/calendar.events';
// Un color por barbero para distinguirlos en el calendario (ids de color de Google Calendar)
const COLORES = ['9', '10', '6', '3', '7', '5', '11', '2', '4', '1', '8'];

const CALENDARIO = String(process.env.GOOGLE_CALENDAR_ID || '').trim();
// GOOGLE_CREDENCIALES: el contenido del archivo JSON de la cuenta de servicio, o la ruta a ese archivo
const CRED = (() => {
  const v = String(process.env.GOOGLE_CREDENCIALES || '').trim();
  if (!v && !CALENDARIO) return null;
  if (!v || !CALENDARIO) {
    console.error('✖ Agenda de Google: faltan GOOGLE_CALENDAR_ID o GOOGLE_CREDENCIALES; queda apagada.');
    return null;
  }
  try {
    const c = JSON.parse(v.startsWith('{') ? v : fs.readFileSync(v, 'utf8'));
    crypto.createPrivateKey(c.private_key); // valida la llave sin mostrarla
    if (!/^[^\s@]+@[^\s@]+$/.test(c.client_email || '')) throw new Error();
    return { email: c.client_email, llave: c.private_key };
  } catch {
    // Sin el detalle del error: podría incluir un pedazo de la llave privada
    console.error('✖ Agenda de Google: GOOGLE_CREDENCIALES no es el JSON de una cuenta de servicio; queda apagada.');
    return null;
  }
})();

const activa = () => !!CRED;
const estado = () => ({ activa: activa(), calendario: activa() ? CALENDARIO : '', cuenta: activa() ? CRED.email : '' });
// Id del evento a partir del código de la cita: así nunca se duplica aunque se intente dos veces
const idEvento = (codigo) => 'cita' + String(codigo).toLowerCase();

let token = null; // { valor, vence }
async function tokenAcceso() {
  if (token && token.vence > Date.now() + 60 * 1000) return token.valor;
  const ahora = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const datos = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: CRED.email, scope: ALCANCE, aud: URL_TOKEN, iat: ahora, exp: ahora + 3600 })}`;
  const firma = crypto.sign('sha256', Buffer.from(datos), CRED.llave).toString('base64url');
  const r = await fetch(URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${datos}.${firma}` }),
    signal: AbortSignal.timeout(10000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(`Google no dio acceso a la cuenta de servicio (${r.status} ${d.error || ''})`.trim());
  token = { valor: d.access_token, vence: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
  return token.valor;
}

async function llamar(metodo, ruta, cuerpo) {
  const r = await fetch(`${URL_API}/calendars/${encodeURIComponent(CALENDARIO)}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${await tokenAcceso()}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (r.status === 401) token = null;
  return r;
}
async function fallo(r) {
  const d = await r.json().catch(() => ({}));
  const pista = r.status === 403 || r.status === 404
    ? ` ¿Compartiste el calendario ${CALENDARIO} con ${CRED.email} ("Hacer cambios en eventos")?` : '';
  const e = new Error(`Google Calendar respondió ${r.status}${d.error?.message ? ': ' + d.error.message : ''}.${pista}`);
  e.permanente = r.status === 400; // datos que Google no acepta: reintentar no sirve
  return e;
}

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
function evento(c, n) {
  const [h, m] = c.hora.split(':').map(Number);
  return {
    id: idEvento(c.codigo),
    summary: `${c.barbero_nombre} · ${c.servicio_nombre} — ${c.cliente_nombre}`,
    location: n ? `${n.nombre}, ${n.direccion}, ${n.ciudadEstado}` : undefined,
    description: [
      `Cliente: ${c.cliente_nombre}`, `Teléfono: ${c.cliente_tel}`, `Correo: ${c.cliente_email}`,
      `Barbero: ${c.barbero_nombre}`, `Servicio: ${c.servicio_nombre} (${c.duracion} min)`,
      `Pagado: $${c.precio} MXN`, `Código: ${c.codigo}`, '', 'Agendada y pagada en línea.',
    ].join('\n'),
    start: { dateTime: `${c.fecha}T${c.hora}:00`, timeZone: TZ },
    end: { dateTime: `${c.fecha}T${hhmm(h * 60 + m + c.duracion)}:00`, timeZone: TZ },
    colorId: COLORES[(Number(c.barbero_id) - 1) % COLORES.length],
    reminders: { useDefault: true },
  };
}

// Agrega la cita. Si ya estaba (otro intento anterior sí llegó), también cuenta como hecha.
async function agregar(cita, n) {
  const r = await llamar('POST', '/events', evento(cita, n));
  if (r.ok || r.status === 409) return true;
  throw await fallo(r);
}
// Quita la cita. Si ya no estaba, también cuenta como hecha.
async function quitar(codigo) {
  const r = await llamar('DELETE', `/events/${idEvento(codigo)}`);
  if (r.ok || r.status === 404 || r.status === 410) return true;
  throw await fallo(r);
}

// Enlace "Agregar a Google Calendar" (para los correos): no necesita ninguna configuración
function enlace(cita, titulo, detalles, lugar) {
  const [h, m] = cita.hora.split(':').map(Number);
  const f = cita.fecha.replace(/-/g, '');
  const t = (min) => hhmm(min).replace(':', '') + '00';
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: titulo, dates: `${f}T${t(h * 60 + m)}/${f}T${t(h * 60 + m + cita.duracion)}`,
    ctz: TZ, details: detalles, ...(lugar ? { location: lugar } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

module.exports = { activa, estado, agregar, quitar, enlace, idEvento };
