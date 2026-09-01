import { Link, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import Brand from './Brand';
import NotificationBell from './NotificationBell';

const NAV = {
  FARMER: [
    { to: '/farmer', label: 'Dashboard', end: true },
    { to: '/farmer/farms', label: 'My Farms' },
    { to: '/farmer/batches', label: 'My Batches' },
    { to: '/farmer/batches/new', label: 'New Batch' },
    { to: '/farmer/orders', label: 'My Orders' },
    { to: '/farmer/payments', label: 'Payment History' },
    { to: '/farmer/storage', label: 'Storage Requests' },
  ],
  BUYER: [
    { to: '/buyer', label: 'Dashboard', end: true },
    { to: '/buyer/browse', label: 'Browse Listings' },
    { to: '/buyer/bids', label: 'My Bids' },
    { to: '/buyer/orders', label: 'My Orders' },
    { to: '/buyer/payments', label: 'Payments' },
    { to: '/buyer/storage', label: 'My Storage' },
    { to: '/buyer/reviews', label: 'Reviews' },
  ],
  ADMIN: [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/prices', label: 'Daily Prices' },
    { to: '/admin/users', label: 'Manage Users' },
    { to: '/admin/complaints', label: 'Complaints' },
    { to: '/admin/reports', label: 'Reports' },
  ],
  STORAGE_MANAGER: [
    { to: '/storage', label: 'Dashboard', end: true },
    { to: '/storage/warehouses', label: 'Warehouses & Units' },
    { to: '/storage/allocations', label: 'Allocations' },
  ],
  TRANSPORT_PERSONNEL: [
    { to: '/transport', label: 'My Assignments', end: true },
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
          {items.map((item) => (
            <li key={item.label}>
              <Link to={item.to} className={isActive(item) ? 'active' : ''}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="nav-user">
          <NotificationBell />
          <Link to="/profile" className="muted">
            {user.firstName} · {user.role}
          </Link>
          <button type="button" className="small" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
