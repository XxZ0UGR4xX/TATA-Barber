const nodemailer = require('nodemailer');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

function fechaLarga(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

function filas(cita) {
  return [
    ['Código', cita.codigo],
    ['Cliente', cita.cliente_nombre],
    ['Teléfono', cita.cliente_tel],
    ['Correo', cita.cliente_email],
    ['Servicio', cita.servicio_nombre],
    ['Barbero', cita.barbero_nombre],
    ['Día', fechaLarga(cita.fecha)],
    ['Horario', `${cita.hora} (${cita.duracion} min)`],
    ['Pagado', `$${cita.precio} MXN`],
  ];
}

function tablaHtml(cita) {
  return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:15px">${filas(cita)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#666">${esc(k)}</td><td style="padding:6px 0;font-weight:bold">${esc(v)}</td></tr>`
    )
    .join('')}</table>`;
}

// Pie de los correos al cliente: dónde y cómo contactar a la barbería
function pie(n) {
  if (!n) return { text: '', html: '' };
  const lineas = [n.nombre, `${n.direccion}, ${n.ciudadEstado}`, n.telefono && `Tel. ${n.telefono}`].filter(Boolean);
  return {
    text: '\n\n' + lineas.join('\n'),
    html: `<p style="font-family:Arial,sans-serif;color:#666;font-size:13px;border-top:1px solid #eee;padding-top:12px;margin-top:18px">
             ${lineas.map(esc).join('<br>')}${n.mapa ? `<br><a href="${esc(n.mapa)}">Cómo llegar</a>` : ''}</p>`,
  };
}

async function enviar(opts) {
  const t = getTransporter();
  if (!t) {
    console.log('[correo] SMTP no configurado, correo NO enviado. Asunto:', opts.subject, '→', opts.to);
    return { enviado: false };
  }
  await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, ...opts });
  return { enviado: true };
}

// Correo a la barbería: nueva cita pagada
async function avisarBarberia(cita) {
  const to = process.env.BARBERIA_EMAIL;
  if (!to) return console.log('[correo] BARBERIA_EMAIL no definido');
  await enviar({
    to,
    subject: `Nueva cita: ${cita.cliente_nombre} · ${cita.fecha} ${cita.hora} · ${cita.barbero_nombre}`,
    text: filas(cita).map(([k, v]) => `${k}: ${v}`).join('\n'),
    html: `<h2 style="font-family:Arial,sans-serif">Nueva cita pagada</h2>${tablaHtml(cita)}`,
  });
}

// Correo de confirmación al cliente (n = datos del negocio para el pie)
async function confirmarCliente(cita, n) {
  const p = pie(n);
  await enviar({
    to: cita.cliente_email,
    subject: `Tu cita está confirmada · ${fechaLarga(cita.fecha)} ${cita.hora}`,
    text: `Hola ${cita.cliente_nombre}, tu cita quedó confirmada.\n\n` + filas(cita).map(([k, v]) => `${k}: ${v}`).join('\n') + p.text,
    html: `<h2 style="font-family:Arial,sans-serif">¡Tu cita está confirmada, ${esc(cita.cliente_nombre)}!</h2>${tablaHtml(cita)}
           <p style="font-family:Arial,sans-serif;color:#666">Te esperamos. Llega 5 minutos antes.</p>${p.html}`,
  });
}

// Pago recibido pero el horario ya no estaba disponible (se ocupó, se canceló o ya pasó)
async function avisarConflicto(cita) {
  const to = process.env.BARBERIA_EMAIL;
  if (!to) return console.log('[correo] BARBERIA_EMAIL no definido');
  const nota = 'El cliente pagó, pero ese horario ya no estaba disponible. Contáctalo para reagendar ' +
    'o devuélvele el pago desde tu cuenta de Mercado Pago. La cita aparece como "Por revisar" en el panel.';
  await enviar({
    to,
    subject: `⚠ Pago sin horario: ${cita.cliente_nombre} · ${cita.fecha} ${cita.hora} · ${cita.barbero_nombre}`,
    text: `${nota}\n\n` + filas(cita).map(([k, v]) => `${k}: ${v}`).join('\n'),
    html: `<h2 style="font-family:Arial,sans-serif">Pago recibido sin horario disponible</h2>
           <p style="font-family:Arial,sans-serif">${esc(nota)}</p>${tablaHtml(cita)}`,
  });
}

async function conflictoCliente(cita, n) {
  const p = pie(n);
  const nota = 'Recibimos tu pago, pero ese horario se ocupó mientras pagabas. ' +
    'Nos pondremos en contacto contigo para reagendar tu cita o devolverte tu dinero.';
  await enviar({
    to: cita.cliente_email,
    subject: `Recibimos tu pago · Vamos a reagendar tu cita`,
    text: `Hola ${cita.cliente_nombre}. ${nota}\n\n` + filas(cita).map(([k, v]) => `${k}: ${v}`).join('\n') + p.text,
    html: `<h2 style="font-family:Arial,sans-serif">Hola ${esc(cita.cliente_nombre)}, recibimos tu pago</h2>
           <p style="font-family:Arial,sans-serif">${esc(nota)}</p>${tablaHtml(cita)}${p.html}`,
  });
}

module.exports = { avisarBarberia, confirmarCliente, avisarConflicto, conflictoCliente };
