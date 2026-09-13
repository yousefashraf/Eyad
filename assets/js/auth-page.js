import { login, register } from './auth-api.js';

const signinForm = document.getElementById('signinForm');
const signupForm = document.getElementById('signupForm');

function getPillValue(group) {
  const active = group.querySelector('.pill.active');
  return active ? active.dataset.value : '';
}

function showThanks(title, message) {
  document.getElementById('thanksTitle').textContent = title;
  document.getElementById('thanksMsg').textContent = message;
  document.getElementById('thanksOverlay').classList.add('active');
}

function showError(el, btn, message) {
  el.textContent = message;
  el.classList.add('show');
  btn.classList.add('shake');
  setTimeout(() => btn.classList.remove('shake'), 400);
}

function phoneFrom(data) {
  return {
    phoneCountry: String(data.get('phoneCountry') || ''),
    phone: String(data.get('phone') || '').trim(),
  };
}

function validPhone(phone) {
  return /^\d[\d\s-]{5,14}$/.test(phone);
}

signinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(signinForm);
  const phone = phoneFrom(data);
  const password = String(data.get('password') || '');
  const err = document.getElementById('signinErr');
  const button = document.getElementById('signinSubmit');
  const remember = document.getElementById('rememberLine').classList.contains('checked');

  if (!validPhone(phone.phone) || password.length < 1) {
    showError(err, button, 'Please enter your WhatsApp number and password.');
    if (!validPhone(phone.phone)) document.getElementById('signinPhone').focus();
    else document.getElementById('signinPassword').focus();
    return;
  }

  err.classList.remove('show');
  button.disabled = true;
  try {
    const user = await login({ ...phone, password, remember });
    const first = (user.fullName || '').split(' ')[0] || 'there';
    showThanks('Welcome Back', `You're in, ${first}. Taking you to your program.`);
    setTimeout(() => { window.location.href = 'nutrition-assessment-updated.html'; }, 1400);
  } catch (ex) {
    showError(err, button, ex.message || 'Could not sign in.');
  } finally {
    button.disabled = false;
  }
});

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(signupForm);
  const phone = phoneFrom(data);
  const fullName = String(data.get('fullName') || '').trim();
  const email = String(data.get('email') || '').trim();
  const password = String(data.get('password') || '');
  const confirmPassword = String(data.get('confirmPassword') || '');
  const err = document.getElementById('signupErr');
  const button = document.getElementById('signupSubmit');
  const termsChecked = document.getElementById('termsLine').classList.contains('checked');
  const required = ['dob', 'address', 'height', 'weight'];

  let message = 'Please complete all fields correctly.';
  if (!fullName || !validPhone(phone.phone) || !required.every((field) => String(data.get(field) || '').trim()) || !getPillValue(document.getElementById('signupGender'))) {
    message = 'Please complete all profile fields correctly.';
  } else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    message = 'Enter a valid email address or leave it blank.';
  } else if (password.length < 8) {
    message = 'Password must be at least 8 characters.';
  } else if (password !== confirmPassword) {
    message = 'Passwords do not match.';
  } else if (!termsChecked) {
    message = 'Please agree to the Terms & Privacy Policy.';
  }

  if (message !== 'Please complete all fields correctly.' || !fullName || !validPhone(phone.phone) || !required.every((field) => String(data.get(field) || '').trim()) || !getPillValue(document.getElementById('signupGender'))) {
    showError(err, button, message);
    return;
  }

  err.classList.remove('show');
  button.disabled = true;
  try {
    const user = await register({
      ...phone,
      fullName,
      email,
      dob: String(data.get('dob') || '').trim(),
      gender: getPillValue(document.getElementById('signupGender')),
      address: String(data.get('address') || '').trim(),
      height: String(data.get('height') || '').trim(),
      weight: String(data.get('weight') || '').trim(),
      password,
    });
    const first = (user.fullName || fullName).split(' ')[0];
    showThanks('Account Created', `Welcome, ${first}. Taking you to your nutrition assessment now.`);
    setTimeout(() => { window.location.href = 'nutrition-assessment-updated.html'; }, 1800);
  } catch (ex) {
    showError(err, button, ex.message || 'Could not create the account.');
  } finally {
    button.disabled = false;
  }
});
