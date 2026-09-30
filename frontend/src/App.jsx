import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import RequireRole from './components/RequireRole.jsx';
import Login from './pages/Login.jsx';
import ManagerDashboard from './pages/manager/ManagerDashboard.jsx';
import ManagerSessions from './pages/manager/ManagerSessions.jsx';
import ManagerSessionReview from './pages/manager/ManagerSessionReview.jsx';
import StaffHome from './pages/staff/StaffHome.jsx';
import StaffSession from './pages/staff/StaffSession.jsx';
import { useAuth, homePathFor } from './auth.jsx';

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? homePathFor(user) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Home />} />

      <Route element={<RequireRole role="staff" />}>
        <Route element={<Layout />}>
          <Route path="/staff" element={<StaffHome />} />
          <Route path="/staff/sessions/:id" element={<StaffSession />} />
        </Route>
      </Route>

      <Route element={<RequireRole role="manager" />}>
        <Route element={<Layout />}>
          <Route path="/manager" element={<ManagerDashboard />} />
          <Route path="/manager/sessions" element={<ManagerSessions />} />
          <Route path="/manager/sessions/:id" element={<ManagerSessionReview />} />
        </Route>
      </Route>

      <Route path="*" element={<Home />} />
    </Routes>
  );
}
