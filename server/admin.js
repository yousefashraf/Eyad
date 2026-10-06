import { randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { getDb } from './db.js';
import { getUserFromRequest, sendJson } from './auth.js';
import { ASSIGNMENTS } from './assignments.js';
import { normalizeTransformation, transformationFromRow } from './transformations.js';

const transformationImageDirectory = fileURLToPath(new URL('../data/transformation-uploads/', import.meta.url));
const transformationImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(new Error('Upload a JPEG, PNG, or WebP image.'));
      return;
    }
    callback(null, true);
  },
});

function getTransformationImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (
    buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'webp';
  return null;
}

function requireAdmin(req, res) {
  const user = getUserFromRequest(req);
  if (!user) {
    sendJson(res, 401, { error: 'Not signed in.' });
    return null;
  }
  if (user.role !== 'admin') {
    sendJson(res, 403, { error: 'Admin access required.' });
    return null;
  }
  return user;
}

function safeParseJson(value) {
  try {
    return JSON.parse(value || '{}');
  } catch (err) {
    return {};
  }
}

export function buildDashboardRows(users, assignments, submissions) {
  const assignmentMap = new Map();
  for (const row of assignments || []) {
    assignmentMap.set(`${row.user_id}::${row.assignment_key}`, row);
  }

  const submissionMap = new Map();
  for (const row of submissions || []) {
    submissionMap.set(`${row.user_id}::${row.assignment_key}`, row);
  }

  const allAssignmentKeys = new Set([
    ...Object.keys(ASSIGNMENTS),
    ...[...(assignments || [])].map((row) => row.assignment_key),
    ...[...(submissions || [])].map((row) => row.assignment_key),
  ]);

  return users.map((user) => {
    const forms = {};
    for (const key of allAssignmentKeys) {
      const assignment = assignmentMap.get(`${user.id}::${key}`);
      const submission = submissionMap.get(`${user.id}::${key}`);
      forms[key] = {
        assignmentKey: key,
        status: submission ? 'submitted' : (assignment ? (assignment.status || 'sent') : 'not-assigned'),
        assignedAt: assignment?.assigned_at || null,
        sentAt: assignment?.sent_at || null,
        submissionAt: submission?.submitted_at || null,
        summary: submission?.summary || '',
      };
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      phoneCountry: user.phone_country || '',
      phone: user.phone || '',
      whatsappNumber: user.phone_e164 || `${user.phone_country || ''}${user.phone || ''}`,
      forms,
    };
  });
}

