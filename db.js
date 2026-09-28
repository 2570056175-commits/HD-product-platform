const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'platform.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE NOT NULL,
    name_cn TEXT NOT NULL,
    name_en TEXT,
    specification TEXT,
    material TEXT,
    hs_code TEXT,
    moq INTEGER,
    price REAL,
    status TEXT DEFAULT 'draft',
    category TEXT,
    tags TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    name TEXT,
    type TEXT,
    url TEXT,
    size INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    category TEXT,
    product_ids TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  bcrypt.hash('admin123', 10, (err, hash) => {
    db.get("SELECT id FROM users WHERE username='admin'", (err, row) => {
      if (!row) {
        db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", 
          ['admin', hash, 'admin']);
      }
    });
  });
});

module.exports = db;
