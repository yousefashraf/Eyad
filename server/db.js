import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const dataDir = join(rootDir, 'data');
const dbPath = join(dataDir, 'app.db');

mkdirSync(dataDir, { recursive: true });

let db;

function normalizeStoredPhone(country, phone) {
  const countryDigits = String(country || '').replace(/\D/g, '');
  const phoneDigits = String(phone || '').replace(/\D/g, '');
  if (!phoneDigits) return '';
  if (String(phone || '').trim().startsWith('+')) {
    const international = `+${phoneDigits}`;
    return /^\+[1-9]\d{7,14}$/.test(international) ? international : '';
  }
  if (!countryDigits) return '';
  const national = phoneDigits.replace(/^0+/, '');
  const value = `+${countryDigits}${national}`;
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : '';
}

function persist() {
  const data = db.export();
  writeFileSync(dbPath, Buffer.from(data));
}

function statement(sql) {
  return {
    run() {
      const params = Array.prototype.slice.call(arguments);
      db.run(sql, params);
      const result = db.exec('SELECT last_insert_rowid() AS id');
      const lastInsertRowid = result.length ? result[0].values[0][0] : 0;
      persist();
      return { lastInsertRowid };
    },
    get() {
      const params = Array.prototype.slice.call(arguments);
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const row = stmt.step() ? stmt.getAsObject() : undefined;
      stmt.free();
      return row;
    },
    all() {
      const params = Array.prototype.slice.call(arguments);
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
  };
}

function wrap(raw) {
  db = raw;
  return {
    exec(sql) {
      db.exec(sql);
      persist();
    },
    prepare(sql) {
      return statement(sql);
    },
  };
}

export async function initDb() {
  if (db) return;
  const SQL = await initSqlJs({
    locateFile: (file) => join(rootDir, 'node_modules', 'sql.js', 'dist', file),
  });
  const raw = existsSync(dbPath)
    ? new SQL.Database(readFileSync(dbPath))
    : new SQL.Database();

  wrap(raw).exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client',
      full_name TEXT NOT NULL,
      phone_country TEXT,
      phone TEXT,
      dob TEXT,
      gender TEXT,
      address TEXT,
      height TEXT,
      weight TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS otp_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_e164 TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      payload TEXT,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_otp_challenges_phone ON otp_challenges(phone_e164, purpose);

    CREATE TABLE IF NOT EXISTS user_form_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assignment_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS user_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'info',
      related_assignment_key TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assignment_key TEXT NOT NULL,
      assignment_title TEXT NOT NULL,
      payload TEXT NOT NULL,
      summary TEXT,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_user_form_assignments_user ON user_form_assignments(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_form_assignments_key ON user_form_assignments(assignment_key);
    CREATE INDEX IF NOT EXISTS idx_user_form_assignments_user_key ON user_form_assignments(user_id, assignment_key);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON user_notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON user_notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_submissions_user ON assignment_submissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON assignment_submissions(assignment_key);
    CREATE INDEX IF NOT EXISTS idx_submissions_user_assignment ON assignment_submissions(user_id, assignment_key);
  `);

  const userColumns = raw.exec('PRAGMA table_info(users)')[0]?.values || [];
  if (!userColumns.some((column) => column[1] === 'phone_e164')) {
    raw.exec('ALTER TABLE users ADD COLUMN phone_e164 TEXT');
    persist();
  }
  if (!userColumns.some((column) => column[1] === 'role')) {
    raw.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'client'");
    persist();
  }
  const users = raw.exec('SELECT id, phone_country, phone, phone_e164 FROM users')[0]?.values || [];
  for (const [id, phoneCountry, phone, phoneE164] of users) {
    if (!phoneE164) {
      const normalized = normalizeStoredPhone(phoneCountry, phone);
      if (normalized) raw.run('UPDATE users SET phone_e164 = ? WHERE id = ?', [normalized, id]);
    }
  }
  persist();
  raw.run("UPDATE users SET role = 'admin' WHERE lower(email) = ?", [config.adminEmail]);
  persist();
}

export function getDb() {
  if (!db) throw new Error('Database is not initialized');
  return {
    prepare(sql) {
      return statement(sql);
    },
  };
}
