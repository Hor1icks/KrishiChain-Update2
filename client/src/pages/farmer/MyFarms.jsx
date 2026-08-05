import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { number } from '../../utils/format';

export default function MyFarms() {
  const [farms, setFarms] = useState(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const load = () => api('/farmer/farms').then(setFarms).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value });

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/farmer/farms', { method: 'POST', body: form });
      setForm({});
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="row">
        <h1>My Farms</h1>
        <button type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'Add a farm'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {showForm && (
        <form onSubmit={submit} className="boxed">
          <div className="grid">
            <label>
              Farm name *
              <input value={form.farmName || ''} onChange={set('farmName')} required />
            </label>
            <label>
              Area (acres) *
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.area || ''}
                onChange={set('area')}
                required
              />
            </label>
            <label>
              District *
              <input value={form.district || ''} onChange={set('district')} required />
            </label>
            <label>
              Soil type
              <input value={form.soilType || ''} onChange={set('soilType')} />
            </label>
            <label>
              Irrigation
              <input value={form.irrigationType || ''} onChange={set('irrigationType')} />
            </label>
            <label>
              Location
              <input value={form.location || ''} onChange={set('location')} />
            </label>
          </div>
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save farm'}
          </button>
        </form>
      )}

      {!farms ? (
        <p className="muted">Loading…</p>
      ) : farms.length === 0 ? (
        <p className="muted">
          No farms yet. A farm is required before you can list a harvest batch.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th className="num">Area</th>
              <th>Soil</th>
              <th>Irrigation</th>
              <th>District</th>
              <th className="num">Batches</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {farms.map((f) => (
              <tr key={f.farmId}>
                <td>{f.farmId}</td>
                <td>{f.farmName}</td>
                <td className="num">{f.area}</td>
                <td>{f.soilType || '—'}</td>
                <td>{f.irrigationType || '—'}</td>
                <td>{f.district}</td>
                <td className="num">{number(f.batchCount)}</td>
                <td>{f.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
