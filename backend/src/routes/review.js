const express = require('express');
const { withTransaction } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { toId } = require('../utils');

const router = express.Router();
router.use(requireAuth, requireRole('manager'));

const MAX_REASON_LENGTH = 1000;

// Locks the session and its pending submission. Returns { session, submission }
// or { error: [status, message] } when the session can't be reviewed right now.
async function lockReviewable(db, sessionId) {
  const s = await db.query('SELECT id, store_id, status FROM stock_sessions WHERE id = $1 FOR UPDATE', [sessionId]);
  const session = s.rows[0];
  if (!session) return { error: [404, 'Session not found'] };
  if (session.status !== 'submitted') {
    return { error: [409, `Session is ${session.status}; only a submitted session can be reviewed`] };
  }
  const p = await db.query(
    "SELECT id FROM submissions WHERE session_id = $1 AND status = 'pending' FOR UPDATE",
    [sessionId]
  );
  if (!p.rows[0]) return { error: [409, 'Session has no pending submission'] };
  return { session, submission: p.rows[0] };
}

// Approve: stock is set to the counted quantity, one transaction, all or nothing.
// If stock moved since the snapshot (e.g. sales during counting), the manager has to
// confirm explicitly with { confirmStockChanged: true }; otherwise nothing is written.
router.post('/:id/approve', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Session not found' });
    const confirmed = req.body?.confirmStockChanged === true;

    const result = await withTransaction(async (db) => {
      const locked = await lockReviewable(db, id);
      if (locked.error) return { status: locked.error[0], body: { error: locked.error[1] } };
      const { session, submission } = locked;

      // lock the affected stock rows (fixed order avoids deadlocks with other writers)
      const { rows } = await db.query(
        `SELECT p.id AS product_id, p.sku, p.name,
                si.system_qty, ss.qty AS current_qty, cnt.counted_qty
         FROM submission_items cnt
         JOIN session_items si ON si.session_id = cnt.session_id AND si.product_id = cnt.product_id
         JOIN products p ON p.id = cnt.product_id
         JOIN store_stock ss ON ss.store_id = $2 AND ss.product_id = cnt.product_id
         WHERE cnt.submission_id = $1
         ORDER BY cnt.product_id
         FOR UPDATE OF ss`,
        [submission.id, session.store_id]
      );

      const expected = await db.query('SELECT count(*) FROM submission_items WHERE submission_id = $1', [submission.id]);
      if (rows.length !== Number(expected.rows[0].count)) {
        return { status: 409, body: { error: 'Some counted items no longer exist in store stock' } };
      }

      const changedSinceSnapshot = rows.filter((r) => r.current_qty !== r.system_qty);
      if (changedSinceSnapshot.length && !confirmed) {
        return {
          status: 409,
          body: {
            error: 'Stock changed since the session started. Review the items and confirm to continue.',
            code: 'STOCK_CHANGED',
            items: changedSinceSnapshot.map((r) => ({
              sku: r.sku,
              name: r.name,
              systemQty: r.system_qty,
              currentQty: r.current_qty,
              countedQty: r.counted_qty,
            })),
          },
        };
      }

      const toApply = rows.filter((r) => r.counted_qty !== r.current_qty);
      if (toApply.length) {
        const ids = toApply.map((r) => r.product_id);
        const before = toApply.map((r) => r.current_qty);
        const after = toApply.map((r) => r.counted_qty);

        // ledger first: qty_before is the live stock at approval time, not the snapshot
        await db.query(
          `INSERT INTO stock_movements
             (store_id, product_id, session_id, submission_id, qty_before, qty_after, created_by)
           SELECT $1, t.product_id, $2, $3, t.qty_before, t.qty_after, $4
           FROM unnest($5::int[], $6::int[], $7::int[]) AS t(product_id, qty_before, qty_after)`,
          [session.store_id, id, submission.id, req.user.id, ids, before, after]
        );
        await db.query(
          `UPDATE store_stock ss SET qty = t.qty_after, updated_at = now()
           FROM unnest($2::int[], $3::int[]) AS t(product_id, qty_after)
           WHERE ss.store_id = $1 AND ss.product_id = t.product_id`,
          [session.store_id, ids, after]
        );
      }

      await db.query(
        `UPDATE submissions SET status = 'approved', reviewed_by = $2, reviewed_at = now() WHERE id = $1`,
        [submission.id, req.user.id]
      );
      await db.query(
        `UPDATE stock_sessions SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1`,
        [id, req.user.id]
      );

      const total = await db.query('SELECT count(*) FROM session_items WHERE session_id = $1', [id]);
      return {
        status: 200,
        body: {
          status: 'approved',
          itemsUpdated: toApply.length,
          itemsUnchanged: rows.length - toApply.length,
          itemsNotCounted: Number(total.rows[0].count) - rows.length,
        },
      };
    });

    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
});

// Reject: reason is mandatory, stock is untouched, the session goes back to 'open'
// so staff can count again. The rejected submission stays as history.
router.post('/:id/reject', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Session not found' });

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) return res.status(400).json({ error: 'A rejection reason is required' });
    if (reason.length > MAX_REASON_LENGTH) {
      return res.status(400).json({ error: `Reason is too long (max ${MAX_REASON_LENGTH} characters)` });
    }

    const result = await withTransaction(async (db) => {
      const locked = await lockReviewable(db, id);
      if (locked.error) return { status: locked.error[0], body: { error: locked.error[1] } };

      await db.query(
        `UPDATE submissions
         SET status = 'rejected', reject_reason = $2, reviewed_by = $3, reviewed_at = now()
         WHERE id = $1`,
        [locked.submission.id, reason, req.user.id]
      );
      await db.query("UPDATE stock_sessions SET status = 'open' WHERE id = $1", [id]);
      return { status: 200, body: { status: 'open', rejected: true } };
    });

    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