export function attachAdminRoutes(router) {
  router.get('/transformation-images/:filename', async (req, res) => {
    const match = /^([0-9a-f-]{36})\.(jpg|png|webp)$/.exec(req.params.filename);
    if (!match) return sendJson(res, 404, { error: 'Image not found.' });

    try {
      const image = await readFile(join(transformationImageDirectory, match[0]));
      res.setHeader('Content-Type', match[2] === 'jpg' ? 'image/jpeg' : `image/${match[2]}`);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.statusCode = 200;
      return res.end(image);
    } catch (error) {
      if (error.code === 'ENOENT') return sendJson(res, 404, { error: 'Image not found.' });
      console.error('Could not read transformation image:', error);
      return sendJson(res, 500, { error: 'Could not load transformation image.' });
    }
  });

  router.get('/transformations', (_req, res) => {
    const rows = getDb().prepare('SELECT * FROM transformations ORDER BY id ASC').all();
    return sendJson(res, 200, { transformations: rows.map(transformationFromRow) });
  });

  router.post('/admin/transformation-images', (req, res, next) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    transformationImageUpload.single('image')(req, res, (error) => {
      if (!error) return next();
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return sendJson(res, 400, { error: 'Images must be 12 MB or smaller.' });
      }
      return sendJson(res, 400, { error: error.message || 'Could not upload image.' });
    });
  }, async (req, res) => {
    if (!req.file) return sendJson(res, 400, { error: 'Choose an image to upload.' });
    const extension = getTransformationImageType(req.file.buffer);
    if (!extension) return sendJson(res, 400, { error: 'The selected file is not a valid JPEG, PNG, or WebP image.' });

    const filename = `${randomUUID()}.${extension}`;
    try {
      await mkdir(transformationImageDirectory, { recursive: true });
      await writeFile(join(transformationImageDirectory, filename), req.file.buffer, { flag: 'wx' });
      return sendJson(res, 201, { image: { path: `api/transformation-images/${filename}` } });
    } catch (error) {
      console.error('Could not save transformation image:', error);
      return sendJson(res, 500, { error: 'Could not save transformation image.' });
    }
  });

  router.get('/notifications', (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return sendJson(res, 401, { error: 'Not signed in.' });

    const rows = getDb().prepare(`
      SELECT * FROM user_notifications
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 20
    `).all(user.id);

    return sendJson(res, 200, { notifications: rows.map((row) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      kind: row.kind,
      relatedAssignmentKey: row.related_assignment_key,
      isRead: Boolean(row.is_read),
      createdAt: row.created_at,
    })) });
  });

  router.post('/notifications/:id/read', (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return sendJson(res, 401, { error: 'Not signed in.' });

    const notificationId = Number(req.params.id);
    if (!Number.isFinite(notificationId)) {
      return sendJson(res, 400, { error: 'Invalid notification.' });
    }

    getDb().prepare('UPDATE user_notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(notificationId, user.id);
    return sendJson(res, 200, { ok: true });
  });

  router.get('/admin/dashboard', (req, res) => {
    const user = requireAdmin(req, res);
    if (!user) return;

    const db = getDb();
    const users = db.prepare('SELECT * FROM users ORDER BY full_name ASC, id ASC').all();
    const assignments = db.prepare('SELECT * FROM user_form_assignments ORDER BY assigned_at DESC').all();
    const submissions = db.prepare('SELECT * FROM assignment_submissions ORDER BY submitted_at DESC').all();

    const rows = buildDashboardRows(users, assignments, submissions);
    return sendJson(res, 200, { admin: { email: user.email }, users: rows, submissions: submissions.map((row) => ({
      id: row.id,
      userId: row.user_id,
      assignmentKey: row.assignment_key,
      assignmentTitle: row.assignment_title,
      fullName: users.find((u) => u.id === row.user_id)?.full_name || '',
      email: users.find((u) => u.id === row.user_id)?.email || '',
      summary: row.summary || '',
      submittedAt: row.submitted_at,
      payload: safeParseJson(row.payload),
    })) });
  });

  router.get('/admin/transformations', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const rows = getDb().prepare('SELECT * FROM transformations ORDER BY id ASC').all();
    return sendJson(res, 200, { transformations: rows.map(transformationFromRow) });
  });

  router.post('/admin/transformations', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    let transformation;
    try {
      transformation = normalizeTransformation(req.body);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }

    const result = getDb().prepare(`
      INSERT INTO transformations (
        name, duration, type, story, muscle_start, muscle_end, fat_start, fat_end, images_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      transformation.name,
      transformation.duration,
      transformation.type,
      transformation.story,
      transformation.muscleStart,
      transformation.muscleEnd,
      transformation.fatStart,
      transformation.fatEnd,
      JSON.stringify(transformation.images),
    );
    const row = getDb().prepare('SELECT * FROM transformations WHERE id = ?').get(result.lastInsertRowid);
    return sendJson(res, 201, { transformation: transformationFromRow(row) });
  });

  router.put('/admin/transformations/:id', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return sendJson(res, 400, { error: 'Invalid transformation.' });

    let transformation;
    try {
      transformation = normalizeTransformation(req.body);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }

    const db = getDb();
    const current = db.prepare('SELECT id FROM transformations WHERE id = ?').get(id);
    if (!current) return sendJson(res, 404, { error: 'Transformation not found.' });

    db.prepare(`
      UPDATE transformations
      SET name = ?, duration = ?, type = ?, story = ?, muscle_start = ?, muscle_end = ?,
          fat_start = ?, fat_end = ?, images_json = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      transformation.name,
      transformation.duration,
      transformation.type,
      transformation.story,
      transformation.muscleStart,
      transformation.muscleEnd,
      transformation.fatStart,
      transformation.fatEnd,
      JSON.stringify(transformation.images),
      id,
    );
    const row = db.prepare('SELECT * FROM transformations WHERE id = ?').get(id);
    return sendJson(res, 200, { transformation: transformationFromRow(row) });
  });

  router.delete('/admin/transformations/:id', async (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return sendJson(res, 400, { error: 'Invalid transformation.' });

    const db = getDb();
    const current = db.prepare('SELECT images_json FROM transformations WHERE id = ?').get(id);
    if (!current) return sendJson(res, 404, { error: 'Transformation not found.' });

    db.prepare('DELETE FROM transformations WHERE id = ?').run(id);

    const remainingImages = db.prepare('SELECT images_json FROM transformations').all();
    const uploadedImagePattern = /api\/transformation-images\/([0-9a-f-]{36}\.(?:jpg|png|webp))/g;
    const imageFilenames = new Set();
    for (const match of current.images_json.matchAll(uploadedImagePattern)) {
      imageFilenames.add(match[1]);
    }

    let cleanupWarning = '';
    for (const filename of imageFilenames) {
      if (remainingImages.some((row) => row.images_json.includes(filename))) continue;
      try {
        await unlink(join(transformationImageDirectory, filename));
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`Could not remove unused transformation image ${filename}:`, error);
          cleanupWarning = 'Transformation deleted, but one or more unused image files could not be removed.';
        }
      }
    }

    return sendJson(res, 200, { ok: true, ...(cleanupWarning ? { warning: cleanupWarning } : {}) });
  });

  router.post('/admin/assign-form', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const body = req.body || {};
    const userId = Number(body.userId);
    const assignmentKey = String(body.assignmentKey || '').trim();
    if (!Number.isFinite(userId) || !assignmentKey) {
      return sendJson(res, 400, { error: 'User and assignment are required.' });
    }

    const db = getDb();
    const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!exists) return sendJson(res, 404, { error: 'User not found.' });

    const current = db.prepare(
      'SELECT id FROM user_form_assignments WHERE user_id = ? AND assignment_key = ?'
    ).get(userId, assignmentKey);

    if (current) {
      db.prepare(`
        UPDATE user_form_assignments
        SET status = 'sent', sent_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(current.id);
    } else {
      db.prepare(`
        INSERT INTO user_form_assignments (user_id, assignment_key, status, assigned_at, sent_at, updated_at)
        VALUES (?, ?, 'sent', datetime('now'), datetime('now'), datetime('now'))
      `).run(userId, assignmentKey);
    }

    db.prepare(`
      INSERT INTO user_notifications (user_id, title, message, kind, related_assignment_key, is_read)
      VALUES (?, ?, ?, 'invite', ?, 0)
    `).run(userId, 'New form invitation', `You have been invited to complete the ${ASSIGNMENTS[assignmentKey] || assignmentKey.replace(/-/g, ' ')} form.`, assignmentKey);

    return sendJson(res, 200, { ok: true, assignmentKey });
  });

  router.get('/admin/submissions', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const rows = getDb().prepare(`
      SELECT s.*, u.email, u.full_name
      FROM assignment_submissions s
      JOIN users u ON u.id = s.user_id
      ORDER BY s.submitted_at DESC, s.id DESC
    `).all();

    return sendJson(res, 200, { submissions: rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      fullName: row.full_name,
      email: row.email,
      assignmentKey: row.assignment_key,
      assignmentTitle: row.assignment_title,
      summary: row.summary || '',
      submittedAt: row.submitted_at,
      payload: safeParseJson(row.payload),
    })) });
  });

  router.get('/admin/submissions/:id', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const submissionId = Number(req.params.id);
    if (!Number.isInteger(submissionId) || submissionId < 1) {
      return sendJson(res, 400, { error: 'Invalid submission.' });
    }

    const row = getDb().prepare(`
      SELECT s.*, u.email, u.full_name, u.phone_country, u.phone, u.phone_e164
      FROM assignment_submissions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
    `).get(submissionId);
    if (!row) return sendJson(res, 404, { error: 'Submission not found.' });

    return sendJson(res, 200, { submission: {
      id: row.id,
      userId: row.user_id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone_e164 || `${row.phone_country || ''}${row.phone || ''}`,
      assignmentKey: row.assignment_key,
      assignmentTitle: row.assignment_title,
      summary: row.summary || '',
      submittedAt: row.submitted_at,
      payload: safeParseJson(row.payload),
    } });
  });
}
