import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import { btn } from '../../components/Dialog.jsx';

const nf = new Intl.NumberFormat();

export default function ManagerDashboard() {
  const navigate = useNavigate();
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
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Total stock (all stores)</div>
          <div className="mt-1 text-2xl font-semibold">{nf.format(data.totalUnits)}</div>
          <div className="text-xs text-slate-500">units</div>
        </div>
        <Link
          to="/manager/sessions?status=submitted"
          className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400"
        >
          <div className="text-sm text-slate-500">Waiting for review</div>
          <div className="mt-1 text-2xl font-semibold">{data.pendingReview}</div>
          <div className="text-xs text-slate-500">submitted sessions</div>
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Stores</div>
          <div className="mt-1 text-2xl font-semibold">{data.stores.length}</div>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-500">Stores</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {data.stores.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
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
                    className="text-sm font-medium text-slate-900 hover:underline"
                  >
                    {s.activeSession.status === 'submitted' ? 'Review submission →' : 'Open session →'}
                  </Link>
                ) : startingFor === s.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      maxLength={200}
                      placeholder="Note (optional), e.g. Monthly opname"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                    {startError && <p className="text-sm text-red-600">{startError}</p>}
                    <div className="flex gap-2">
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
                    className={btn.secondary}
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
