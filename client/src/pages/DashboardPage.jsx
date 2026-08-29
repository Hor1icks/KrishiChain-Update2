import { useAuth } from '../context/AuthContext';

const ROLE_PLAN = {
  FARMER: ['My farms', 'Create harvest batch', 'My batches & bids', 'My sales'],
  BUYER: ['Browse open batches', 'Place a bid', 'My bids', 'My orders'],
  ADMIN: ['Users', 'Crops & categories', 'Daily market prices', 'Complaints'],
  STORAGE_MANAGER: ['Warehouses', 'Storage units', 'Allocate a batch'],
  TRANSPORT_PERSONNEL: ['Assigned trips', 'Update delivery status'],
};

export default function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="auth-card wide">
      <header className="row">
        <div>
          <h1>
            Welcome, {user.firstName} {user.lastName}
          </h1>
          <p className="muted">
            Signed in as <strong>{user.role}</strong> · user #{user.userId}
          </p>
        </div>
        <button type="button" onClick={logout}>
          Sign out
        </button>
      </header>

      <h2>Your module</h2>
      <ul>
        {ROLE_PLAN[user.role].map((item) => (
          <li key={item}>
            {item} <span className="muted">— coming in Phase 4–6</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
