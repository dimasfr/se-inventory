import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { formatDate } from '../../format.js';

export default function StaffHome() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/sessions')
      .then((res) => setSessions(res.sessions))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!sessions) return <p className="text-slate-500">Loading...</p>;

  const active = sessions.find((s) => s.status === 'open' || s.status === 'submitted');
  const history = sessions.filter((s) => s !== active);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Stock opname</h1>
        <p className="text-sm text-slate-500">{user.storeName}</p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-500">Current session</h2>
        {active ? (
          <Link
            to={`/staff/sessions/${active.id}`}
            className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">Session #{active.id}</div>
                {active.note && <div className="text-sm text-slate-600">{active.note}</div>}
                <div className="mt-1 text-xs text-slate-500">
                  Started {formatDate(active.createdAt)} · {active.itemCount} items
                </div>
              </div>
              <StatusBadge status={active.status} />
            </div>
            <div className="mt-3 text-sm font-medium text-slate-900">
              {active.status === 'open' ? 'Enter counts →' : 'View / edit submitted counts →'}
            </div>
          </Link>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No active session for your store. A manager needs to start one before you can count.
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-slate-500">Previous sessions</h2>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {history.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/staff/sessions/${s.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <div>
                    <div className="text-sm font-medium">Session #{s.id}</div>
                    <div className="text-xs text-slate-500">{formatDate(s.createdAt)}</div>
                  </div>
                  <StatusBadge status={s.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
