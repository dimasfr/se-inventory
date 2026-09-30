import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import { formatDate } from '../../format.js';

const FILTERS = [
  ['', 'All'],
  ['submitted', 'Waiting review'],
  ['open', 'Open'],
  ['approved', 'Approved'],
  ['cancelled', 'Cancelled'],
];

export default function ManagerSessions() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setSessions(null);
    api
      .get(`/sessions${status ? `?status=${status}` : ''}`)
      .then((res) => setSessions(res.sessions))
      .catch((err) => setError(err.message));
  }, [status]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Sessions</h1>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setParams(value ? { status: value } : {})}
            className={`rounded-full px-3 py-1 text-sm ${
              status === value
                ? 'bg-slate-900 text-white'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!sessions && !error && <p className="text-slate-500">Loading...</p>}

      {sessions && sessions.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No sessions found.
        </p>
      )}

      {sessions && sessions.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                to={`/manager/sessions/${s.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    #{s.id} · {s.storeName}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {formatDate(s.createdAt)} · {s.itemCount} items{s.note ? ` · ${s.note}` : ''}
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
