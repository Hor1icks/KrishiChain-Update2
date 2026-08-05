import { Link, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';

/**
 * Role-aware navigation.
 *
 * PRD §11.3 is explicit that the deferred modules must still be VISIBLE
 * but disabled, so an examiner can see the full site map rather than
 * guessing what was planned. Hence `ready: false` entries below — they
 * render greyed out with a "Phase 2" tag instead of being hidden.
 */
const NAV = {
  FARMER: [
    { to: '/farmer', label: 'Dashboard', ready: true, end: true },
    { to: '/farmer/farms', label: 'My Farms', ready: true },
    { to: '/farmer/batches', label: 'My Batches', ready: true },
    { to: '/farmer/batches/new', label: 'New Batch', ready: true },
    { label: 'Payment History', ready: false },
    { label: 'Storage Requests', ready: false },
  ],
  BUYER: [
    { to: '/buyer', label: 'Dashboard', ready: true, end: true },
    { to: '/buyer/browse', label: 'Browse Listings', ready: true },
    { to: '/buyer/bids', label: 'My Bids', ready: true },
    { label: 'My Orders', ready: false },
    { label: 'Payments', ready: false },
    { label: 'Reviews', ready: false },
  ],
  ADMIN: [
    { label: 'Dashboard', ready: false },
    { label: 'Daily Prices', ready: false },
    { label: 'Manage Users', ready: false },
    { label: 'Complaints', ready: false },
  ],
  STORAGE_MANAGER: [
    { to: '/storage', label: 'Dashboard', ready: true, end: true },
    { to: '/storage/warehouses', label: 'Warehouses & Units', ready: true },
    { to: '/storage/allocations', label: 'Allocations', ready: true },
    { label: 'Unit Maintenance', ready: false },
  ],
  TRANSPORT_PERSONNEL: [
    { label: 'My Assignments', ready: false },
    { label: 'Delivery Status', ready: false },
  ],
};

export default function NavBar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  if (!user) return null;
  const items = NAV[user.role] || [];

  const isActive = (item) =>
    item.end ? pathname === item.to : item.to && pathname.startsWith(item.to);

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <span className="brand">KrishiChain</span>

        <ul className="nav-links">
          {items.map((item) =>
            item.ready ? (
              <li key={item.label}>
                <Link to={item.to} className={isActive(item) ? 'active' : ''}>
                  {item.label}
                </Link>
              </li>
            ) : (
              <li key={item.label}>
                <span className="disabled" title="Planned for Update-2 — not built yet">
                  {item.label} <em>Phase 2</em>
                </span>
              </li>
            )
          )}
        </ul>

        <div className="nav-user">
          <span className="muted">
            {user.firstName} · {user.role}
          </span>
          <button type="button" className="small" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
