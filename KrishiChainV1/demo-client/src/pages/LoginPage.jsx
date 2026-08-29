import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../api/client';
import Brand from '../components/Brand';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(withEmail, withPassword) {
    setError('');
    setBusy(true);
    try {
      await login(withEmail, withPassword);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    signIn(email, password);
  }

  return (
    <div className="auth-card">
      <Brand />
      <h1>Sign in</h1>
      <p className="muted">Farm to virtual arat to buyer, on one ledger.</p>

      {/* One button per branch of the specialization. Nobody should be
          typing an email address while presenting, and each role opens a
          different module, so this doubles as the tour's table of
          contents. */}
      <div className="role-picker">
        <p className="role-picker-label">Sign in as</p>
        <div className="role-picker-grid">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.role}
              type="button"
              className="role-chip"
              disabled={busy}
              onClick={() => signIn(account.email, DEMO_PASSWORD)}
            >
              <span className="role-chip-role">{account.label}</span>
              <span className="role-chip-name">{account.name}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="or-divider"><span>or type it in</span></p>

      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="muted">
        No account? <Link to="/register">Register</Link>
      </p>

      <p className="note">
        <strong>Front-end demo build.</strong> Pages read data recorded from the
        live API, so every screen and every route works with no server and no
        database running. All accounts use <code>{DEMO_PASSWORD}</code>.
      </p>
    </div>
  );
}
