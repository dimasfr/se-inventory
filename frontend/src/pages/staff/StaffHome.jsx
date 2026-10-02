import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import RefreshButton from '../../components/RefreshButton.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { formatDate } from '../../format.js';

export default function StaffHome() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');

  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    setError('');
    return api
      .get('/sessions')
      .then((res) => setSessions(res.sessions))
      .catch((err) => setError(err.message))
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!sessions) {
    return (
      <div className="space-y-4" aria-label="Loading">
        <div className="skeleton h-14 w-2/3" />
        <div className="skeleton h-44" />
        <div className="skeleton h-20" />
      </div>
    );
  }

  const active = sessions.find((s) => s.status === 'open' || s.status === 'submitted');
  const history = sessions.filter((s) => s !== active);

  return (
    <div className="space-y-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Halo, {user.name.split(' ')[0]} 👋</p>
          <h1 className="text-2xl font-semibold tracking-tight">Stock opname</h1>
          <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-slate-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
            {user.storeName}
          </p>
        </div>
        <RefreshButton onClick={load} refreshing={refreshing} />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Current session</h2>
        {active ? (
          <Link
            to={`/staff/sessions/${active.id}`}
            className="relative block overflow-hidden rounded-3xl bg-gradient-to-br from-red-500 via-red-600 to-rose-700 p-5 text-white shadow-lg shadow-red-500/30 transition active:scale-[0.98]"
          >
            <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-red-100">Session #{active.id}</div>
                <div className="mt-1 truncate text-xl font-semibold">{active.note || 'Stock opname'}</div>
                <div className="mt-1 text-sm text-red-100">
                  {formatDate(active.createdAt)} · {active.itemCount} items
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ring-white/40">
                {active.status}
              </span>
            </div>
            <div className="relative mt-5 flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-red-700">
              {active.status === 'open' ? 'Enter counts' : 'View / edit submitted counts'}
              <span aria-hidden>→</span>
            </div>
          </Link>
        ) : (
          <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <rect x="5" y="3" width="14" height="18" rx="2.5" />
                <path d="M9 8h6M9 12h6M9 16h3" />
              </svg>
            </div>
            <div className="font-medium">Belum ada session aktif</div>
            <p className="text-sm text-slate-500">
              Manager perlu memulai stock opname untuk toko Anda sebelum Anda bisa menghitung.
            </p>
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Previous sessions</h2>
          <ul className="space-y-3">
            {history.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/staff/sessions/${s.id}`}
                  className="card card-link flex items-center gap-3 p-4 active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">Session #{s.id}</div>
                    <div className="text-xs text-slate-500">{formatDate(s.createdAt)}</div>
                  </div>
                  <StatusBadge status={s.status} />
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-slate-300">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
