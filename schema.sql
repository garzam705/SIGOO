-- Guardar como schema.sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'client'   -- 'client' o 'admin'
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folio TEXT UNIQUE NOT NULL,
    client_id INTEGER NOT NULL,
    description TEXT,
    estimated_cost REAL DEFAULT 0,
    authorized INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Recibido',  -- Recibido, Diagnostico, Reparado, Entregado
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0
);