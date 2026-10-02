import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { btn } from '../../components/Dialog.jsx';

const nf = new Intl.NumberFormat();

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [startingFor, setStartingFor] = useState(null); // store id with the start form open
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState('');

  const load = useCallback(() => {
    api.get('/dashboard').then(setData).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  async function startSession(storeId) {
    setBusy(true);
    setStartError('');
    try {
      const res = await api.post('/sessions', { storeId, note });
      navigate(`/manager/sessions/${res.id}`);
    } catch (err) {
      setStartError(err.message);
      load(); // the store may have gotten an active session in the meantime
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">Halo, {user.name.split(' ')[0]} 👋</p>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="relative col-span-2 overflow-hidden rounded-3xl bg-gradient-to-br from-red-500 via-red-600 to-rose-700 p-5 text-white shadow-lg shadow-red-500/30 sm:col-span-1">
          <div aria-hidden className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
          <div className="relative text-xs font-medium uppercase tracking-wide text-red-100">Total stock</div>
          <div className="relative mt-1 text-4xl font-bold tracking-tight">{nf.format(data.totalUnits)}</div>
          <div className="relative text-xs text-red-100">units · all stores</div>
        </div>
        <Link to="/manager/sessions?status=submitted" className="card card-link p-4 active:scale-[0.98]">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Review</div>
          <div className="mt-1 text-3xl font-bold text-slate-900">{data.pendingReview}</div>
          <div className="text-xs text-slate-500">waiting</div>
        </Link>
        <div className="card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Stores</div>
          <div className="mt-1 text-3xl font-bold text-slate-900">{data.stores.length}</div>
          <div className="text-xs text-slate-500">active</div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Stores</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {data.stores.map((s) => (
            <div key={s.id} className="card p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-slate-500">
                    {s.code} · {s.skuCount} SKUs · {nf.format(s.totalUnits)} units
                  </div>
                </div>
                {s.activeSession && <StatusBadge status={s.activeSession.status} />}
              </div>

              <div className="mt-3">
                {s.activeSession ? (
                  <Link
                    to={`/manager/sessions/${s.activeSession.id}`}
                    className="flex items-center justify-between rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition active:scale-[0.98] sm:inline-flex sm:gap-2"
                  >
                    {s.activeSession.status === 'submitted' ? 'Review submission' : 'Open session'}<span aria-hidden>→</span>
                  </Link>
                ) : startingFor === s.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      maxLength={200}
                      placeholder="Note (optional), e.g. Monthly opname"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 py-3 text-base outline-none transition focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100 sm:py-2.5 sm:text-sm"
                    />
                    {startError && <p className="text-sm text-red-600">{startError}</p>}
                    <div className="flex gap-2 [&>button]:flex-1 [&>button]:py-3 sm:[&>button]:flex-none sm:[&>button]:py-2">
                      <button onClick={() => startSession(s.id)} disabled={busy} className={btn.primary}>
                        {busy ? 'Starting...' : 'Start session'}
                      </button>
                      <button onClick={() => setStartingFor(null)} disabled={busy} className={btn.secondary}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setStartingFor(s.id);
                      setNote('');
                      setStartError('');
                    }}
                    className={`${btn.secondary} w-full py-3 active:scale-[0.98] sm:w-auto sm:py-2`}
                  >
                    Start stock opname
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
