const API_BASE = '/api';

// State
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user'));

// DOM Elements
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const navUser = document.getElementById('nav-user');
const navUsername = document.getElementById('nav-username');
const logoutBtn = document.getElementById('logout-btn');

const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

const reservationForm = document.getElementById('reservation-form');
const reservationsContainer = document.getElementById('reservations-container');
const toast = document.getElementById('toast');

// Notification helper
function showToast(message, isError = false) {
  toast.textContent = message;
  toast.style.borderColor = isError ? 'var(--danger)' : 'var(--primary)';
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

// Check Authentication View
function updateUI() {
  if (token && currentUser) {
    authSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    navUser.classList.remove('hidden');
    navUsername.textContent = currentUser.name;
    fetchReservations();
  } else {
    authSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
    navUser.classList.add('hidden');
  }
}

// Auth Tab Switching
tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
});

tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
});

// Register User
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    setAuthSession(data.token, data.user);
    showToast('Account created successfully!');
  } catch (err) {
    showToast(err.message, true);
  }
});

// Login User
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    setAuthSession(data.token, data.user);
    showToast('Welcome back!');
  } catch (err) {
    showToast(err.message, true);
  }
});

function setAuthSession(newToken, newUser) {
  token = newToken;
  currentUser = newUser;
  localStorage.setItem('token', newToken);
  localStorage.setItem('user', JSON.stringify(newUser));
  updateUI();
}

// Logout
logoutBtn.addEventListener('click', () => {
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  updateUI();
  showToast('Logged out.');
});

// Fetch Reservations
async function fetchReservations() {
  try {
    const res = await fetch(`${API_BASE}/reservations`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    renderReservations(data);
  } catch (err) {
    showToast('Failed to load reservations', true);
  }
}

// Render Reservations
function renderReservations(reservations) {
  if (reservations.length === 0) {
    reservationsContainer.innerHTML = `<p style="color: var(--text-muted); text-align: center; margin-top: 2rem;">No reservations scheduled yet.</p>`;
    return;
  }

  reservationsContainer.innerHTML = reservations.map(r => `
    <div class="res-item">
      <div class="res-info">
        <h4>${r.title}</h4>
        <div class="res-meta">
          <span>📅 ${r.reservation_date}</span>
          <span>⏰ ${r.reservation_time}</span>
          <span class="res-badge">${r.guests} Guest${r.guests > 1 ? 's' : ''}</span>
        </div>
        ${r.notes ? `<p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Note: ${r.notes}</p>` : ''}
      </div>
      <button class="btn btn-danger" onclick="cancelReservation(${r.id})">Cancel</button>
    </div>
  `).join('');
}

// Create Reservation
reservationForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('res-title').value;
  const date = document.getElementById('res-date').value;
  const time = document.getElementById('res-time').value;
  const guests = document.getElementById('res-guests').value;
  const notes = document.getElementById('res-notes').value;

  try {
    const res = await fetch(`${API_BASE}/reservations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ title, date, time, guests, notes })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    reservationForm.reset();
    showToast('Reservation booked successfully!');
    fetchReservations();
  } catch (err) {
    showToast(err.message, true);
  }
});

// Cancel Reservation (global scope for inline onclick)
window.cancelReservation = async function (id) {
  if (!confirm('Are you sure you want to cancel this reservation?')) return;

  try {
    const res = await fetch(`${API_BASE}/reservations/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to cancel');

    showToast('Reservation cancelled');
    fetchReservations();
  } catch (err) {
    showToast(err.message, true);
  }
};

// Initialize
updateUI();