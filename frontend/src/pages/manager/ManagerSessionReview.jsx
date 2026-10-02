import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api.js';
import Dialog, { btn } from '../../components/Dialog.jsx';
import RefreshButton from '../../components/RefreshButton.jsx';
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

  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/sessions/${id}`));
      setError('');
    } catch (err) {
      setError(err.status === 404 ? 'Session not found.' : err.message);
    }
  }, [id]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

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
        <Link
      to="/manager/sessions"
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 py-1.5 pl-2 pr-3.5 text-sm font-medium text-slate-600 shadow-sm transition active:scale-95"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="m15 6-6 6 6 6" />
      </svg>
      Sessions
    </Link>
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </div>
    );
  }
  if (!data) return <p className="text-slate-500">Loading...</p>;

  const { session, submissions } = data;
  const pendingId = submissions.find((s) => s.status === 'pending')?.id;
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
      if (err instanceof ApiError && err.body.code === 'SUBMISSION_CHANGED') {
        // staff resubmitted while the manager was looking at an older version: tell them in the
        // modal and let them refresh, instead of silently swapping the data under them
        setReason('');
        setDialogError('');
        setDialog('stale');
      } else if (err instanceof ApiError && err.body.code === 'STOCK_CHANGED') {
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
      const res = await api.post(`/sessions/${id}/approve`, {
        submissionId: pendingId,
        confirmStockChanged: stats.changed > 0,
      });
      setDialog(null);
      setNotice(
        `Approved. ${res.itemsUpdated} item${res.itemsUpdated === 1 ? '' : 's'} updated, ` +
          `${res.itemsUnchanged} already matched, ${res.itemsNotCounted} not counted (unchanged).`
      );
      await load();
    });

  const reject = () =>
    run(async () => {
      await api.post(`/sessions/${id}/reject`, { submissionId: pendingId, reason });
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
      <Link
      to="/manager/sessions"
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 py-1.5 pl-2 pr-3.5 text-sm font-medium text-slate-600 shadow-sm transition active:scale-95"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="m15 6-6 6 6 6" />
      </svg>
      Sessions
    </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Session #{session.id} · {session.storeName}
          </h1>
          <p className="text-sm text-slate-500">Started {formatDate(session.createdAt)}</p>
          {session.note && <p className="mt-1 text-sm text-slate-700">{session.note}</p>}
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onClick={refresh} refreshing={refreshing} />
          <StatusBadge status={session.status} />
        </div>
      </div>

      {notice && (
        <p role="status" className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>
      )}

      {session.status === 'open' && (
        <p className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Waiting for staff to submit counts.
        </p>
      )}
      {session.status === 'approved' && (
        <p className="rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Approved on {formatDate(session.approvedAt)}. Stock was set to the counted quantities.
        </p>
      )}

      {reviewing && stats.changed > 0 && (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
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
          <div key={label} className="card px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
            <div className="text-2xl font-bold">{value}</div>
          </div>
        ))}
      </div>

      {reviewing && (
        <>
          {/* mobile: pinned above the tab bar so Approve/Reject are always one tap away */}
          <div className="fixed inset-x-0 bottom-[calc(3.9rem+env(safe-area-inset-bottom))] z-30 flex gap-2 border-t border-white/70 bg-white/90 px-4 py-2.5 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.18)] backdrop-blur-xl md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
            <button onClick={() => setDialog('approve')} className={`${btn.primary} flex-1 py-3 md:flex-none md:py-2`}>Approve</button>
            <button onClick={() => setDialog('reject')} className={`${btn.secondary} flex-1 py-3 md:flex-none md:py-2`}>Reject</button>
            <button onClick={() => setDialog('cancel')} className={`${btn.secondary} hidden md:ml-auto md:block`}>Cancel session</button>
          </div>
          <div aria-hidden className="h-14 md:hidden" />
          <button onClick={() => setDialog('cancel')} className="w-full rounded-2xl py-2.5 text-sm text-slate-500 underline-offset-2 hover:underline md:hidden">
            Cancel session
          </button>
        </>
      )}
      {session.status === 'open' && (
        <button onClick={() => setDialog('cancel')} className={`${btn.secondary} w-full py-3 md:w-auto md:py-2`}>Cancel session</button>
      )}

      <div className="space-y-3">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {FILTERS.filter(([key]) => key !== 'changed' || live).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 md:py-1.5 ${
              filter === key
                ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md shadow-red-500/25'
                : 'border border-slate-200 bg-white/80 text-slate-600 hover:bg-white'
            }`}
          >
            {label}
            {key === 'changed' && stats.changed > 0 && ` (${stats.changed})`}
          </button>
        ))}
      </div>
      <input
        type="search"
        placeholder="Search SKU or name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 py-3 text-base outline-none transition focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100 md:py-2.5 md:text-sm"
      />
      </div>

      <div className="overflow-hidden card">
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
            <li key={r.productId} className={r.changed ? 'bg-amber-50' : ''}>
              {/* mobile: compact card */}
              <div className="space-y-2.5 px-4 py-3.5 md:hidden">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.sku}</div>
                  </div>
                  {r.counted ? (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ring-1 ring-inset ${
                        r.difference === 0
                          ? 'bg-slate-50 text-slate-500 ring-slate-200'
                          : r.difference > 0
                            ? 'bg-green-50 text-green-700 ring-green-200'
                            : 'bg-red-50 text-red-700 ring-red-200'
                      }`}
                    >
                      {signed(r.difference)}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-slate-50 px-2.5 py-0.5 text-xs text-slate-400 ring-1 ring-inset ring-slate-200">
                      not counted
                    </span>
                  )}
                </div>
                <div className={`grid gap-2 text-center ${live ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <MiniStat label="Snapshot" value={r.systemQty} />
                  {live && (
                    <MiniStat
                      label="Current"
                      value={r.currentQty}
                      className={r.changed ? 'bg-amber-100 text-amber-900' : ''}
                    />
                  )}
                  <MiniStat label="Counted" value={r.counted ? r.countedQty : '-'} strong />
                </div>
              </div>

              {/* desktop: table row */}
              <div
                className={`hidden items-center gap-2 px-4 py-3 text-sm md:grid ${
                  live ? 'md:grid-cols-[1fr_repeat(4,5.5rem)]' : 'md:grid-cols-[1fr_repeat(3,5.5rem)]'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="text-xs text-slate-500">{r.sku}</div>
                </div>
                <Cell value={r.systemQty} />
                {live && (
                  <Cell value={r.currentQty} className={r.changed ? 'font-semibold text-amber-800' : ''} />
                )}
                <Cell
                  value={r.counted ? r.countedQty : 'not counted'}
                  className={r.counted ? '' : 'text-xs text-slate-400'}
                />
                <Cell
                  value={r.counted ? signed(r.difference) : '-'}
                  className={r.counted ? `font-medium ${diffColor(r.difference)}` : 'text-slate-400'}
                />
              </div>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">No items match this filter.</li>
          )}
        </ul>
      </div>

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
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
          />
          {dialogError && <p className="text-red-600">{dialogError}</p>}
        </Dialog>
      )}

      {dialog === 'stale' && (
        <Dialog
          title="Submission has changed"
          onClose={closeDialog}
          footer={
            <>
              <button onClick={closeDialog} disabled={refreshing} className={btn.secondary}>Close</button>
              <button
                onClick={async () => {
                  await refresh();
                  setDialog(null);
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
            Staff submitted a new version while you were reviewing. Nothing was approved or rejected.
          </p>
          <p>Click <b>Refresh</b> to load the latest counts, then review them again before deciding.</p>
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

function MiniStat({ label, value, strong = false, className = '' }) {
  return (
    <div className={`rounded-xl bg-slate-50 px-2 py-1.5 ${className}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`tabular-nums ${strong ? 'text-base font-bold' : 'text-sm font-medium'}`}>{value}</div>
    </div>
  );
}

function Cell({ value, className = '' }) {
  return <div className={`text-right tabular-nums ${className}`}>{value}</div>;
}
