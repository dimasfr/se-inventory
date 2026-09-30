import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api.js';
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
        <Link to="/staff" className="text-sm text-slate-600 hover:underline">← Back</Link>
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </div>
    );
  }
  if (!data) return <p className="text-slate-500">Loading...</p>;

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
      const res = await api.post(`/sessions/${id}/submissions`, { items: payload });
      setConfirming(false);
      setNotice(
        `Submitted version ${res.version}: ${res.counted} counted, ${res.notCounted} not counted.` +
          (res.replacedVersion ? ` It replaces version ${res.replacedVersion}.` : '')
      );
      await load();
    } catch (err) {
      setConfirming(false);
      if (err instanceof ApiError && err.status === 422) {
        setProblems(err.body.details || [err.message]);
      } else {
        setProblems([err.message]);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <Link to="/staff" className="text-sm text-slate-600 hover:underline">← Back</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Session #{session.id}</h1>
          <p className="text-sm text-slate-500">
            {session.storeName} · started {formatDate(session.createdAt)}
          </p>
          {session.note && <p className="mt-1 text-sm text-slate-700">{session.note}</p>}
        </div>
        <StatusBadge status={session.status} />
      </div>

      {lastRejected && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-medium">Your last submission (version {lastRejected.version}) was rejected</div>
          <div className="mt-1">{lastRejected.rejectReason}</div>
          <div className="mt-1 text-xs text-red-700">Please recount and submit again.</div>
        </div>
      )}

      {session.status === 'submitted' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Waiting for manager review (version {pending?.version}). You can still change your counts and
          submit again; the new submission replaces this one.
        </div>
      )}
      {session.status === 'approved' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          This session was approved on {formatDate(session.approvedAt)}. Counts are read-only.
        </div>
      )}
      {session.status === 'cancelled' && (
        <div className="rounded-lg border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700">
          This session was cancelled by a manager.
        </div>
      )}
      {notice && (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>
      )}
      {problems.length > 0 && (
        <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
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

      <input
        type="search"
        placeholder="Search SKU or product name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />

      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {visible.map((item) => {
          const text = values[item.sku] ?? '';
          const p = parseQty(text);
          const saved = item.countedQty === null ? '' : String(item.countedQty);
          const changed = editable && item.countedQty !== null && text !== saved;
          return (
            <li key={item.productId} className="flex items-center justify-between gap-3 px-4 py-3">
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
                  className={`w-24 rounded-md border px-3 py-2 text-right text-sm outline-none focus:ring-2 disabled:bg-slate-100 ${
                    p.invalid
                      ? 'border-red-400 focus:ring-red-100'
                      : 'border-slate-300 focus:border-slate-500 focus:ring-slate-200'
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
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
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
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
                  >
                    Keep editing
                  </button>
                  <button
                    onClick={submit}
                    disabled={saving}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
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
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  {pending ? 'Submit again' : 'Submit counts'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {submissions.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-slate-500">Submission history</h2>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white text-sm">
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
