const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Managers see every store; staff only see their own. Includes the store's active
// session (if any) so the UI can offer "Start" or "Open" accordingly.
router.get('/', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.user.role === 'staff') {
      params.push(req.user.storeId);
      where = 'WHERE s.id = $1';
    }
    const { rows } = await pool.query(
      `SELECT s.id, s.code, s.name, a.id AS active_session_id, a.status AS active_session_status
       FROM stores s
       LEFT JOIN stock_sessions a ON a.store_id = s.id AND a.status IN ('open', 'submitted')
       ${where}
       ORDER BY s.name`,
      params
    );
    res.json({
      stores: rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        activeSession: r.active_session_id
          ? { id: r.active_session_id, status: r.active_session_status }
          : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
