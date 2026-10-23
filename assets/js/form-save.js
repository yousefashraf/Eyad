(function () {
  function collectFormAnswers(form) {
    const fields = {};
    const fd = new FormData(form);
    fd.forEach((value, key) => {
      const next = value == null ? '' : String(value);
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        if (!Array.isArray(fields[key])) fields[key] = [fields[key]];
        fields[key].push(next);
      } else {
        fields[key] = next;
      }
    });

    const pills = {};
    form.querySelectorAll('.pill-group[data-group]').forEach((group) => {
      const active = group.querySelector('.pill.active');
      pills[group.dataset.group] = active ? active.dataset.value : '';
    });

    const chips = {};
    form.querySelectorAll('.chip-grid[data-group]').forEach((grid) => {
      chips[grid.dataset.group] = Array.from(grid.querySelectorAll('.chip.active')).map((chip) => chip.dataset.value);
    });

    const radios = {};
    form.querySelectorAll('.radio-dot.active[data-group]').forEach((dot) => {
      radios[dot.dataset.group] = dot.dataset.value || '';
    });

    const pain = Array.from(form.querySelectorAll('.pain-item.active')).map((item) => item.dataset.value);

    return { fields, pills, chips, radios, pain };
  }

  async function saveAssignment(options) {
    const res = await fetch('/api/assignments', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignmentKey: options.assignmentKey,
        payload: options.payload,
        summary: options.summary || '',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Could not save the assignment.');
      err.status = res.status;
      throw err;
    }
    return data.submission;
  }

  let thanksCopy;

  function snapshotThanks() {
    const overlay = document.getElementById('thanksOverlay');
    if (!overlay || thanksCopy) return;
    const title = overlay.querySelector('h3');
    const copy = overlay.querySelector('p');
    thanksCopy = {
      title: title ? title.textContent : '',
      copy: copy ? copy.textContent : '',
    };
  }

  function restoreThanks() {
    const overlay = document.getElementById('thanksOverlay');
    if (!overlay || !thanksCopy) return;
    const title = overlay.querySelector('h3');
    const copy = overlay.querySelector('p');
    if (title) title.textContent = thanksCopy.title;
    if (copy) copy.textContent = thanksCopy.copy;
  }

  const assignmentKeys = {
    'nutrition-assessment-updated.html': 'nutrition-assessment',
    'dietary-log.html': 'dietary-log',
    'exercise-history.html': 'exercise-history',
    'food-preferences.html': 'food-preferences',
    'health-history.html': 'health-history',
  };

  function formatSubmissionDate(value) {
    if (!value) return '';
    const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
      ? value
      : `${value.replace(' ', 'T')}Z`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function setFormStatus(banner, submission) {
    const date = formatSubmissionDate(submission && submission.submittedAt);
    banner.dataset.status = submission ? 'submitted' : 'pending';
    banner.hidden = !submission;
    banner.textContent = submission
      ? `Form status: Submitted${date ? ` on ${date}` : ''}`
      : 'Form status: Not submitted yet';
  }

  let formStatusUpdated = false;

  function initializeFormStatus() {
    const hero = document.querySelector('.hero');
    const assignmentKey = assignmentKeys[window.location.pathname.split('/').pop()];
    if (!hero || !assignmentKey) return null;

    const banner = document.createElement('div');
    banner.className = 'form-status-banner';
    banner.dataset.status = 'loading';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.hidden = true;
    banner.textContent = 'Checking form status...';
    hero.insertBefore(banner, hero.firstChild);

    fetch('/api/assignments', { credentials: 'same-origin' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401) return;
          throw new Error(data.error || 'Could not load form status.');
        }

        const submission = (data.submissions || [])
          .find((item) => item.assignmentKey === assignmentKey);
        if (!formStatusUpdated) setFormStatus(banner, submission);
      })
      .catch((error) => {
        console.error('Could not load form status:', error);
        if (!formStatusUpdated) {
          banner.dataset.status = 'error';
          banner.textContent = 'Form status could not be loaded.';
        }
      });

    return banner;
  }

  function showSaveError(message) {
    snapshotThanks();
    const overlay = document.getElementById('thanksOverlay');
    const title = overlay && overlay.querySelector('h3');
    const copy = overlay && overlay.querySelector('p');
    if (title) title.textContent = 'Could Not Save';
    if (copy) copy.textContent = message;
    if (overlay) overlay.classList.add('active');
    else window.alert(message);
  }

  async function saveFormAssignment(form, assignmentKey, summary) {
    try {
      const submission = await saveAssignment({
        assignmentKey,
        payload: collectFormAnswers(form),
        summary,
      });
      restoreThanks();
      if (submission && formStatusBanner) {
        formStatusUpdated = true;
        setFormStatus(formStatusBanner, submission);
      }
      return true;
    } catch (err) {
      const message = err.status === 401
        ? 'Sign in first, then submit this assignment again so it is saved to your profile.'
        : (err.message || 'Could not save the assignment.');
      showSaveError(message);
      return false;
    }
  }

  const formStatusBanner = initializeFormStatus();

  window.EBForms = {
    collectFormAnswers,
    saveAssignment,
    saveFormAssignment,
    showSaveError,
  };
})();
