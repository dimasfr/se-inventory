import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, homePathFor } from '../auth.jsx';
import logo from '../assets/images/seinventory-transparent.webp';

const icon = (d) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
    {d}
  </svg>
);

const MANAGER_NAV = [
  {
    to: '/manager',
    label: 'Dashboard',
    end: true,
    icon: icon(
      <>
        <rect x="3" y="3" width="7" height="9" rx="2" />
        <rect x="14" y="3" width="7" height="5" rx="2" />
        <rect x="14" y="12" width="7" height="9" rx="2" />
        <rect x="3" y="16" width="7" height="5" rx="2" />
      </>
    ),
  },
  {
    to: '/manager/sessions',
    label: 'Sessions',
    end: false,
    icon: icon(
      <>
        <rect x="5" y="3" width="14" height="18" rx="2.5" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const isManager = user.role === 'manager';
  const roleLabel = isManager ? 'Store Manager' : `Staff · ${user.storeName}`;
  const initial = user.name?.trim()?.[0]?.toUpperCase();

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-red-50">
      <div aria-hidden className="pointer-events-none absolute -right-32 top-24 h-96 w-96 rounded-full bg-red-200/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -left-32 bottom-0 h-96 w-96 rounded-full bg-rose-100/60 blur-3xl" />

      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/75 pt-[env(safe-area-inset-top)] shadow-sm shadow-slate-200/50 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 md:h-auto md:py-3">
          <div className="flex items-center gap-4">
            <Link to={homePathFor(user)} className="shrink-0">
              <img src={logo} alt="SE Inventory" className="h-7 w-auto md:h-8" />
            </Link>
            {isManager && (
              <nav className="hidden gap-1 text-sm md:flex">
                {MANAGER_NAV.map(({ to, label, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `rounded-full px-3 py-1 transition ${
                        isActive
                          ? 'bg-red-50 font-medium text-red-700 ring-1 ring-red-100'
                          : 'text-slate-500 hover:bg-white hover:text-slate-900'
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>

          {/* desktop: name + logout inline */}
          <div className="hidden items-center gap-3 text-sm md:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-sm font-semibold text-white shadow-md shadow-red-500/30">
              {initial}
            </div>
            <div className="text-right leading-tight">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-slate-500">{roleLabel}</div>
            </div>
            <button
              onClick={logout}
              className="rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-slate-700 shadow-sm transition hover:bg-white hover:shadow"
            >
              Log out
            </button>
          </div>

          {/* mobile: avatar opens a small account sheet */}
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Account menu"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-sm font-semibold text-white shadow-md shadow-red-500/30 transition active:scale-95 md:hidden"
          >
            {initial}
          </button>
        </div>
      </header>

      <main
        key={pathname}
        className={`animate-fade-up relative mx-auto max-w-5xl px-4 py-5 md:py-8 ${
          isManager ? 'pb-28 md:pb-8' : ''
        }`}
      >
        <Outlet />
      </main>

      {isManager && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/70 bg-white/85 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.18)] backdrop-blur-xl md:hidden"
        >
          <div className="mx-auto grid max-w-md grid-cols-2 px-2 pt-1.5">
            {MANAGER_NAV.map(({ to, label, end, icon: ic }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-medium transition active:scale-95 ${
                    isActive ? 'text-red-600' : 'text-slate-400'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`rounded-full px-5 py-1 transition ${isActive ? 'bg-red-50' : ''}`}>{ic}</span>
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
          <div
            role="dialog"
            aria-label="Account"
            onClick={(e) => e.stopPropagation()}
            className="animate-fade-up absolute inset-x-0 bottom-0 rounded-t-3xl border border-white/80 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-lg font-semibold text-white shadow-md shadow-red-500/30">
                {initial}
              </div>
              <div className="leading-tight">
                <div className="font-semibold">{user.name}</div>
                <div className="text-sm text-slate-500">{roleLabel}</div>
              </div>
            </div>
            <button
              onClick={logout}
              className="mt-5 w-full rounded-2xl border border-red-100 bg-red-50 py-3 text-sm font-semibold text-red-700 transition active:scale-[0.98]"
            >
              Log out
            </button>
            <button
              onClick={() => setMenuOpen(false)}
              className="mt-2 w-full rounded-2xl py-3 text-sm text-slate-500 transition active:scale-[0.98]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
