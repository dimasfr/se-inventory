const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('manager'));

// Stock is kept per store; the total across stores is only computed here, on read.
router.get('/', async (_req, res, next) => {
  try {
    const perStore = await pool.query(
      `SELECT s.id, s.code, s.name,
              COALESCE(SUM(ss.qty), 0)::int AS total_units,
              COUNT(ss.product_id)::int AS sku_count,
              a.id AS active_session_id, a.status AS active_session_status
       FROM stores s
       LEFT JOIN store_stock ss ON ss.store_id = s.id
       LEFT JOIN stock_sessions a ON a.store_id = s.id AND a.status IN ('open', 'submitted')
       GROUP BY s.id, a.id
       ORDER BY s.name`
    );
    const pending = await pool.query("SELECT count(*)::int AS n FROM stock_sessions WHERE status = 'submitted'");

    const stores = perStore.rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      totalUnits: r.total_units,
      skuCount: r.sku_count,
      activeSession: r.active_session_id
        ? { id: r.active_session_id, status: r.active_session_status }
        : null,
    }));

    res.json({
      totalUnits: stores.reduce((sum, s) => sum + s.totalUnits, 0),
      pendingReview: pending.rows[0].n,
      stores,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
