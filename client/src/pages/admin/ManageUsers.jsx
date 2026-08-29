import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { date } from '../../utils/format';

const ROLES = ['FARMER', 'BUYER', 'ADMIN', 'STORAGE_MANAGER', 'TRANSPORT_PERSONNEL'];

export default function ManageUsers() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (role) params.set('role', role);
      if (search) params.set('search', search);
      const suffix = params.toString() ? `?${params}` : '';
      setUsers(await api(`/admin/users${suffix}`));
    } catch (e) {
      setError(e.message);
    }
  }, [role, search]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="error">{error}</p>;

  const counts = ROLES.map((r) => ({
    role: r,
    count: (users || []).filter((u) => u.role === r).length,
  }));

  return (
    <div className="page">
      <h1>Manage Users</h1>
      <p className="muted">
        Everyone on the platform. Each person holds exactly one role.
      </p>

      <div className="filters">
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or email"
          />
        </label>
      </div>

      {!users ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {!role && (
            <ul className="chips">
              {counts.map((c) => (
                <li key={c.role}>
                  <strong>{c.count}</strong> {c.role.replace(/_/g, ' ').toLowerCase()}
                </li>
              ))}
            </ul>
          )}

          {users.length === 0 ? (
            <p className="muted">Nobody matches that.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th className="num">ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Detail</th>
                  <th>District</th>
                  <th className="num">Phones</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.userId}>
                    <td className="num">{u.userId}</td>
                    <td>{u.name}</td>
                    <td className="small">{u.email}</td>
                    <td>
                      <span className={`tag tag-${(u.role || '').toLowerCase()}`}>
                        {(u.role || '—').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="small">{u.detail || '—'}</td>
                    <td>{u.district}</td>
                    <td className="num">{u.phoneCount}</td>
                    <td>{date(u.registrationDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
