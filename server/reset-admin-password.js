import { randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import { initDb, getDb } from './db.js';
import { config } from './config.js';

const scryptAsync = promisify(scrypt);

const password = config.adminNewPassword;
if (password.length < 8) {
  throw new Error('ADMIN_NEW_PASSWORD must contain at least 8 characters.');
}

await initDb();
const db = getDb();
const admin = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(config.adminEmail);
if (!admin) {
  throw new Error('Admin account was not found.');
}

const salt = randomBytes(16);
const hash = await scryptAsync(password, salt, 32);
const passwordHash = `${salt.toString('hex')}:${hash.toString('hex')}`;
db.prepare(
  "UPDATE users SET password_hash = ?, role = 'admin' WHERE lower(email) = ?",
).run(passwordHash, config.adminEmail);

console.log('Admin password reset successfully.');
