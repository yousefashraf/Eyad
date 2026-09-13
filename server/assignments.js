import { getDb } from './db.js';
import { requireUser, sendJson } from './auth.js';

export const ASSIGNMENTS = {
  'nutrition-assessment': 'Nutrition Assessment',
  'dietary-log': 'Dietary Log',
  'exercise-history': 'Exercise History',
  'food-preferences': 'Food Preferences',
  'health-history': 'Health History',
};

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'eyad.bassem98@hotmail.com';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function notifyAdminOfSubmission(user, submission) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.info('[email] Submission notification skipped: Resend is not configured.');
    return;
  }

  const formUrl = `${process.env.PUBLIC_SITE_URL || 'https://eb-athletic.com'}/admin-submission.html?id=${submission.id}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject: `New ${submission.assignmentTitle} submission from ${user.full_name}`,
      text: [
        `A client submitted ${submission.assignmentTitle}.`,
        `Client: ${user.full_name}`,
        `Email: ${user.email || 'Not provided'}`,
        `WhatsApp: ${user.phone_e164 || user.phone || 'Not provided'}`,
        `Submitted: ${submission.submitted_at}`,
        submission.summary ? `Summary: ${submission.summary}` : '',
        `View answers: ${formUrl}`,
      ].filter(Boolean).join('\n'),
      html: `
        <h2>New ${escapeHtml(submission.assignmentTitle)} submission</h2>
        <p><strong>Client:</strong> ${escapeHtml(user.full_name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(user.email || 'Not provided')}</p>
        <p><strong>WhatsApp:</strong> ${escapeHtml(user.phone_e164 || user.phone || 'Not provided')}</p>
        <p><strong>Submitted:</strong> ${escapeHtml(submission.submitted_at)}</p>
        ${submission.summary ? `<p><strong>Summary:</strong> ${escapeHtml(submission.summary)}</p>` : ''}
        <p><a href="${escapeHtml(formUrl)}">View completed form and answers</a></p>
      `,
    }),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}.`);
}

function publicSubmission(row) {
  let payload = {};
  try {
    payload = JSON.parse(row.payload || '{}');
  } catch (err) {
    payload = {};
  }
  return {
    id: row.id,
    userId: row.user_id,
    assignmentKey: row.assignment_key,
    assignmentTitle: row.assignment_title,
    payload,
    summary: row.summary || '',
    submittedAt: row.submitted_at,
  };
}

export function attachAssignmentRoutes(router) {
  router.post('/assignments', (req, res) => {
    try {
      const user = requireUser(req, res);
      if (!user) return;

      const body = req.body || {};
      const assignmentKey = String(body.assignmentKey || '').trim();
      const title = ASSIGNMENTS[assignmentKey];
      if (!title) return sendJson(res, 400, { error: 'Unknown assignment.' });

      const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
      const summary = String(body.summary || '');
      let payloadJson;
      try {
        payloadJson = JSON.stringify(payload);
      } catch (err) {
        return sendJson(res, 400, { error: 'Could not save the form answers.' });
      }
      if (payloadJson.length > 400000) {
        return sendJson(res, 413, { error: 'This submission is too large to save.' });
      }

      const db = getDb();
      const info = db.prepare(`
        INSERT INTO assignment_submissions (user_id, assignment_key, assignment_title, payload, summary)
        VALUES (?, ?, ?, ?, ?)
      `).run(user.id, assignmentKey, title, payloadJson, summary);

      const row = db.prepare('SELECT * FROM assignment_submissions WHERE id = ?').get(info.lastInsertRowid);
      notifyAdminOfSubmission(user, row).catch((error) => {
        console.error('submission email failed', error);
      });
      return sendJson(res, 201, { submission: publicSubmission(row) });
    } catch (err) {
      console.error('save assignment failed', err);
      return sendJson(res, 500, { error: 'Could not save the assignment.' });
    }
  });

  router.get('/assignments', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const rows = getDb().prepare(`
      SELECT * FROM assignment_submissions
      WHERE user_id = ?
      ORDER BY submitted_at DESC, id DESC
    `).all(user.id);
    sendJson(res, 200, { submissions: rows.map(publicSubmission) });
  });
}
