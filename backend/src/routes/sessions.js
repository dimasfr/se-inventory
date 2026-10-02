const express = require('express');
const { pool, withTransaction } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const { toId } = require('../utils');

const UNIQUE_VIOLATION = '23505';

// Staff can only touch their own store's sessions. Returns the session row,
// or null if it doesn't exist / isn't visible to this user (404 either way).
async function findVisibleSession(db, id, user) {
  const { rows } = await db.query(
    `SELECT ss.*, s.name AS store_name
     FROM stock_sessions ss JOIN stores s ON s.id = ss.store_id
     WHERE ss.id = $1`,
    [id]
  );
  const session = rows[0];
  if (!session) return null;
  if (user.role === 'staff' && session.store_id !== user.storeId) return null;
  return session;
}

function sessionDto(s) {
  return {
    id: s.id,
    storeId: s.store_id,
    storeName: s.store_name,
    status: s.status,
    note: s.note,
    createdAt: s.created_at,
    approvedAt: s.approved_at,
    ...(s.item_count !== undefined && { itemCount: Number(s.item_count) }),
  };
}

// Manager initiates a session for one store and snapshots its current stock.
router.post('/', requireRole('manager'), async (req, res, next) => {
  try {
    const storeId = toId(req.body?.storeId);
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() || null : null;
    if (!storeId) return res.status(400).json({ error: 'storeId is required' });

    const session = await withTransaction(async (db) => {
      const store = await db.query('SELECT id FROM stores WHERE id = $1', [storeId]);
      if (!store.rows[0]) return { error: [404, 'Store not found'] };

      const created = await db.query(
        `INSERT INTO stock_sessions (store_id, note, created_by)
         VALUES ($1, $2, $3) RETURNING id`,
        [storeId, note, req.user.id]
      );
      const sessionId = created.rows[0].id;

      const snapshot = await db.query(
        `INSERT INTO session_items (session_id, product_id, system_qty)
         SELECT $1, ss.product_id, ss.qty
         FROM store_stock ss JOIN products p ON p.id = ss.product_id
         WHERE ss.store_id = $2 AND p.active`,
        [sessionId, storeId]
      );
      if (snapshot.rowCount === 0) {
        throw Object.assign(new Error('empty'), { empty: true });
      }
      return { id: sessionId, itemCount: snapshot.rowCount };
    }).catch((err) => {
      if (err.code === UNIQUE_VIOLATION) return { error: [409, 'This store already has an active session'] };
      if (err.empty) return { error: [422, 'This store has no stock items to count'] };
      throw err;
    });

    if (session.error) return res.status(session.error[0]).json({ error: session.error[1] });
    res.status(201).json({ id: session.id, itemCount: session.itemCount });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const params = [];
    const where = [];

    if (req.user.role === 'staff') {
      params.push(req.user.storeId);
      where.push(`ss.store_id = $${params.length}`);
    } else if (req.query.storeId !== undefined) {
      const storeId = toId(req.query.storeId);
      if (!storeId) return res.status(400).json({ error: 'Invalid storeId' });
      params.push(storeId);
      where.push(`ss.store_id = $${params.length}`);
    }
    if (req.query.status !== undefined) {
      params.push(String(req.query.status));
      where.push(`ss.status::text = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT ss.*, s.name AS store_name,
              (SELECT count(*) FROM session_items si WHERE si.session_id = ss.id) AS item_count
       FROM stock_sessions ss JOIN stores s ON s.id = ss.store_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY ss.created_at DESC`,
      params
    );
    res.json({ sessions: rows.map(sessionDto) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Session not found' });

    const session = await findVisibleSession(pool, id, req.user);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const subs = await pool.query(
      `SELECT id, version, status, submitted_at, reviewed_at, reject_reason
       FROM submissions WHERE session_id = $1 ORDER BY version DESC`,
      [id]
    );
    const submissions = subs.rows.map((r) => ({
      id: r.id,
      version: r.version,
      status: r.status,
      submittedAt: r.submitted_at,
      reviewedAt: r.reviewed_at,
      rejectReason: r.reject_reason,
    }));
    // counts shown come from the submission under review, or the approved one once finished;
    // after a reject there is none, so staff start from a clean form
    const pending = subs.rows.find((r) => r.status === 'pending' || r.status === 'approved');

    const isManager = req.user.role === 'manager';
    const { rows } = await pool.query(
      `SELECT p.id AS product_id, p.sku, p.name,
              si.system_qty, cur.qty AS current_qty, cnt.counted_qty
       FROM session_items si
       JOIN products p ON p.id = si.product_id
       LEFT JOIN store_stock cur ON cur.store_id = $2 AND cur.product_id = si.product_id
       LEFT JOIN submission_items cnt ON cnt.submission_id = $3 AND cnt.product_id = si.product_id
       WHERE si.session_id = $1
       ORDER BY p.sku`,
      [id, session.store_id, pending ? pending.id : null]
    );

    // Blind count: staff never receive system_qty / current_qty.
    const items = rows.map((r) => {
      const item = {
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        countedQty: r.counted_qty,
      };
      if (isManager) {
        item.systemQty = r.system_qty;
        item.currentQty = r.current_qty;
        item.difference = r.counted_qty === null ? null : r.counted_qty - r.system_qty;
      }
      return item;
    });

    res.json({ session: sessionDto(session), submissions, items });
  } catch (err) {
    next(err);
  }
});

// Manager cancels a session that was opened by mistake. Stock is never touched.
router.post('/:id/cancel', requireRole('manager'), async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Session not found' });

    const result = await withTransaction(async (db) => {
      const { rows } = await db.query(
        `UPDATE stock_sessions SET status = 'cancelled'
         WHERE id = $1 AND status IN ('open', 'submitted') RETURNING id`,
        [id]
      );
      if (!rows[0]) return false;
      await db.query(
        `UPDATE submissions SET status = 'superseded'
         WHERE session_id = $1 AND status = 'pending'`,
        [id]
      );
      return true;
    });

    if (!result) {
      return res.status(409).json({ error: 'Session not found or can no longer be cancelled' });
    }
    res.json({ id, status: 'cancelled' });
  } catch (err) {
    next(err);
  }
});

const MAX_SUBMISSION_ITEMS = 5000;
const MAX_REPORTED_ERRORS = 50;

// Shape validation only (no DB). Returns { items, errors }.
// A missing SKU means "not counted"; countedQty 0 means "counted, out of stock".
function validateItems(raw) {
  const errors = [];
  if (!Array.isArray(raw) || raw.length === 0) {
    return { errors: ['items must be a non-empty array'] };
  }
  if (raw.length > MAX_SUBMISSION_ITEMS) {
    return { errors: [`too many items (max ${MAX_SUBMISSION_ITEMS} per submission)`] };
  }

  const seen = new Set();
  const items = [];
  raw.forEach((row, i) => {
    const sku = typeof row?.sku === 'string' ? row.sku.trim() : '';
    if (!sku) return errors.push(`item ${i + 1}: sku is required`);
    if (!Number.isInteger(row.countedQty) || row.countedQty < 0) {
      return errors.push(`item ${i + 1} (${sku}): countedQty must be an integer >= 0`);
    }
    if (seen.has(sku)) return errors.push(`item ${i + 1} (${sku}): duplicate SKU in this submission`);
    seen.add(sku);
    items.push({ sku, countedQty: row.countedQty });
  });
  return { items, errors };
}

const fail = (status, ...errors) => ({ fail: { status, errors } });

// Staff submit counts for their own store's session in a single batch.
// Submitting again replaces the pending submission; the old one is kept as history.
router.post('/:id/submissions', requireRole('staff'), async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Session not found' });

    // version of the pending submission the staff's view shows (0 = none); guards against submitting on a
    // stale view, e.g. the manager rejected that pending version in the meantime
    const basedOn = req.body?.basedOnPendingVersion;
    if (!Number.isInteger(basedOn) || basedOn < 0) {
      return res.status(400).json({ error: 'basedOnPendingVersion is required' });
    }

    const { items, errors } = validateItems(req.body?.items);
    if (errors.length) {
      return res.status(422).json({ error: 'Invalid submission', details: errors.slice(0, MAX_REPORTED_ERRORS) });
    }

    const result = await withTransaction(async (db) => {
      // lock the session so concurrent submits / approve / cancel are serialized
      const locked = await db.query('SELECT id, store_id, status FROM stock_sessions WHERE id = $1 FOR UPDATE', [id]);
      const session = locked.rows[0];
      if (!session || session.store_id !== req.user.storeId) return fail(404, 'Session not found');
      if (!['open', 'submitted'].includes(session.status)) {
        return fail(409, `Session is ${session.status} and no longer accepts submissions`);
      }

      // e.g. the manager rejected (or the staff submitted from another device) since this view was loaded
      const pendingNow = await db.query(
        "SELECT COALESCE(MAX(version), 0) AS v FROM submissions WHERE session_id = $1 AND status = 'pending'",
        [id]
      );
      if (Number(pendingNow.rows[0].v) !== basedOn) return { stale: true };

      const skus = items.map((i) => i.sku);
      const known = await db.query(
        `SELECT p.id, p.sku FROM session_items si JOIN products p ON p.id = si.product_id
         WHERE si.session_id = $1 AND p.sku = ANY($2)`,
        [id, skus]
      );
      const productBySku = new Map(known.rows.map((r) => [r.sku, r.id]));
      const unknown = skus.filter((s) => !productBySku.has(s));
      if (unknown.length) {
        return fail(
          422,
          ...unknown.slice(0, MAX_REPORTED_ERRORS).map((s) => `${s}: not part of this session's stock`)
        );
      }

      const prev = await db.query(
        `UPDATE submissions SET status = 'superseded'
         WHERE session_id = $1 AND status = 'pending' RETURNING version`,
        [id]
      );
      const versionRow = await db.query(
        'SELECT COALESCE(MAX(version), 0) + 1 AS next FROM submissions WHERE session_id = $1',
        [id]
      );
      const version = versionRow.rows[0].next;

      const created = await db.query(
        `INSERT INTO submissions (session_id, version, submitted_by) VALUES ($1, $2, $3) RETURNING id`,
        [id, version, req.user.id]
      );
      const submissionId = created.rows[0].id;

      await db.query(
        `INSERT INTO submission_items (submission_id, session_id, product_id, counted_qty)
         SELECT $1, $2, product_id, counted_qty
         FROM unnest($3::int[], $4::int[]) AS t(product_id, counted_qty)`,
        [submissionId, id, items.map((i) => productBySku.get(i.sku)), items.map((i) => i.countedQty)]
      );

      await db.query("UPDATE stock_sessions SET status = 'submitted' WHERE id = $1", [id]);

      const total = await db.query('SELECT count(*) FROM session_items WHERE session_id = $1', [id]);
      return {
        ok: {
          submissionId,
          version,
          replacedVersion: prev.rows[0]?.version ?? null,
          counted: items.length,
          notCounted: Number(total.rows[0].count) - items.length,
        },
      };
    });

    if (result.stale) {
      return res.status(409).json({
        error: 'This session changed since you loaded it. Refresh to see the latest status before submitting.',
        code: 'SESSION_CHANGED',
      });
    }
    if (result.fail) {
      const { status, errors: details } = result.fail;
      return res.status(status).json({ error: details[0], ...(details.length > 1 && { details }) });
    }
    res.status(201).json(result.ok);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
