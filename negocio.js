// ✏️ Datos de la barbería. Para instalar el sistema a otro cliente, cambia este archivo y las
// imágenes de public/img/; no hace falta tocar el HTML.
//
// El dueño puede cambiar después los datos de contacto (nombre, dirección, teléfono, redes...)
// desde el panel de administrador; lo que guarde ahí tiene prioridad sobre este archivo.
module.exports = {
  nombre: "Style Cut's",               // la primera palabra se ve en blanco y el resto en dorado
  eslogan: 'Cortes, barba y estilo con reserva en línea.',
  direccion: 'Libra 508, La Estrella, 20150',
  ciudadEstado: 'Aguascalientes, Ags.',
  telefono: '449 902 5586',            // 10 dígitos
  whatsapp: '449 902 5586',            // vacío si no tienen WhatsApp
  correo: '',                          // correo público de contacto (vacío = no se muestra)
  instagram: '',                       // solo el usuario, sin @ (vacío = no se muestra)
  facebook: '',
  tiktok: '',
  // Ficha de la barbería en Google Maps: el botón "Cómo llegar" la abre (vacío = búsqueda por dirección)
  mapaUrl: 'https://share.google/4c1gxY18Wdpzxw9p0',
  // Enlace para opinar en Google; se ofrece a todos los clientes después de su reseña (vacío = no se ofrece)
  googleResenas: 'https://share.google/4c1gxY18Wdpzxw9p0',

  // Solo se cambian aquí (no desde el panel)
  colores: {
    acento: '#d8b45f',                 // dorado principal
    acentoClaro: '#f1d792',
    acentoOscuro: '#b88a35',
  },
  banner: 'img/banner.webp',           // imagen del encabezado (2000 px de ancho)
  bannerMovil: 'img/banner-1000.webp', // la misma a 1000 px para celular
  bannerAlt: 'Fachada de la barbería iluminada de noche, con su logo dorado y una camioneta negra al frente',
};
