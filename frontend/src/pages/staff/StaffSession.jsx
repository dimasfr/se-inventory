import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api.js';
import Dialog, { btn } from '../../components/Dialog.jsx';
import RefreshButton from '../../components/RefreshButton.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { formatDate } from '../../format.js';

const MAX_QTY = 2_000_000_000;

// '' = not counted, digits = counted (0 means counted and out of stock)
const parseQty = (raw) => {
  if (raw === '') return { empty: true };
  if (!/^\d+$/.test(raw) || Number(raw) > MAX_QTY) return { invalid: true };
  return { value: Number(raw) };
};

export default function StaffSession() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [values, setValues] = useState({}); // sku -> input text
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [problems, setProblems] = useState([]);
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/sessions/${id}`);
      setData(res);
      setValues(
        Object.fromEntries(res.items.map((i) => [i.sku, i.countedQty === null ? '' : String(i.countedQty)]))
      );
    } catch (err) {
      setError(err.status === 404 ? 'Session not found.' : err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch without throwing away what the staff has typed but not submitted yet: an input is
  // only replaced by the server value if it was still untouched (equal to the previously saved count).
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api.get(`/sessions/${id}`);
      const oldSaved = Object.fromEntries(
        (data?.items || []).map((i) => [i.sku, i.countedQty === null ? '' : String(i.countedQty)])
      );
      setValues((prev) =>
        Object.fromEntries(
          res.items.map((i) => {
            const fresh = i.countedQty === null ? '' : String(i.countedQty);
            const text = prev[i.sku] ?? '';
            return [i.sku, text === (oldSaved[i.sku] ?? '') ? fresh : text];
          })
        )
      );
      setData(res);
      setError('');
    } catch (err) {
      setError(err.status === 404 ? 'Session not found.' : err.message);
    } finally {
      setRefreshing(false);
    }
  }, [id, data]);

  const items = data?.items;
  const editable = data && (data.session.status === 'open' || data.session.status === 'submitted');

  const stats = useMemo(() => {
    if (!items) return null;
    let counted = 0;
    let invalid = 0;
    let dirty = false;
    for (const i of items) {
      const text = values[i.sku] ?? '';
      const p = parseQty(text);
      if (p.invalid) invalid++;
      else if (!p.empty) counted++;
      const saved = i.countedQty === null ? '' : String(i.countedQty);
      if (text !== saved) dirty = true;
    }
    return { counted, invalid, dirty, notCounted: items.length - counted - invalid };
  }, [items, values]);

  const visible = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)) : items;
  }, [items, query]);

  if (error) {
    return (
      <div className="space-y-3">
        <Link
      to="/staff"
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 py-1.5 pl-2 pr-3.5 text-sm font-medium text-slate-600 shadow-sm transition active:scale-95"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="m15 6-6 6 6 6" />
      </svg>
      Back
    </Link>
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4" aria-label="Loading">
        <div className="skeleton h-9 w-24" />
        <div className="skeleton h-16" />
        <div className="skeleton h-12" />
        <div className="skeleton h-72" />
      </div>
    );
  }

  const { session, submissions } = data;
  const pending = submissions.find((s) => s.status === 'pending');
  const lastRejected = session.status === 'open' ? submissions.find((s) => s.status === 'rejected') : null;
  const canSubmit = editable && stats.counted > 0 && stats.invalid === 0 && stats.dirty && !saving;

  async function submit() {
    setSaving(true);
    setProblems([]);
    setNotice('');
    try {
      const payload = items
        .map((i) => ({ sku: i.sku, p: parseQty(values[i.sku] ?? '') }))
        .filter((r) => r.p.value !== undefined)
        .map((r) => ({ sku: r.sku, countedQty: r.p.value }));
      const res = await api.post(`/sessions/${id}/submissions`, {
        items: payload,
        basedOnPendingVersion: pending?.version ?? 0,
      });
      setConfirming(false);
      setNotice(
        `Submitted version ${res.version}: ${res.counted} counted, ${res.notCounted} not counted.` +
          (res.replacedVersion ? ` It replaces version ${res.replacedVersion}.` : '')
      );
      await load();
    } catch (err) {
      setConfirming(false);
      if (err instanceof ApiError && err.body.code === 'SESSION_CHANGED') {
        setStale(true);
      } else if (err instanceof ApiError && err.status === 422) {
        setProblems(err.body.details || [err.message]);
      } else {
        setProblems([err.message]);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 pb-28 md:space-y-5">
      <Link
      to="/staff"
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 py-1.5 pl-2 pr-3.5 text-sm font-medium text-slate-600 shadow-sm transition active:scale-95"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="m15 6-6 6 6 6" />
      </svg>
      Back
    </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Session #{session.id}</h1>
          <p className="text-sm text-slate-500">
            {session.storeName} · started {formatDate(session.createdAt)}
          </p>
          {session.note && <p className="mt-1 text-sm text-slate-700">{session.note}</p>}
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onClick={refresh} refreshing={refreshing} />
          <StatusBadge status={session.status} />
        </div>
      </div>

      {lastRejected && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-medium">Your last submission (version {lastRejected.version}) was rejected</div>
          <div className="mt-1">{lastRejected.rejectReason}</div>
          <div className="mt-1 text-xs text-red-700">Please recount and submit again.</div>
        </div>
      )}

      {session.status === 'submitted' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Waiting for manager review (version {pending?.version}). You can still change your counts and
          submit again; the new submission replaces this one.
        </div>
      )}
      {session.status === 'approved' && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          This session was approved on {formatDate(session.approvedAt)}. Counts are read-only.
        </div>
      )}
      {session.status === 'cancelled' && (
        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700">
          This session was cancelled by a manager.
        </div>
      )}
      {notice && (
        <p role="status" className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>
      )}
      {problems.length > 0 && (
        <div role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="font-medium">Could not submit:</div>
          <ul className="mt-1 list-inside list-disc">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}

      {editable && (
        <p className="text-sm text-slate-600">
          Count what is physically on the shelf. Leave an item empty if you did not count it (its stock
          stays unchanged). Enter <b>0</b> only if it is really out of stock.
        </p>
      )}

      {/* stays under the app bar while scrolling a long item list */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 bg-white/80 px-4 py-2 backdrop-blur-xl md:static md:mx-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <input
          type="search"
          placeholder="Search SKU or product name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-base outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-100 md:py-2.5 md:text-sm"
        />
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden card">
        {visible.map((item) => {
          const text = values[item.sku] ?? '';
          const p = parseQty(text);
          const saved = item.countedQty === null ? '' : String(item.countedQty);
          const changed = editable && item.countedQty !== null && text !== saved;
          return (
            <li key={item.productId} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{item.name}</div>
                <div className="text-xs text-slate-500">{item.sku}</div>
                {changed && (
                  <div className="mt-0.5 text-xs text-amber-700">
                    Already counted: {saved}. Submitting will replace it.
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label={`Counted quantity for ${item.sku}`}
                  disabled={!editable}
                  value={text}
                  placeholder="-"
                  onChange={(e) => setValues((v) => ({ ...v, [item.sku]: e.target.value.trim() }))}
                  className={`w-28 rounded-xl border bg-white px-3.5 py-3 text-right text-lg font-semibold tabular-nums outline-none transition focus:ring-4 disabled:bg-slate-100 disabled:text-slate-500 md:w-24 md:py-2 md:text-base ${
                    p.invalid
                      ? 'border-red-400 focus:ring-red-100'
                      : 'border-slate-200 focus:border-red-400 focus:ring-red-100'
                  }`}
                />
                {p.invalid && <div className="mt-0.5 text-xs text-red-600">Whole number ≥ 0</div>}
              </div>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-500">No items match your search.</li>
        )}
      </ul>

      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/70 bg-white/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.18)] backdrop-blur-xl">
          <div className="mx-auto max-w-5xl px-4 py-3">
            {confirming ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  Submit <b>{stats.counted}</b> counted item{stats.counted === 1 ? '' : 's'}?{' '}
                  {stats.notCounted > 0 && (
                    <span className="text-slate-600">
                      {stats.notCounted} not counted will keep their current stock.
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={saving}
                    className={`${btn.secondary} py-3`}
                  >
                    Keep editing
                  </button>
                  <button
                    onClick={submit}
                    disabled={saving}
                    className="rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-5 py-3 text-sm font-medium text-white shadow-md shadow-red-500/25 transition hover:shadow-lg hover:shadow-red-500/35 disabled:opacity-60"
                  >
                    {saving ? 'Submitting...' : 'Confirm submit'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-600">
                  <b className="text-slate-900">{stats.counted}</b> counted ·{' '}
                  <b className="text-slate-900">{stats.notCounted}</b> not counted
                  {stats.invalid > 0 && <span className="text-red-600"> · {stats.invalid} invalid</span>}
                </div>
                <button
                  onClick={() => setConfirming(true)}
                  disabled={!canSubmit}
                  className="rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-5 py-3 text-sm font-medium text-white shadow-md shadow-red-500/25 transition hover:shadow-lg hover:shadow-red-500/35 disabled:opacity-40"
                >
                  {pending ? 'Submit again' : 'Submit counts'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {stale && (
        <Dialog
          title="Session has changed"
          onClose={() => !refreshing && setStale(false)}
          footer={
            <>
              <button onClick={() => setStale(false)} disabled={refreshing} className={btn.secondary}>Close</button>
              <button
                onClick={async () => {
                  await refresh();
                  setStale(false);
                }}
                disabled={refreshing}
                className={btn.primary}
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </>
          }
        >
          <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
            The status of this session changed since you opened it, for example the manager has reviewed
            your submission. Nothing was submitted.
          </p>
          <p>
            Click <b>Refresh</b> to see the latest status and any rejection reason. The counts you typed are
            kept.
          </p>
        </Dialog>
      )}

      {submissions.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Submission history</h2>
          <ul className="divide-y divide-slate-100 overflow-hidden card text-sm">
            {submissions.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div>
                  <div className="font-medium">Version {s.version}</div>
                  <div className="text-xs text-slate-500">{formatDate(s.submittedAt)}</div>
                  {s.rejectReason && <div className="mt-1 text-xs text-red-700">Reason: {s.rejectReason}</div>}
                </div>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
