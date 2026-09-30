import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth, homePathFor } from '../auth.jsx';

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link to={homePathFor(user)} className="font-semibold text-slate-900">
              SE Inventory
            </Link>
            {user.role === 'manager' && (
              <nav className="flex gap-3 text-sm">
                {[
                  ['/manager', 'Dashboard', true],
                  ['/manager/sessions', 'Sessions', false],
                ].map(([to, label, end]) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      isActive ? 'font-medium text-slate-900' : 'text-slate-500 hover:text-slate-900'
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-slate-500">
                {user.role === 'manager' ? 'Store Manager' : `Staff · ${user.storeName}`}
              </div>
            </div>
            <button
              onClick={logout}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
