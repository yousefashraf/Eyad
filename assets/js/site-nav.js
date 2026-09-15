import { getCurrentUser, logout } from './auth-api.js';

(function () {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const isTemplate = window.location.pathname.includes('/templates/');
  const prefix = isTemplate ? '../' : '';
  const activePage = currentPath === 'about.html'
    ? 'coaching'
    : currentPath === 'transformations.html'
      ? 'transformations'
      : currentPath === 'auth-updated.html'
        ? 'start'
        : ['nutrition-assessment-updated.html', 'dietary-log.html', 'exercise-history.html', 'food-preferences.html', 'health-history.html'].includes(currentPath)
          ? 'assignments'
        : currentPath === 'index.html' || currentPath === ''
          ? 'home'
          : '';

  const nav = document.getElementById('navbar') || document.createElement('nav');
  nav.id = 'navbar';
  nav.classList.add('site-nav');
  if (!document.getElementById('site-nav-notification-styles')) {
    const style = document.createElement('style');
    style.id = 'site-nav-notification-styles';
    style.textContent = `
      .nav-notifications-wrap {
        position: relative;
        margin-right: 12px;
        display: flex;
        align-items: center;
      }
      .nav-notification-badge {
        min-width: 22px;
        height: 22px;
        border-radius: 999px;
        background: #c9a84c;
        color: #111;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        padding: 0 6px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .nav-notification-badge:hover {
        transform: scale(1.1);
        background: #e8c060;
      }
      .nav-notification-list {
        position: absolute;
        right: 0;
        top: calc(100% + 12px);
        width: 320px;
        background: #1a1a1a;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 4px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.4);
        z-index: 60;
        padding: 0;
        overflow: hidden;
      }
      .nav-notification-header {
        padding: 12px 14px;
        background: rgba(201,168,76,0.08);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: #c9a84c;
      }
      .nav-notification-item {
        display: flex;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        cursor: pointer;
        transition: background 0.2s ease;
      }
      .nav-notification-item:hover {
        background: rgba(201,168,76,0.06);
      }
      .nav-notification-item:last-child { border-bottom: none; }
      .nav-notif-icon {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(201,168,76,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      }
      .nav-notification-content {
        flex: 1;
        min-width: 0;
      }
      .nav-notification-item strong {
        display: block;
        color: #f4f1ec;
        font-size: 12px;
        margin-bottom: 3px;
        font-weight: 600;
      }
      .nav-notification-item span {
        display: block;
        color: #d9d1c2;
        font-size: 11px;
        line-height: 1.5;
        word-break: break-word;
      }
      .nav-notice-empty {
        color: #8a8a8a;
        font-size: 11px;
        text-align: center;
        padding: 20px 14px;
      }
    `;
    document.head.appendChild(style);
  }

  nav.innerHTML = `
    <a href="${prefix}index.html" class="nav-logo" aria-label="Evolved and Balanced home">
      <img class="nav-logo-img" src="${prefix}logo.png" alt="">
    </a>
    <div class="nav-links" id="navLinks">
      <div class="nav-dropdown">
        <a href="${prefix}index.html" class="nav-trigger" data-nav="home" aria-expanded="false">Home</a>
        <div class="dropdown-menu">
          <a href="${prefix}index.html#about">About</a>
          <a href="${prefix}index.html#certificates">Certificates</a>
          <a href="${prefix}index.html#faq">FAQ</a>
        </div>
      </div>
      <div class="nav-dropdown">
        <a href="${prefix}about.html" class="nav-trigger" data-nav="coaching" aria-expanded="false">Coaching</a>
        <div class="dropdown-menu">
          <a href="${prefix}about.html#process">Process</a>
          <a href="${prefix}about.html#method">Method</a>
          <a href="${prefix}about.html#calculator">Calculator</a>
        </div>
      </div>
      <a href="${prefix}transformations.html" data-nav="transformations">Transformations</a>
      <div class="nav-dropdown">
        <button type="button" class="nav-trigger" data-nav="assignments" aria-expanded="false">Assignments</button>
        <div class="dropdown-menu">
          <a href="${prefix}nutrition-assessment-updated.html">Nutrition Assessment</a>
          <a href="${prefix}dietary-log.html">Dietary Log</a>
          <a href="${prefix}exercise-history.html">Exercise History</a>
          <a href="${prefix}food-preferences.html">Food Preferences</a>
          <a href="${prefix}health-history.html">Health History</a>
        </div>
      </div>
    </div>
    <div class="nav-notifications-wrap" id="navNotificationsWrap" aria-live="polite"></div>
    <a href="${prefix}auth-updated.html" class="nav-cta" data-nav="start">Start Now</a>
    <button type="button" class="hamburger" aria-label="Open navigation menu" aria-expanded="false">
      <span></span>
      <span></span>
      <span></span>
    </button>`;

  if (!nav.parentNode) document.body.insertBefore(nav, document.body.firstChild);

  nav.querySelectorAll('[data-nav]').forEach((link) => {
    link.classList.toggle('active', link.dataset.nav === activePage);
  });

  const links = nav.querySelector('.nav-links');
  const menuButton = nav.querySelector('.hamburger');
  const dropdowns = Array.from(nav.querySelectorAll('.nav-dropdown'));

  function closeDropdowns(except) {
    dropdowns.forEach((dropdown) => {
      if (dropdown === except) return;
      dropdown.classList.remove('open');
      dropdown.querySelector('.nav-trigger')?.setAttribute('aria-expanded', 'false');
    });
  }

  dropdowns.forEach((dropdown) => {
    const trigger = dropdown.querySelector('.nav-trigger');
    trigger.addEventListener('click', (event) => {
      if (trigger.tagName === 'A') return;
      const open = dropdown.classList.toggle('open');
      closeDropdowns(open ? dropdown : null);
      trigger.setAttribute('aria-expanded', String(open));
    });
  });

  menuButton.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
    if (!open) closeDropdowns();
  });

  links.querySelectorAll('.dropdown-menu a').forEach((link) => {
    link.addEventListener('click', () => {
      links.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
      closeDropdowns();
    });
  });

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderNotifications(notifications) {
    const wrap = document.getElementById('navNotificationsWrap');
    if (!wrap) return;
    const unread = notifications.filter((note) => !note.isRead);
    if (!unread.length) {
    //   wrap.innerHTML = '<span class="nav-notice-empty">✓ All caught up</span>';
      return;
    }

    const badgeIcon = unread.length === 1 ? '📬' : '🔔';
    wrap.innerHTML = `
      <div class="nav-notification-badge" title="View invitations">${unread.length}</div>
      <div class="nav-notification-list">
        <div class="nav-notification-header">📋 New Invitations</div>
        ${unread.slice(0, 5).map((note) => `
          <div class="nav-notification-item" data-note-id="${note.id}">
            <div class="nav-notif-icon">📝</div>
            <div class="nav-notification-content">
              <strong>${escapeHtml(note.title)}</strong>
              <span>${escapeHtml(note.message)}</span>
            </div>
          </div>
        `).join('')}
        ${unread.length > 5 ? `<div class="nav-notice-empty">+${unread.length - 5} more</div>` : ''}
      </div>
    `;

    wrap.querySelectorAll('[data-note-id]').forEach((item) => {
      item.addEventListener('click', async () => {
        const id = Number(item.dataset.noteId);
        if (!Number.isFinite(id)) return;
        await fetch(`/api/notifications/${id}/read`, {
          method: 'POST',
          credentials: 'same-origin',
        });
        loadNotifications();
      });
    });
  }

  async function loadNotifications() {
    try {
      const res = await fetch('/api/notifications', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({ notifications: [] }));
      renderNotifications(data.notifications || []);
    } catch (err) {
      // ignore notifications failure
    }
  }

  getCurrentUser().then((user) => {
    if (!user) return;
    const cta = nav.querySelector('.nav-cta');
    if (!cta) return;
    const first = escapeHtml((user.fullName || 'there').split(' ')[0]);
    const wrap = document.createElement('div');
    wrap.className = 'nav-account';
    wrap.innerHTML = `
      <span class="nav-user">Hi, ${first}</span>
      <button type="button" class="nav-cta" data-nav="start">Sign&nbsp;Out</button>
    `;
    cta.replaceWith(wrap);
    wrap.querySelector('.nav-cta').addEventListener('click', async () => {
      await logout();
      window.location.href = prefix + 'auth-updated.html';
    });
    loadNotifications();
  });
})();
