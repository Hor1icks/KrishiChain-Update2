import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import Brand from '../components/Brand';

const LATEST_DOB = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().slice(0, 10);
})();

const ROLE_FIELDS = {
  FARMER: [
    { name: 'nid', label: 'NID number', required: true },
    { name: 'bankAccountNo', label: 'Bank account no.' },
    { name: 'experienceYears', label: 'Years of experience', type: 'number' },
  ],
  BUYER: [
    { name: 'businessName', label: 'Business name' },
    {
      name: 'buyerType',
      label: 'Buyer type',
      options: ['WHOLESALER', 'RETAILER', 'EXPORTER', 'PROCESSOR'],
    },
    { name: 'tradeLicenseNo', label: 'Trade licence no.' },
  ],
  ADMIN: [
    { name: 'employeeId', label: 'Employee ID', required: true },
    { name: 'designation', label: 'Designation' },
  ],
  STORAGE_MANAGER: [{ name: 'employeeId', label: 'Employee ID', required: true }],
  TRANSPORT_PERSONNEL: [
    { name: 'licenseNo', label: 'Driving licence no.', required: true },
    { name: 'experienceYears', label: 'Years of experience', type: 'number' },
  ],
};

const ROLE_LABELS = {
  FARMER: 'Farmer',
  BUYER: 'Buyer',
  ADMIN: 'Admin staff',
  STORAGE_MANAGER: 'Storage manager',
  TRANSPORT_PERSONNEL: 'Transport personnel',
};

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [districts, setDistricts] = useState([]);
  const [role, setRole] = useState('FARMER');
  const [form, setForm] = useState({ gender: 'M' });
  const [phones, setPhones] = useState(['']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/reference/districts').then(setDistricts).catch(() => setDistricts([]));
  }, []);

  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value });

  function setPhone(index, value) {
    const next = [...phones];
    next[index] = value;
    setPhones(next);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register({ ...form, role, phones: phones.filter(Boolean) });
      navigate('/login', { state: { justRegistered: true } });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card wide">
      <Brand />
      <h1>Create an account</h1>
      <p className="muted">
        Pick your role — it decides which details we collect and what you can do here.
      </p>

      <form onSubmit={handleSubmit}>
        <label>
          I am a…
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.keys(ROLE_FIELDS).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>Your details</legend>
          <div className="grid">
            <label>
              First name *
              <input value={form.firstName || ''} onChange={set('firstName')} required />
            </label>
            <label>
              Middle name
              <input value={form.middleName || ''} onChange={set('middleName')} />
            </label>
            <label>
              Last name *
              <input value={form.lastName || ''} onChange={set('lastName')} required />
            </label>
            <label>
              Gender *
              <select value={form.gender} onChange={set('gender')}>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="O">Other</option>
              </select>
            </label>
            <label>
              Date of birth *
              <input
                type="date"
                value={form.dateOfBirth || ''}
                onChange={set('dateOfBirth')}
                max={LATEST_DOB}
                required
              />
              <small className="muted">You must be at least 18.</small>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Sign-in</legend>
          <div className="grid">
            <label>
              Email *
              <input type="email" value={form.email || ''} onChange={set('email')} required />
            </label>
            <label>
              Password *
              <input
                type="password"
                value={form.password || ''}
                onChange={set('password')}
                required
                minLength={8}
              />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Address</legend>
          <div className="grid">
            <label>
              House no.
              <input value={form.houseNo || ''} onChange={set('houseNo')} />
            </label>
            <label>
              Road
              <input value={form.road || ''} onChange={set('road')} />
            </label>
            <label>
              Village
              <input value={form.village || ''} onChange={set('village')} />
            </label>
            <label>
              Upazila *
              <input value={form.upazila || ''} onChange={set('upazila')} required />
            </label>
            <label>
              District *
              <select value={form.district || ''} onChange={set('district')} required>
                <option value="">Select a district…</option>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Postal code
              <input value={form.postalCode || ''} onChange={set('postalCode')} />
            </label>
          </div>
        </fieldset>

        {}
        <fieldset>
          <legend>Phone numbers *</legend>
          {phones.map((phone, i) => (
            <input
              key={i}
              value={phone}
              onChange={(e) => setPhone(i, e.target.value)}
              placeholder="017XXXXXXXX"
              pattern="01[3-9][0-9]{8}"
              title="An 11-digit Bangladeshi mobile number, e.g. 01711000001"
              required={i === 0}
            />
          ))}
          <button type="button" className="link" onClick={() => setPhones([...phones, ''])}>
            + Add another number
          </button>
        </fieldset>

        <fieldset>
          <legend>{ROLE_LABELS[role]} details</legend>
          <div className="grid">
            {ROLE_FIELDS[role].map((field) => (
              <label key={field.name}>
                {field.label} {field.required && '*'}
                {field.options ? (
                  <select value={form[field.name] || ''} onChange={set(field.name)}>
                    <option value="">—</option>
                    {field.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type || 'text'}
                    value={form[field.name] || ''}
                    onChange={set(field.name)}
                    required={field.required}
                  />
                )}
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="muted">
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
