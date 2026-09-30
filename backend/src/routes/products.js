const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
// Stock quantities are hidden from staff (blind count), so this is manager-only.
router.use(requireAuth, requireRole('manager'));

// Product master data with stock per store and the total across stores.
// Optional ?q= filters by SKU or name.
router.get('/', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const params = [];
    let where = '';
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
      where = 'WHERE p.sku ILIKE $1 OR p.name ILIKE $1';
    }

    const { rows } = await pool.query(
      `SELECT p.id, p.sku, p.name, p.active,
              COALESCE(SUM(ss.qty), 0)::int AS total_qty,
              COALESCE(
                json_agg(json_build_object('storeId', ss.store_id, 'qty', ss.qty) ORDER BY ss.store_id)
                  FILTER (WHERE ss.store_id IS NOT NULL),
                '[]'
              ) AS stores
       FROM products p
       LEFT JOIN store_stock ss ON ss.product_id = p.id
       ${where}
       GROUP BY p.id
       ORDER BY p.sku`,
      params
    );
    res.json({
      products: rows.map((r) => ({
        id: r.id,
        sku: r.sku,
        name: r.name,
        active: r.active,
        totalQty: r.total_qty,
        stores: r.stores,
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
