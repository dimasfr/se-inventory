import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, homePathFor } from '../auth.jsx';

// Redirects to /login when signed out, and to the user's own home when the role doesn't match.
// This only shapes the UI; the API enforces the same rules on the server.
export default function RequireRole({ role }) {
  const { user, loading } = useAuth();

  if (loading) return <p className="p-6 text-slate-500">Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={homePathFor(user)} replace />;
  return <Outlet />;
}
