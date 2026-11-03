const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'super-secret-key-change-in-production';
const ADMIN_PASSWORD = 'chaima123321'; // Owner Password

// Ensure a system user exists for walk-in / admin direct bookings
db.serialize(() => {
  db.run(`
    INSERT OR IGNORE INTO users (id, name, email, password)
    VALUES (1, 'Admin / Walk-in', 'admin@local', 'SYSTEM')
  `);
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Client Auth Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Session expired.' });
    req.user = user;
    next();
  });
}

// Owner / Admin Middleware
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Owner access required.' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err || decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Invalid or expired owner session.' });
    }
    req.admin = decoded;
    next();
  });
}

/* ==================== CLIENT AUTH ROUTES ==================== */
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required.' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`;
    db.run(query, [name, email.toLowerCase(), hashedPassword], function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: 'Email already registered.' });
        }
        return res.status(500).json({ error: 'Failed to create user.' });
      }
      const token = jwt.sign({ id: this.lastID, name, email, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({ token, user: { id: this.lastID, name, email } });
    });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  db.get(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase()], async (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Invalid email or password.' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  });
});

/* ==================== CLIENT RESERVATIONS ==================== */
app.get('/api/reservations', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM reservations WHERE user_id = ? ORDER BY reservation_date ASC, reservation_time ASC`, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json(rows);
  });
});

app.post('/api/reservations', authenticateToken, (req, res) => {
  const { title, date, time, guests, notes } = req.body;
  if (!title || !date || !time) return res.status(400).json({ error: 'Missing required fields.' });

  const query = `INSERT INTO reservations (user_id, title, reservation_date, reservation_time, guests, notes) VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(query, [req.user.id, title, date, time, guests || 1, notes || ''], function (err) {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.status(201).json({ id: this.lastID, user_id: req.user.id, title, reservation_date: date, reservation_time: time, guests, notes });
  });
});

app.delete('/api/reservations/:id', authenticateToken, (req, res) => {
  db.run(`DELETE FROM reservations WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id], function (err) {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (this.changes === 0) return res.status(404).json({ error: 'Not found.' });
    res.json({ message: 'Cancelled.' });
  });
});

/* ==================== OWNER / ADMIN API ==================== */

// 1. Owner Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect owner password.' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, message: 'Welcome back, Owner.' });
});

// 2. Get ALL reservations with user details
app.get('/api/admin/reservations', authenticateAdmin, (req, res) => {
  const query = `
    SELECT r.*, u.name as customer_name, u.email as customer_email
    FROM reservations r
    LEFT JOIN users u ON r.user_id = u.id
    ORDER BY r.reservation_date DESC, r.reservation_time DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to retrieve reservations.' });
    res.json(rows);
  });
});

// 3. Admin Add Reservation
app.post('/api/admin/reservations', authenticateAdmin, (req, res) => {
  const { title, date, time, guests, notes } = req.body;
  if (!title || !date || !time) return res.status(400).json({ error: 'Title, date, and time are required.' });

  const query = `INSERT INTO reservations (user_id, title, reservation_date, reservation_time, guests, notes) VALUES (1, ?, ?, ?, ?, ?)`;
  db.run(query, [title, date, time, guests || 1, notes || ''], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to add reservation.' });
    res.status(201).json({ id: this.lastID, title, reservation_date: date, reservation_time: time, guests, notes });
  });
});

// 4. Admin Edit Reservation
app.put('/api/admin/reservations/:id', authenticateAdmin, (req, res) => {
  const { title, reservation_date, reservation_time, guests, notes } = req.body;
  const query = `
    UPDATE reservations
    SET title = ?, reservation_date = ?, reservation_time = ?, guests = ?, notes = ?
    WHERE id = ?
  `;
  db.run(query, [title, reservation_date, reservation_time, guests, notes, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to update reservation.' });
    if (this.changes === 0) return res.status(404).json({ error: 'Reservation not found.' });
    res.json({ message: 'Reservation updated successfully.' });
  });
});

// 5. Admin Delete Reservation
app.delete('/api/admin/reservations/:id', authenticateAdmin, (req, res) => {
  db.run(`DELETE FROM reservations WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to delete reservation.' });
    if (this.changes === 0) return res.status(404).json({ error: 'Reservation not found.' });
    res.json({ message: 'Reservation deleted.' });
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});