const form = document.getElementById('adminLoginForm');
const emailInput = document.getElementById('adminEmail');
const passwordInput = document.getElementById('adminPassword');
const error = document.getElementById('adminError');
const submit = document.getElementById('adminSubmit');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    error.textContent = 'Enter your admin email and password.';
    return;
  }

  error.textContent = '';
  submit.disabled = true;
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not sign in.');
    window.location.href = 'admin-dashboard.html';
  } catch (err) {
    error.textContent = err.message || 'Could not sign in.';
    submit.disabled = false;
  }
});
