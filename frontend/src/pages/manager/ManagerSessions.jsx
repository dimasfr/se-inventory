import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import RefreshButton from '../../components/RefreshButton.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { formatDate } from '../../format.js';

const FILTERS = [
  ['', 'All'],
  ['submitted', 'Waiting review'],
  ['open', 'Open'],
  ['approved', 'Approved'],
  ['cancelled', 'Cancelled'],
];

const ACCENT = {
  open: 'border-l-blue-400',
  submitted: 'border-l-amber-400',
  approved: 'border-l-green-500',
  cancelled: 'border-l-slate-300',
};

export default function ManagerSessions() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');

  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    setError('');
    return api
      .get(`/sessions${status ? `?status=${status}` : ''}`)
      .then((res) => setSessions(res.sessions))
      .catch((err) => setError(err.message))
      .finally(() => setRefreshing(false));
  }, [status]);

  useEffect(() => {
    setSessions(null);
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          {sessions && (
            <p className="text-sm text-slate-500">
              {sessions.length} session{sessions.length === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <RefreshButton onClick={load} refreshing={refreshing} />
      </div>

      {/* chips scroll sideways on small screens, like a tab strip */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setParams(value ? { status: value } : {})}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 md:py-1.5 ${
              status === value
                ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md shadow-red-500/25'
                : 'border border-slate-200 bg-white/80 text-slate-600 hover:bg-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {!sessions && !error && (
        <div className="space-y-3" aria-label="Loading">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-[84px]" />
          ))}
        </div>
      )}

      {sessions && sessions.length === 0 && (
        <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <rect x="5" y="3" width="14" height="18" rx="2.5" />
              <path d="M9 8h6M9 12h6M9 16h3" />
            </svg>
          </div>
          <div className="font-medium">Belum ada session</div>
          <p className="text-sm text-slate-500">Tidak ada session yang cocok dengan filter ini.</p>
        </div>
      )}

      {sessions && sessions.length > 0 && (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                to={`/manager/sessions/${s.id}`}
                className={`card card-link flex items-center gap-3 border-l-4 p-4 active:scale-[0.99] ${ACCENT[s.status] || ACCENT.cancelled}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-semibold">{s.storeName}</div>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    #{s.id} · {formatDate(s.createdAt)} · {s.itemCount} items
                  </div>
                  {s.note && <div className="mt-1 truncate text-sm text-slate-600">{s.note}</div>}
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-slate-300">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
