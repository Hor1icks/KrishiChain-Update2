import { Navigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

/**
 * Route guard. `roles` restricts a route to specific roles — the
 * role-based navigation the PRD's 15 pages depend on (Phases 4-6).
 *
 * This is convenience only, never security: the browser can be told
 * anything. The server re-checks with requireRole() on every request.
 */
export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) return <p className="muted">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;

  return children;
}
