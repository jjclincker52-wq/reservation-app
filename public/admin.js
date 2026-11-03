let adminToken = sessionStorage.getItem('adminToken');
let allReservations = [];

const adminAuth = document.getElementById('admin-auth');
const adminDashboard = document.getElementById('admin-dashboard');
const adminLoginForm = document.getElementById('admin-login-form');
const adminLogoutBtn = document.getElementById('admin-logout-btn');
const tableBody = document.getElementById('admin-table-body');
const searchInput = document.getElementById('search-input');
const crudModal = document.getElementById('crud-modal');
const modalForm = document.getElementById('modal-form');
const modalTitle = document.getElementById('modal-title');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const btnOpenCreate = document.getElementById('btn-open-create');
const toast = document.getElementById('toast');

function showToast(msg, isError = false) {
  toast.textContent = msg;
  toast.style.borderColor = isError ? 'var(--danger)' : 'var(--primary)';
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

function updateAdminView() {
  if (adminToken) {
    adminAuth.classList.add('hidden');
    adminDashboard.classList.remove('hidden');
    loadReservations();
  } else {
    adminAuth.classList.remove('hidden');
    adminDashboard.classList.add('hidden');
  }
}

// Master Login
adminLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('admin-pass').value;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    adminToken = data.token;
    sessionStorage.setItem('adminToken', adminToken);
    updateAdminView();
    showToast('Unlocked Owner Portal');
  } catch (err) {
    showToast(err.message, true);
  }
});

adminLogoutBtn.addEventListener('click', () => {
  adminToken = null;
  sessionStorage.removeItem('adminToken');
  updateAdminView();
});

// Load All Reservations
async function loadReservations() {
  try {
    const res = await fetch('/api/admin/reservations', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error('Failed to fetch');
    allReservations = await res.json();
    renderTable(allReservations);
    updateStats(allReservations);
  } catch (err) {
    showToast(err.message, true);
  }
}

function updateStats(items) {
  document.getElementById('stat-total').textContent = items.length;
  document.getElementById('stat-guests').textContent = items.reduce((sum, r) => sum + Number(r.guests), 0);
  const future = items.filter(r => new Date(r.reservation_date) >= new Date().setHours(0,0,0,0)).length;
  document.getElementById('stat-active').textContent = future;
}

function renderTable(items) {
  if (!items.length) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted);">No records found.</td></tr>`;
    return;
  }

  tableBody.innerHTML = items.map(r => `
    <tr>
      <td>#${r.id}</td>
      <td>
        <strong>${r.customer_name || 'Walk-in / Owner'}</strong><br/>
        <small style="color: var(--text-muted);">${r.customer_email || 'N/A'}</small>
      </td>
      <td>${r.title}</td>
      <td>📅 ${r.reservation_date}<br/><small style="color: var(--text-muted);">⏰ ${r.reservation_time}</small></td>
      <td><span class="res-badge">${r.guests}</span></td>
      <td><small>${r.notes || '-'}</small></td>
      <td>
        <div class="action-btns">
          <button class="btn btn-secondary btn-sm" onclick="openEditModal(${r.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteReservation(${r.id})">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Search Filter
searchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  const filtered = allReservations.filter(r => 
    r.title.toLowerCase().includes(query) ||
    (r.customer_name && r.customer_name.toLowerCase().includes(query)) ||
    r.reservation_date.includes(query)
  );
  renderTable(filtered);
});

// Create Modal
btnOpenCreate.addEventListener('click', () => {
  modalTitle.textContent = 'Add Walk-in / Reservation';
  modalForm.reset();
  document.getElementById('edit-id').value = '';
  crudModal.classList.remove('hidden');
});

// Edit Modal
window.openEditModal = function (id) {
  const item = allReservations.find(r => r.id === id);
  if (!item) return;

  modalTitle.textContent = `Edit Reservation #${item.id}`;
  document.getElementById('edit-id').value = item.id;
  document.getElementById('edit-title').value = item.title;
  document.getElementById('edit-date').value = item.reservation_date;
  document.getElementById('edit-time').value = item.reservation_time;
  document.getElementById('edit-guests').value = item.guests;
  document.getElementById('edit-notes').value = item.notes || '';
  crudModal.classList.remove('hidden');
};

modalCancelBtn.addEventListener('click', () => crudModal.classList.add('hidden'));

// Submit Add / Edit
modalForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-id').value;
  const payload = {
    title: document.getElementById('edit-title').value,
    date: document.getElementById('edit-date').value,
    time: document.getElementById('edit-time').value,
    reservation_date: document.getElementById('edit-date').value,
    reservation_time: document.getElementById('edit-time').value,
    guests: document.getElementById('edit-guests').value,
    notes: document.getElementById('edit-notes').value
  };

  const isEdit = Boolean(id);
  const endpoint = isEdit ? `/api/admin/reservations/${id}` : `/api/admin/reservations`;
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Operation failed');

    crudModal.classList.add('hidden');
    showToast(isEdit ? 'Reservation updated!' : 'Reservation created!');
    loadReservations();
  } catch (err) {
    showToast(err.message, true);
  }
});

// Delete
window.deleteReservation = async function (id) {
  if (!confirm(`Are you sure you want to permanently delete Reservation #${id}?`)) return;

  try {
    const res = await fetch(`/api/admin/reservations/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error('Failed to delete');

    showToast('Reservation removed.');
    loadReservations();
  } catch (err) {
    showToast(err.message, true);
  }
};

updateAdminView();