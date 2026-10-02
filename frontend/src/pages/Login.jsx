import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth, homePathFor } from '../auth.jsx';
import logo from '../assets/images/seinventory-transparent.webp';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 py-3 text-base outline-none transition duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100 lg:py-2.5 lg:text-sm';

const HIGHLIGHTS = [
  'Staff menghitung stok langsung dari toko',
  'Manager meninjau selisih sebelum disetujui',
  'Stok diperbarui hanya setelah approval',
];

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to={homePathFor(user)} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const u = await login(email, password);
      navigate(homePathFor(u), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-red-950 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-red-500/40 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-32 h-[30rem] w-[30rem] rounded-full bg-rose-500/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] [background-size:24px_24px]"
        />

        <div className="relative w-fit">
          <div
            aria-hidden
            className="absolute -inset-8 rounded-full bg-red-500/30 blur-3xl"
          />
          <img
            src={logo}
            alt="SE Inventory"
            className="relative h-24 w-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
          />
        </div>

        <div className="relative space-y-6">
          <h2 className="text-3xl font-bold leading-tight">
            Stock opname,
            <br />
            rapi dan terkontrol.
          </h2>
          <ul className="space-y-3 text-sm text-slate-300">
            {HIGHLIGHTS.map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/30 text-[11px] text-red-200 ring-1 ring-red-400/40">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} SE Inventory</p>
      </aside>

      <main className="relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-red-50 px-4 py-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 top-10 h-72 w-72 rounded-full bg-red-200/50 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-rose-100/70 blur-3xl"
        />

        <form onSubmit={onSubmit} className="animate-fade-up relative w-full max-w-sm space-y-5">
          <img src={logo} alt="SE Inventory" className="mx-auto h-20 w-auto drop-shadow-[0_6px_14px_rgba(220,38,38,0.25)] lg:hidden" />

          <div className="rounded-3xl border border-white/80 bg-white/70 p-7 shadow-2xl shadow-red-900/10 ring-1 ring-slate-900/5 backdrop-blur-xl">
            <div className="mb-5">
              <h1 className="text-2xl font-semibold">Selamat datang</h1>
              <p className="text-sm text-slate-500">Masuk untuk mengelola stock opname</p>
            </div>

            {error && (
              <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="nama@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium">Password</span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-16`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-slate-500 hover:text-slate-900"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-3 py-3.5 text-base lg:py-2.5 lg:text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition duration-200 active:scale-[0.98] hover:-translate-y-px hover:shadow-xl hover:shadow-red-500/40 focus:outline-none focus:ring-4 focus:ring-red-200 active:translate-y-0 disabled:translate-y-0 disabled:opacity-60"
              >
                {submitting ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
