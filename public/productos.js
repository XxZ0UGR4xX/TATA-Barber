// ✏️ Productos de la tienda. Solo se entregan en tienda (no hay envíos).
//
// Para agregar un producto: copia un bloque { ... }, cambia los datos y pon sus
// fotos en la carpeta public/img/. La ruleta se arma sola con esta lista.
//   - precio: número en pesos (ej. 1899) o null para mostrar "Pregunta por el precio".
//   - fotos: la primera es la principal; las demás aparecen como miniaturas.

// WhatsApp de la tienda para apartar productos (52 + 10 dígitos, sin espacios)
const TIENDA_WHATSAPP = '524492249214';

const PRODUCTOS = [
  {
    marca: 'BaBylissPRO',
    nombre: 'Recortadora RoseFX',
    descripcion: 'Recortadora profesional toda de metal, con batería intercambiable (sistema FXONE).',
    detalles: [
      'Motor N1 sin escobillas · 7,200 RPM',
      'Batería de litio intercambiable · hasta 3 horas',
      'Cuchilla en "T" de grafito negro, hipoalergénica',
      'Incluye base de carga de doble voltaje y batería',
    ],
    precio: null,
    fotos: ['img/rosefx-frente.webp', 'img/rosefx-reverso.webp'],
  },
];
