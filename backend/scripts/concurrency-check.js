// Checks the concurrency / stale-view guards against a RUNNING server and its database.
//
//   npm run check:concurrency            (API at http://localhost:$PORT)
//   API_URL=http://localhost:3003 npm run check:concurrency
//
// Needs seeded demo data (npm run seed). It uses the Jakarta store, creates real sessions and
// approves one, so run it against a dev database only. It refuses to start if the store already
// has an active session, and it puts the stock back at the end.
const { pool } = require('../src/db');

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
const PARALLEL = 5;
const SKU = 'SKU-001'; // the one product whose count we change
const STORE_CODE = 'JKT';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

async function call(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function login(email) {
  const r = await call('POST', '/auth/login', null, { email, password: 'password123' });
  if (r.status !== 200) throw new Error(`login ${email} failed (${r.status}); did you run npm run seed?`);
  return r.body.token;
}

const tally = (results) => {
  const t = {};
  for (const r of results) t[r.status] = (t[r.status] || 0) + 1;
  return t;
};
const fmt = (t) => Object.entries(t).map(([s, n]) => `${n}x${s}`).join(' ');

async function main() {
  const manager = await login('manager@example.com');
  const staff = await login('staff.jkt@example.com');

  const store = (await pool.query('SELECT id FROM stores WHERE code = $1', [STORE_CODE])).rows[0];
  if (!store) throw new Error(`store ${STORE_CODE} not found`);
  const active = await pool.query(
    "SELECT id FROM stock_sessions WHERE store_id = $1 AND status IN ('open','submitted')",
    [store.id]
  );
  if (active.rows[0]) throw new Error(`store ${STORE_CODE} already has active session #${active.rows[0].id}; finish or cancel it first`);

  const stockQty = async () =>
    (await pool.query(
      `SELECT ss.qty FROM store_stock ss JOIN products p ON p.id = ss.product_id
       WHERE ss.store_id = $1 AND p.sku = $2`, [store.id, SKU])).rows[0].qty;

  const original = await stockQty();
  const bumped = original + 1;
  const newSession = async (note) => (await call('POST', '/sessions', manager, { storeId: store.id, note })).body.id;
  const submit = (id, basedOn, qty) =>
    call('POST', `/sessions/${id}/submissions`, staff, {
      items: [{ sku: SKU, countedQty: qty }],
      basedOnPendingVersion: basedOn,
    });
  const subs = async (id) => (await call('GET', `/sessions/${id}`, manager)).body.submissions;
  const pendingOf = async (id) => (await subs(id)).find((s) => s.status === 'pending');

  const id = await newSession('concurrency check');
  console.log(`Session #${id} on ${STORE_CODE}, ${SKU}: ${original} -> ${bumped}\n`);

  // 1. several staff submits at once, all from the same view (no pending yet)
  console.log(`1. ${PARALLEL} parallel staff submits from the same view`);
  const r1 = await Promise.all(Array.from({ length: PARALLEL }, () => submit(id, 0, bumped)));
  const t1 = tally(r1);
  check(t1[201] === 1 && t1[409] === PARALLEL - 1, 'exactly one submit wins, the rest get 409', fmt(t1));
  check(r1.filter((r) => r.status === 409).every((r) => r.body.code === 'SESSION_CHANGED'), 'losers get SESSION_CHANGED');
  const pend1 = (await subs(id)).filter((s) => s.status === 'pending');
  check(pend1.length === 1, 'exactly one pending submission in the database', `${pend1.length}`);

  // 2. manager rejects v1 while staff still has the old view and submits again
  console.log('\n2. staff submits from a stale view after the manager rejected');
  const v1 = pend1[0];
  const rej = await call('POST', `/sessions/${id}/reject`, manager, { submissionId: v1.id, reason: 'concurrency check' });
  check(rej.status === 200, 'manager reject succeeds', `${rej.status}`);
  const stale = await submit(id, v1.version, bumped); // staff still believes v1 is pending
  check(stale.status === 409 && stale.body.code === 'SESSION_CHANGED', 'stale submit is refused with SESSION_CHANGED', `${stale.status} ${stale.body.code || ''}`);
  const v2 = await submit(id, 0, bumped); // after refresh staff sees no pending
  check(v2.status === 201, 'submit from a fresh view is accepted', `${v2.status}`);

  // 3. staff submits a newer version while the manager is reviewing the previous one
  console.log('\n3. manager approves a version that has been replaced');
  const seenByManager = await pendingOf(id);
  const v3 = await submit(id, seenByManager.version, bumped);
  check(v3.status === 201, 'staff resubmits while manager is looking', `${v3.status}`);
  const old = await call('POST', `/sessions/${id}/approve`, manager, { submissionId: seenByManager.id });
  check(old.status === 409 && old.body.code === 'SUBMISSION_CHANGED', 'approve of the old version is refused with SUBMISSION_CHANGED', `${old.status} ${old.body.code || ''}`);
  check((await stockQty()) === original, 'stock untouched by the refused approve', `${await stockQty()}`);

  // 4. several approves at once
  console.log(`\n4. ${PARALLEL} parallel approves of the current version`);
  const current = await pendingOf(id);
  const r4 = await Promise.all(
    Array.from({ length: PARALLEL }, () => call('POST', `/sessions/${id}/approve`, manager, { submissionId: current.id }))
  );
  const t4 = tally(r4);
  check(t4[200] === 1 && t4[409] === PARALLEL - 1, 'exactly one approve wins, the rest get 409', fmt(t4));
  check((await stockQty()) === bumped, 'stock changed exactly once', `${await stockQty()}`);
  const moves = await pool.query('SELECT count(*)::int AS n FROM stock_movements WHERE submission_id = $1', [current.id]);
  check(moves.rows[0].n === 1, 'exactly one ledger row for the approved submission', `${moves.rows[0].n}`);

  // put the stock back
  console.log('\nRestoring stock...');
  const back = await newSession('concurrency check (restore)');
  await submit(back, 0, original);
  const p = await pendingOf(back);
  const restored = await call('POST', `/sessions/${back}/approve`, manager, { submissionId: p.id });
  check(restored.status === 200 && (await stockQty()) === original, `stock back to ${original}`, `${await stockQty()}`);
}

main()
  .catch((err) => {
    console.error('\nCould not run the check:', err.message);
    failures++;
  })
  .finally(async () => {
    await pool.end();
    console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
    process.exit(failures ? 1 : 0);
  });
