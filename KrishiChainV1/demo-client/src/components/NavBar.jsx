import { Link, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import Brand from './Brand';
import NotificationBell from './NotificationBell';

/**
 * Role-aware navigation.
 *
 * PRD §11.3 wanted deferred modules visible but disabled so an examiner
 * could see the whole site map. Every one of them is now built, so there
 * are no `ready: false` entries left — the disabled-link rendering below
 * is kept because it costs nothing and is the right behaviour if anything
 * is ever staged again.
 */
const NAV = {
  FARMER: [
    { to: '/farmer', label: 'Dashboard', ready: true, end: true },
    { to: '/farmer/farms', label: 'My Farms', ready: true },
    { to: '/farmer/batches', label: 'My Batches', ready: true },
    { to: '/farmer/batches/new', label: 'New Batch', ready: true },
    { to: '/farmer/orders', label: 'My Orders', ready: true },
    { to: '/farmer/payments', label: 'Payment History', ready: true },
    { to: '/farmer/storage', label: 'Storage Requests', ready: true },
  ],
  BUYER: [
    { to: '/buyer', label: 'Dashboard', ready: true, end: true },
    { to: '/buyer/browse', label: 'Browse Listings', ready: true },
    { to: '/buyer/bids', label: 'My Bids', ready: true },
    { to: '/buyer/orders', label: 'My Orders', ready: true },
    { to: '/buyer/payments', label: 'Payments', ready: true },
    { to: '/buyer/storage', label: 'My Storage', ready: true },
    { to: '/buyer/reviews', label: 'Reviews', ready: true },
  ],
  ADMIN: [
    { to: '/admin', label: 'Dashboard', ready: true, end: true },
    { to: '/admin/prices', label: 'Daily Prices', ready: true },
    { to: '/admin/users', label: 'Manage Users', ready: true },
    { to: '/admin/complaints', label: 'Complaints', ready: true },
  ],
  STORAGE_MANAGER: [
    { to: '/storage', label: 'Dashboard', ready: true, end: true },
    { to: '/storage/warehouses', label: 'Warehouses & Units', ready: true },
    { to: '/storage/allocations', label: 'Allocations', ready: true },
  ],
  TRANSPORT_PERSONNEL: [
    { to: '/transport', label: 'My Assignments', ready: true, end: true },
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
        <Brand />

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
          {/* Says plainly what this build is, so nobody mistakes recorded
              data for a live database connection. */}
          <span className="demo-badge" title="Pages read data recorded from the live API. No server or database is running.">
            demo data
          </span>
          <NotificationBell />
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
