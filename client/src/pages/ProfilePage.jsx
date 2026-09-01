import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { date } from '../utils/format';

const ROLE_LABEL = {
  FARMER: 'Farmer',
  BUYER: 'Buyer',
  ADMIN: 'Administrator',
  STORAGE_MANAGER: 'Storage manager',
  TRANSPORT_PERSONNEL: 'Transport',
};

const GENDER = { M: 'Male', F: 'Female', O: 'Other' };

function Field({ label, children }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{children || '—'}</span>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/auth/me')
      .then(setProfile)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!profile) return <div className="page"><p className="muted">Loading.</p></div>;

  const name = [profile.firstName, profile.middleName, profile.lastName]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="page">
      <div className="row">
        <div>
          <h1>{name}</h1>
          <p className="muted">
            {ROLE_LABEL[profile.role] || profile.role} · account #{profile.userId} ·
            joined {date(profile.registrationDate)}
          </p>
        </div>
        <span className={`tag tag-${String(profile.status).toLowerCase()}`}>
          {profile.status}
        </span>
      </div>

      <div className="stats">
        <Field label="Email">{profile.email}</Field>
        <Field label="Phone">{profile.phones?.join(', ')}</Field>
        <Field label="Date of birth">
          {date(profile.dateOfBirth)}
          {profile.age ? ` (${profile.age})` : ''}
        </Field>
        <Field label="Gender">{GENDER[profile.gender]}</Field>
        <Field label="Upazila">{profile.upazila}</Field>
        <Field label="District">{profile.district}</Field>
      </div>

      <h2>Address</h2>
      <p className="boxed">{profile.fullAddress}</p>
    </div>
  );
}
