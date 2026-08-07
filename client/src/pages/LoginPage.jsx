import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import Brand from '../components/Brand';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <Brand />
      <h1>Sign in</h1>
      <p className="muted">Farm to virtual arat to buyer, on one ledger.</p>

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

      {/* All 25 seeded users share one bcrypt-hashed demo password, set in
          03_insert_data.sql, so the marker can actually sign in and reach
          a farmer who already has batches with live bids. */}
      <p className="note">
        <strong>Demo accounts:</strong> any seeded user, password{' '}
        <code>Demo@1234</code>. Try <code>abdul.karim@krishichain.bd</code> — a farmer with
        an open auction waiting to be awarded.
      </p>
    </div>
  );
}
