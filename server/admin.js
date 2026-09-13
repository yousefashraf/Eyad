import { getDb } from './db.js';
import { getUserFromRequest, sendJson } from './auth.js';
import { ASSIGNMENTS } from './assignments.js';

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
