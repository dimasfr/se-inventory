const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// compared against when the email is unknown, so response time doesn't reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, u.store_id, u.password_hash, s.name AS store_name
       FROM users u LEFT JOIN stores s ON s.id = u.store_id
       WHERE u.email = $1`,
      [email.trim().toLowerCase()]
    );
    const user = rows[0];

    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { role: user.role, storeId: user.store_id },
      process.env.JWT_SECRET,
      { subject: String(user.id), expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, u.store_id, s.name AS store_name
       FROM users u LEFT JOIN stores s ON s.id = u.store_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(401).json({ error: 'User no longer exists' });
    res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    storeId: u.store_id,
    storeName: u.store_name,
  };
}

module.exports = router;
