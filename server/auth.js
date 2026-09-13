import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { getDb } from './db.js';
import { config } from './config.js';

const scryptAsync = promisify(scrypt);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'eb_session';
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePhone(phoneCountry, phone) {
  const country = String(phoneCountry || '').replace(/\D/g, '');
  const local = String(phone || '').replace(/\D/g, '');
  if (!country || local.length < 6 || local.length > 12) return '';
  const national = local.replace(/^0+/, '');
  const value = `+${country}${national}`;
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : '';
}

function hashOtp(code) {
  return createHash('sha256').update(String(code)).digest('hex');
}

function configuredWhatsApp() {
  return config.twilioAccountSid && config.twilioAuthToken && config.twilioWhatsAppFrom;
}

async function sendWhatsAppCode(phone, code) {
  if (!configuredWhatsApp()) {
    if (config.nodeEnv === 'production' && !config.authOtpDevMode) {
      throw new Error('WhatsApp delivery is not configured.');
    }
    console.info(`[auth] WhatsApp OTP for ${phone}: ${code}`);
    return { development: true };
  }

  const body = new URLSearchParams({
    To: `whatsapp:${phone}`,
    From: `whatsapp:${config.twilioWhatsAppFrom}`,
    Body: `Your Evolved & Balanced verification code is ${code}. It expires in 5 minutes.`,
  });
  const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.twilioAccountSid)}/Messages.json`,
    { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body },
  );
  if (!response.ok) throw new Error(`WhatsApp delivery failed (${response.status}).`);
  return { development: false };
}

function findUserByPhone(phone) {
  return getDb().prepare(`
    SELECT * FROM users
    WHERE phone_e164 = ?
      OR phone_country || phone = ?
      OR replace(phone_country, '+', '') || phone = ?
      OR phone = ?
  `).get(
    phone, phone, phone.replace('+', ''), phone,
  );
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role || 'client',
    fullName: row.full_name,
    phoneCountry: row.phone_country || '',
    phone: row.phone || '',
    whatsappNumber: row.phone_e164 || normalizePhone(row.phone_country, row.phone) || '',
    dob: row.dob || '',
    gender: row.gender || '',
    address: row.address || '',
    height: row.height || '',
    weight: row.weight || '',
  };
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 2) return false;
  const salt = Buffer.from(parts[0], 'hex');
  const expected = Buffer.from(parts[1], 'hex');
  if (!salt.length || expected.length !== 32) return false;
  const actual = await scryptAsync(password, salt, 32);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  String(header).split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch (err) {
      out[key] = value;
    }
  });
  return out;
}

function setSessionCookie(res, sessionId, maxAgeMs) {
  const parts = [
    COOKIE_NAME + '=' + encodeURIComponent(sessionId),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + Math.floor(maxAgeMs / 1000),
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', COOKIE_NAME + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function createSession(userId, remember) {
  const db = getDb();
  const id = randomBytes(32).toString('hex');
  const maxAge = remember ? REMEMBER_MS : SESSION_MS;
  const expiresAt = Date.now() + maxAge;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, expiresAt);
  return { id, maxAge };
}

export function getUserFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[COOKIE_NAME];
  if (!sessionId) return null;
  const row = getDb().prepare(`
    SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ? AND sessions.expires_at > ?
  `).get(sessionId, Date.now());
  return row || null;
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function requireUser(req, res) {
  const user = getUserFromRequest(req);
  if (!user) {
    sendJson(res, 401, { error: 'Sign in to continue.' });
    return null;
  }
  return user;
}

export function attachAuthRoutes(router) {
  router.post('/admin/login', async (req, res) => {
    try {
      const body = req.body || {};
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      if (!EMAIL_RE.test(email) || !password) {
        return sendJson(res, 400, { error: 'Enter your admin email and password.' });
      }

      const user = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
      const valid = user ? await verifyPassword(password, user.password_hash) : await verifyPassword(password, '00'.repeat(16) + ':' + '00'.repeat(32));
      if (!user || user.role !== 'admin' || !valid) {
        return sendJson(res, 401, { error: 'Invalid admin credentials.' });
      }

      const session = createSession(user.id, false);
      setSessionCookie(res, session.id, session.maxAge);
      return sendJson(res, 200, { user: publicUser(user) });
    } catch (err) {
      console.error('admin login failed', err);
      return sendJson(res, 500, { error: 'Could not sign in to the admin dashboard.' });
    }
  });

  router.post('/auth/request-code', async (req, res) => {
    try {
      const body = req.body || {};
      const purpose = body.purpose === 'register' ? 'register' : 'login';
      const phone = normalizePhone(body.phoneCountry, body.phone);
      if (!phone) return sendJson(res, 400, { error: 'Enter a valid WhatsApp number.' });

      const db = getDb();
      const existing = findUserByPhone(phone);
      if (purpose === 'login' && !existing) return sendJson(res, 404, { error: 'No account was found for this WhatsApp number.' });
      if (purpose === 'register' && existing) return sendJson(res, 409, { error: 'An account with this WhatsApp number already exists.' });

      let payload = null;
      if (purpose === 'register') {
        const fullName = String(body.fullName || '').trim();
        const dob = String(body.dob || '').trim();
        const gender = String(body.gender || '').trim();
        const address = String(body.address || '').trim();
        const height = String(body.height || '').trim();
        const weight = String(body.weight || '').trim();
        if (!fullName || !dob || !gender || !address || !height || !weight) {
          return sendJson(res, 400, { error: 'Please complete all profile fields.' });
        }
        payload = JSON.stringify({
          fullName, email: normalizeEmail(body.email), phoneCountry: String(body.phoneCountry || '').trim(),
          phone: String(body.phone || '').trim(), phoneE164: phone, dob, gender, address, height, weight,
        });
      }

      const code = String(randomInt(100000, 1000000));
      db.prepare('DELETE FROM otp_challenges WHERE phone_e164 = ? AND purpose = ?').run(phone, purpose);
      db.prepare(`
        INSERT INTO otp_challenges (phone_e164, purpose, code_hash, payload, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(phone, purpose, hashOtp(code), payload, Date.now() + OTP_TTL_MS);

      const delivery = await sendWhatsAppCode(phone, code);
      const response = { message: 'A verification code was sent to WhatsApp.' };
      if (delivery.development) response.devCode = code;
      return sendJson(res, 200, response);
    } catch (err) {
      console.error('request code failed', err);
      return sendJson(res, 503, { error: 'Could not send the WhatsApp verification code.' });
    }
  });

  router.post('/auth/verify-code', async (req, res) => {
    try {
      const body = req.body || {};
      const purpose = body.purpose === 'register' ? 'register' : 'login';
      const phone = normalizePhone(body.phoneCountry, body.phone);
      const code = String(body.code || '').trim();
      if (!phone || !/^\d{6}$/.test(code)) return sendJson(res, 400, { error: 'Enter the six-digit verification code.' });

      const db = getDb();
      const challenge = db.prepare(`
        SELECT * FROM otp_challenges
        WHERE phone_e164 = ? AND purpose = ? AND expires_at > ?
        ORDER BY id DESC LIMIT 1
      `).get(phone, purpose, Date.now());
      if (!challenge) return sendJson(res, 400, { error: 'This code has expired. Request a new one.' });
      if (challenge.attempts >= OTP_MAX_ATTEMPTS) return sendJson(res, 429, { error: 'Too many attempts. Request a new code.' });

      db.prepare('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?').run(challenge.id);
      if (hashOtp(code) !== challenge.code_hash) return sendJson(res, 401, { error: 'That verification code is incorrect.' });

      let user;
      if (purpose === 'register') {
        const data = JSON.parse(challenge.payload || '{}');
        const email = data.email || `${phone.replace(/\D/g, '')}@whatsapp.local`;
        const passwordHash = await hashPassword(randomBytes(24).toString('hex'));
        const info = db.prepare(`
          INSERT INTO users (email, password_hash, full_name, phone_country, phone, phone_e164, dob, gender, address, height, weight)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(email, passwordHash, data.fullName, data.phoneCountry, data.phone, phone, data.dob, data.gender, data.address, data.height, data.weight);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      } else {
        user = findUserByPhone(phone);
      }
      if (!user) return sendJson(res, 404, { error: 'Account not found.' });

      db.prepare('DELETE FROM otp_challenges WHERE id = ?').run(challenge.id);
      const session = createSession(user.id, true);
      setSessionCookie(res, session.id, session.maxAge);
      return sendJson(res, purpose === 'register' ? 201 : 200, { user: publicUser(user) });
    } catch (err) {
      if (err && /UNIQUE constraint failed/i.test(String(err.message || ''))) {
        return sendJson(res, 409, { error: 'An account with this WhatsApp number or email already exists.' });
      }
      console.error('verify code failed', err);
      return sendJson(res, 500, { error: 'Could not verify the WhatsApp code.' });
    }
  });

  router.post('/register', async (req, res) => {
    try {
      const body = req.body || {};
      const fullName = String(body.fullName || '').trim();
      const suppliedEmail = normalizeEmail(body.email);
      const password = String(body.password || '');
      const phoneCountry = String(body.phoneCountry || '').trim();
      const phone = String(body.phone || '').trim();
      const phoneE164 = normalizePhone(phoneCountry, phone);
      const email = suppliedEmail || (phoneE164 ? `${phoneE164.replace(/\D/g, '')}@whatsapp.local` : '');
      const dob = String(body.dob || '').trim();
      const gender = String(body.gender || '').trim();
      const address = String(body.address || '').trim();
      const height = String(body.height || '').trim();
      const weight = String(body.weight || '').trim();

      if (!fullName) return sendJson(res, 400, { error: 'Full name is required.' });
      if (suppliedEmail && !EMAIL_RE.test(suppliedEmail)) return sendJson(res, 400, { error: 'Enter a valid email address.' });
      if (password.length < 8) return sendJson(res, 400, { error: 'Password must be at least 8 characters.' });
      if (!phoneE164 || !dob || !gender || !address || !height || !weight) {
        return sendJson(res, 400, { error: 'Please complete all fields.' });
      }

      const db = getDb();
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existing) return sendJson(res, 409, { error: 'An account with that email already exists.' });
      if (findUserByPhone(phoneE164)) return sendJson(res, 409, { error: 'An account with that WhatsApp number already exists.' });

      const passwordHash = await hashPassword(password);
      const info = db.prepare(`
        INSERT INTO users (email, password_hash, full_name, phone_country, phone, phone_e164, dob, gender, address, height, weight)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(email, passwordHash, fullName, phoneCountry, phone, phoneE164, dob, gender, address, height, weight);

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      const session = createSession(user.id, true);
      setSessionCookie(res, session.id, session.maxAge);
      return sendJson(res, 201, { user: publicUser(user) });
    } catch (err) {
      if (err && /UNIQUE constraint failed/i.test(String(err.message || ''))) {
        return sendJson(res, 409, { error: 'An account with that email already exists.' });
      }
      console.error('register failed', err);
      return sendJson(res, 500, { error: 'Could not create the account.' });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const body = req.body || {};
      const email = normalizeEmail(body.email);
      const phone = normalizePhone(body.phoneCountry, body.phone);
      const password = String(body.password || '');
      const remember = Boolean(body.remember);

      if ((!EMAIL_RE.test(email) && !phone) || !password) {
        return sendJson(res, 400, { error: 'Enter a valid WhatsApp number and password.' });
      }

      const user = phone ? findUserByPhone(phone) : getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
      const ok = user ? await verifyPassword(password, user.password_hash) : await verifyPassword(password, '00'.repeat(16) + ':' + '00'.repeat(32));
      if (!user || !ok) {
        return sendJson(res, 401, { error: 'Invalid email or password.' });
      }

      const session = createSession(user.id, remember);
      setSessionCookie(res, session.id, session.maxAge);
      return sendJson(res, 200, { user: publicUser(user) });
    } catch (err) {
      console.error('login failed', err);
      return sendJson(res, 500, { error: 'Could not sign in.' });
    }
  });

  router.post('/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[COOKIE_NAME];
    if (sessionId) {
      getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    }
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
  });

  router.get('/me', (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return sendJson(res, 401, { error: 'Not signed in.' });
    sendJson(res, 200, { user: publicUser(user) });
  });
}
