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

-- Datos del negocio que el dueño edita en el panel (sobrescriben a negocio.js)
CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

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

// Datos iniciales (solo si las tablas están vacías). Después se editan desde el panel de administrador.
if (db.prepare('SELECT COUNT(*) AS n FROM horario').get().n === 0) {
  const ins = db.prepare('INSERT INTO horario (dia, abre, cierra) VALUES (?, ?, ?)');
  [[0, null, null], [1, '10:00', '19:00'], [2, '10:00', '19:00'], [3, '10:00', '19:00'],
   [4, '10:00', '19:00'], [5, '10:00', '20:00'], [6, '09:00', '18:00']].forEach((d) => ins.run(...d));
}
if (db.prepare('SELECT COUNT(*) AS n FROM barberos').get().n === 0) {
  const ins = db.prepare('INSERT INTO barberos (nombre, especialidad) VALUES (?, ?)');
  ins.run('Carlos', 'Fade y degradados');
  ins.run('Miguel', 'Barba y navaja');
  ins.run('Andrés', 'Corte clásico');
}
if (db.prepare('SELECT COUNT(*) AS n FROM servicios').get().n === 0) {
  const ins = db.prepare('INSERT INTO servicios (nombre, descripcion, precio, duracion) VALUES (?, ?, ?, ?)');
  ins.run('Corte de cabello', 'Corte a tu estilo con acabado a navaja', 150, 30);
  ins.run('Barba', 'Perfilado, toalla caliente y aceites', 100, 30);
  ins.run('Corte + Barba', 'El paquete completo', 220, 60);
  ins.run('Corte infantil', 'Para niños de hasta 12 años', 120, 30);
}

module.exports = db;
