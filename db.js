const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, 'barberia.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS barberos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  especialidad TEXT DEFAULT '',
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS servicios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  precio INTEGER NOT NULL,          -- en pesos MXN
  duracion INTEGER NOT NULL,        -- en minutos (múltiplos de 30)
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS citas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  cliente_nombre TEXT NOT NULL,
  cliente_email TEXT NOT NULL,
  cliente_tel TEXT NOT NULL,
  barbero_id INTEGER NOT NULL REFERENCES barberos(id),
  servicio_id INTEGER NOT NULL REFERENCES servicios(id),
  fecha TEXT NOT NULL,              -- YYYY-MM-DD
  hora TEXT NOT NULL,               -- HH:MM
  duracion INTEGER NOT NULL,
  precio INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente | pagada | cancelada | conflicto (pagó sin horario)
  mp_preference_id TEXT,
  creada_en TEXT NOT NULL DEFAULT (datetime('now')),
  pagada_en TEXT
);

CREATE INDEX IF NOT EXISTS idx_citas_barbero_fecha ON citas (barbero_id, fecha);
CREATE INDEX IF NOT EXISTS idx_citas_estado ON citas (estado);

-- Sesiones del panel: solo la huella (SHA-256) de la llave que lleva la cookie, nunca la llave
CREATE TABLE IF NOT EXISTS sesiones (
  id_hash TEXT PRIMARY KEY,
  huella TEXT NOT NULL,
  expira INTEGER NOT NULL,
  creada TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Datos del negocio que el dueño edita en el panel (sobrescriben a negocio.js)
CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- Foto de cada barbero (la sube el dueño desde el panel). Se guarda en la base para que viaje con los respaldos.
CREATE TABLE IF NOT EXISTS fotos_barberos (
  barbero_id INTEGER PRIMARY KEY REFERENCES barberos(id),
  tipo TEXT NOT NULL,               -- image/webp | image/jpeg | image/png
  datos BLOB NOT NULL,
  version TEXT NOT NULL             -- huella corta del archivo: cambia la URL al cambiar la foto
);

-- Imágenes de referencia (trabajos de la barbería) que el dueño sube desde el panel; se ven en un carrusel
CREATE TABLE IF NOT EXISTS referencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL,
  datos BLOB NOT NULL,
  version TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  creada TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Visitas que llegan por los enlaces de cada red (/ig, /tt, /fb, /qr): una por persona, canal y día
CREATE TABLE IF NOT EXISTS visitas (
  canal TEXT NOT NULL,
  fecha TEXT NOT NULL,              -- YYYY-MM-DD (hora de México)
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (canal, fecha)
);

-- Reseñas verificadas: solo las puede dejar quien pagó una cita, con el enlace único que le llega por correo
CREATE TABLE IF NOT EXISTS resenas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cita_id INTEGER NOT NULL UNIQUE REFERENCES citas(id),
  token_hash TEXT NOT NULL UNIQUE,  -- huella SHA-256 del enlace; el enlace mismo no se guarda
  estrellas INTEGER CHECK (estrellas BETWEEN 1 AND 5),
  comentario TEXT NOT NULL DEFAULT '',
  nombre TEXT NOT NULL DEFAULT '',  -- cómo quiere aparecer el cliente (p. ej. "Ana L.")
  estado TEXT NOT NULL DEFAULT 'pedida',  -- pedida (sin responder) | publicada | oculta
  pedida_en TEXT NOT NULL DEFAULT (datetime('now')),
  respondida_en TEXT
);
CREATE INDEX IF NOT EXISTS idx_resenas_estado ON resenas (estado);

-- Horario de atención: 0 = domingo ... 6 = sábado. abre/cierra en NULL = cerrado ese día.
CREATE TABLE IF NOT EXISTS horario (
  dia INTEGER PRIMARY KEY CHECK (dia BETWEEN 0 AND 6),
  abre TEXT,
  cierra TEXT
);
`);

// Columnas agregadas después de la primera versión (las bases ya creadas se actualizan solas)
const columnas = db.prepare('PRAGMA table_info(citas)').all().map((c) => c.name);
if (!columnas.includes('recordatorio_en')) db.exec('ALTER TABLE citas ADD COLUMN recordatorio_en TEXT');
// Cuándo se agregó la cita a la agenda de Google (NULL = aún no está, o ya se quitó)
if (!columnas.includes('agenda_en')) db.exec('ALTER TABLE citas ADD COLUMN agenda_en TEXT');
// De qué red llegó el cliente (instagram, tiktok, facebook, qr) y cuándo se le pidió su reseña
if (!columnas.includes('origen')) db.exec('ALTER TABLE citas ADD COLUMN origen TEXT');
if (!columnas.includes('resena_pedida_en')) db.exec('ALTER TABLE citas ADD COLUMN resena_pedida_en TEXT');
const colBarberos = db.prepare('PRAGMA table_info(barberos)').all().map((c) => c.name);
if (!colBarberos.includes('descripcion')) db.exec("ALTER TABLE barberos ADD COLUMN descripcion TEXT NOT NULL DEFAULT ''");

// Datos iniciales (solo si las tablas están vacías). Después se editan desde el panel de administrador.
if (db.prepare('SELECT COUNT(*) AS n FROM horario').get().n === 0) {
  const ins = db.prepare('INSERT INTO horario (dia, abre, cierra) VALUES (?, ?, ?)');
  [[0, null, null], [1, '10:00', '19:00'], [2, '10:00', '19:00'], [3, '10:00', '19:00'],
   [4, '10:00', '19:00'], [5, '10:00', '20:00'], [6, '09:00', '18:00']].forEach((d) => ins.run(...d));
}
if (db.prepare('SELECT COUNT(*) AS n FROM barberos').get().n === 0) {
  const ins = db.prepare('INSERT INTO barberos (nombre) VALUES (?)');
  ['Carlos', 'Miguel', 'Andrés'].forEach((n) => ins.run(n));
}
if (db.prepare('SELECT COUNT(*) AS n FROM servicios').get().n === 0) {
  const ins = db.prepare('INSERT INTO servicios (nombre, descripcion, precio, duracion) VALUES (?, ?, ?, ?)');
  // Lista de precios de la barbería (precio en pesos, duración en minutos)
  [
    ['Corte de cabello', 'Corte a tu estilo con acabado a navaja', 180, 30],
    ['Corte con mascarilla', 'Corte de cabello más mascarilla facial', 210, 60],
    ['Corte con facial', 'Corte de cabello más limpieza facial', 280, 60],
    ['Corte de niño', 'Corte de cabello para niños', 150, 30],
    ['Corte y barba', 'Corte de cabello y arreglo de barba', 230, 60],
    ['Corte y barba con vapor y toalla caliente', 'Corte y barba con ritual de vapor y toalla caliente', 280, 60],
    ['Corte, barba, vapor, toalla caliente y facial', 'El paquete completo', 330, 90],
    ['Corte de ceja', 'Perfilado de ceja', 30, 30],
    ['Delineado', 'Delineado del contorno del corte', 110, 30],
    ['Delineado de barba', 'Perfilado de la línea de la barba', 110, 30],
  ].forEach((s) => ins.run(...s));
}

module.exports = db;
