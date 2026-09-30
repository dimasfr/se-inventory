import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api.js';
import Dialog, { btn } from '../../components/Dialog.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { formatDate } from '../../format.js';

const FILTERS = [
  ['all', 'All'],
  ['counted', 'Counted'],
  ['notCounted', 'Not counted'],
  ['diff', 'With difference'],
  ['changed', 'Stock changed'],
];

const diffColor = (d) => (d === 0 ? 'text-slate-500' : d > 0 ? 'text-green-700' : 'text-red-700');
const signed = (d) => (d > 0 ? `+${d}` : String(d));

export default function ManagerSessionReview() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null); // 'approve' | 'reject' | 'cancel'
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [staleNotice, setStaleNotice] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/sessions/${id}`));
    } catch (err) {
      setError(err.status === 404 ? 'Session not found.' : err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const reviewing = data?.session.status === 'submitted';
  const live = data && (data.session.status === 'open' || reviewing); // currentQty is only meaningful while live

  const rows = useMemo(
    () =>
      (data?.items || []).map((i) => {
        const counted = i.countedQty !== null;
        return {
          ...i,
          counted,
          changed: live && counted && i.currentQty !== i.systemQty, // stock moved since the snapshot
          willChange: counted && (live ? i.countedQty !== i.currentQty : i.difference !== 0),
        };
      }),
    [data, live]
  );

  const stats = useMemo(
    () => ({
      total: rows.length,
      counted: rows.filter((r) => r.counted).length,
      notCounted: rows.filter((r) => !r.counted).length,
      diff: rows.filter((r) => r.counted && r.difference !== 0).length,
      changed: rows.filter((r) => r.changed).length,
      willChange: rows.filter((r) => r.willChange).length,
    }),
    [rows]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.sku.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) return false;
      if (filter === 'counted') return r.counted;
      if (filter === 'notCounted') return !r.counted;
      if (filter === 'diff') return r.counted && r.difference !== 0;
      if (filter === 'changed') return r.changed;
      return true;
    });
  }, [rows, filter, query]);

  if (error) {
    return (
      <div className="space-y-3">
        <Link to="/manager/sessions" className="text-sm text-slate-600 hover:underline">← Sessions</Link>
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </div>
    );
  }
  if (!data) return <p className="text-slate-500">Loading...</p>;

  const { session, submissions } = data;
  const closeDialog = () => {
    if (busy) return;
    setDialog(null);
    setReason('');
    setDialogError('');
    setStaleNotice(false);
  };

  async function run(fn) {
    setBusy(true);
    setDialogError('');
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiError && err.body.code === 'STOCK_CHANGED') {
        // stock moved while the manager was reviewing: refresh and ask again with the new numbers
        await load();
        setStaleNotice(true);
        setDialog('approve');
      } else {
        setDialogError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const approve = () =>
    run(async () => {
      const res = await api.post(`/sessions/${id}/approve`, { confirmStockChanged: stats.changed > 0 });
      setDialog(null);
      setNotice(
        `Approved. ${res.itemsUpdated} item${res.itemsUpdated === 1 ? '' : 's'} updated, ` +
          `${res.itemsUnchanged} already matched, ${res.itemsNotCounted} not counted (unchanged).`
      );
      await load();
    });

  const reject = () =>
    run(async () => {
      await api.post(`/sessions/${id}/reject`, { reason });
      closeDialogAfter('Submission rejected. The session is open again so staff can recount.');
    });

  const cancel = () =>
    run(async () => {
      await api.post(`/sessions/${id}/cancel`);
      closeDialogAfter('Session cancelled.');
    });

  async function closeDialogAfter(message) {
    setDialog(null);
    setReason('');
    setNotice(message);
    await load();
  }

  const changedRows = rows.filter((r) => r.changed);

  return (
    <div className="space-y-5">
      <Link to="/manager/sessions" className="text-sm text-slate-600 hover:underline">← Sessions</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            Session #{session.id} · {session.storeName}
          </h1>
          <p className="text-sm text-slate-500">Started {formatDate(session.createdAt)}</p>
          {session.note && <p className="mt-1 text-sm text-slate-700">{session.note}</p>}
        </div>
        <StatusBadge status={session.status} />
      </div>

      {notice && (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>
      )}

      {session.status === 'open' && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Waiting for staff to submit counts.
        </p>
      )}
      {session.status === 'approved' && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Approved on {formatDate(session.approvedAt)}. Stock was set to the counted quantities.
        </p>
      )}

      {reviewing && stats.changed > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Stock changed since this session started</b> for {stats.changed} counted item
          {stats.changed === 1 ? '' : 's'} (e.g. sales during counting). Approving sets stock to the counted
          quantity and overwrites those changes. Check the highlighted rows first.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Items', stats.total],
          ['Counted', stats.counted],
          ['Not counted', stats.notCounted],
          ['With difference', stats.diff],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="text-lg font-semibold">{value}</div>
          </div>
        ))}
      </div>

      {reviewing && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setDialog('approve')} className={btn.primary}>Approve</button>
          <button onClick={() => setDialog('reject')} className={btn.secondary}>Reject</button>
          <button onClick={() => setDialog('cancel')} className={`${btn.secondary} ml-auto`}>Cancel session</button>
        </div>
      )}
      {session.status === 'open' && (
        <button onClick={() => setDialog('cancel')} className={btn.secondary}>Cancel session</button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.filter(([key]) => key !== 'changed' || live).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-sm ${
              filter === key
                ? 'bg-slate-900 text-white'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {label}
            {key === 'changed' && stats.changed > 0 && ` (${stats.changed})`}
          </button>
        ))}
        <input
          type="search"
          placeholder="Search SKU or name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ml-auto w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-500 sm:w-56"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div
          className={`hidden gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500 md:grid ${
            live ? 'md:grid-cols-[1fr_repeat(4,5.5rem)]' : 'md:grid-cols-[1fr_repeat(3,5.5rem)]'
          }`}
        >
          <div>Product</div>
          <div className="text-right">Snapshot</div>
          {live && <div className="text-right">Current</div>}
          <div className="text-right">Counted</div>
          <div className="text-right">Difference</div>
        </div>
        <ul className="divide-y divide-slate-200">
          {visible.map((r) => (
            <li
              key={r.productId}
              className={`grid grid-cols-4 items-center gap-2 px-4 py-3 text-sm ${
                live ? 'md:grid-cols-[1fr_repeat(4,5.5rem)]' : 'md:grid-cols-[1fr_repeat(3,5.5rem)]'
              } ${r.changed ? 'bg-amber-50' : ''}`}
            >
              <div className="col-span-4 min-w-0 md:col-span-1">
                <div className="truncate font-medium">{r.name}</div>
                <div className="text-xs text-slate-500">{r.sku}</div>
              </div>
              <Cell label="Snapshot" value={r.systemQty} />
              {live && (
                <Cell
                  label="Current"
                  value={r.currentQty}
                  className={r.changed ? 'font-semibold text-amber-800' : ''}
                />
              )}
              <Cell
                label="Counted"
                value={r.counted ? r.countedQty : 'not counted'}
                className={r.counted ? '' : 'text-xs text-slate-400'}
              />
              <Cell
                label="Difference"
                value={r.counted ? signed(r.difference) : '-'}
                className={r.counted ? `font-medium ${diffColor(r.difference)}` : 'text-slate-400'}
              />
            </li>
          ))}
          {visible.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">No items match this filter.</li>
          )}
        </ul>
      </div>

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

      {dialog === 'approve' && (
        <Dialog
          title="Approve this count?"
          onClose={closeDialog}
          footer={
            <>
              <button onClick={closeDialog} disabled={busy} className={btn.secondary}>Back</button>
              <button onClick={approve} disabled={busy} className={btn.primary}>
                {busy ? 'Approving...' : stats.changed > 0 ? 'Approve anyway' : 'Approve'}
              </button>
            </>
          }
        >
          {staleNotice && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
              Stock changed while you were reviewing. The numbers below are refreshed.
            </p>
          )}
          <p>
            Stock for <b>{stats.willChange}</b> item{stats.willChange === 1 ? '' : 's'} will be set to the
            counted quantity. {stats.notCounted} not counted item{stats.notCounted === 1 ? '' : 's'} stay
            unchanged. This cannot be undone from here.
          </p>
          {stats.changed > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
              <p className="font-medium text-amber-900">
                Stock differs from the snapshot for {stats.changed} item{stats.changed === 1 ? '' : 's'}:
              </p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-amber-900">
                {changedRows.map((r) => (
                  <li key={r.productId}>
                    <b>{r.sku}</b>: snapshot {r.systemQty}, now {r.currentQty}, counted {r.countedQty}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-900">
                Sales or receipts recorded since the session started will be overwritten by the counted
                quantity.
              </p>
            </div>
          )}
          {dialogError && <p className="text-red-600">{dialogError}</p>}
        </Dialog>
      )}

      {dialog === 'reject' && (
        <Dialog
          title="Reject this submission?"
          onClose={closeDialog}
          footer={
            <>
              <button onClick={closeDialog} disabled={busy} className={btn.secondary}>Back</button>
              <button onClick={reject} disabled={busy || !reason.trim()} className={btn.danger}>
                {busy ? 'Rejecting...' : 'Reject'}
              </button>
            </>
          }
        >
          <p>
            Stock is not changed. The session goes back to open and staff can count again. The reason is
            shown to staff.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Reason (required), e.g. SKU-003 looks too low, please recount"
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
          {dialogError && <p className="text-red-600">{dialogError}</p>}
        </Dialog>
      )}

      {dialog === 'cancel' && (
        <Dialog
          title="Cancel this session?"
          onClose={closeDialog}
          footer={
            <>
              <button onClick={closeDialog} disabled={busy} className={btn.secondary}>Keep session</button>
              <button onClick={cancel} disabled={busy} className={btn.danger}>
                {busy ? 'Cancelling...' : 'Cancel session'}
              </button>
            </>
          }
        >
          <p>
            The session and any submitted counts are discarded and stock is not changed. You can start a new
            session for this store afterwards.
          </p>
          {dialogError && <p className="text-red-600">{dialogError}</p>}
        </Dialog>
      )}
    </div>
  );
}

// label is shown only on small screens, where the column header is hidden
function Cell({ label, value, className = '' }) {
  return (
    <div className={`text-right tabular-nums ${className}`}>
      <div className="text-[10px] font-normal uppercase tracking-wide text-slate-400 md:hidden">{label}</div>
      {value}
    </div>
  );
}
