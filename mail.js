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

// Correo de confirmación al cliente
async function confirmarCliente(cita) {
  await enviar({
    to: cita.cliente_email,
    subject: `Tu cita está confirmada · ${fechaLarga(cita.fecha)} ${cita.hora}`,
    text: `Hola ${cita.cliente_nombre}, tu cita quedó confirmada.\n\n` + filas(cita).map(([k, v]) => `${k}: ${v}`).join('\n'),
    html: `<h2 style="font-family:Arial,sans-serif">¡Tu cita está confirmada, ${esc(cita.cliente_nombre)}!</h2>${tablaHtml(cita)}
           <p style="font-family:Arial,sans-serif;color:#666">Te esperamos. Llega 5 minutos antes.</p>`,
  });
}

module.exports = { avisarBarberia, confirmarCliente };
