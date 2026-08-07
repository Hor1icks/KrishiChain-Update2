import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { date } from '../../utils/format';

/**
 * Daily market prices — the reference data the farmer's "did I beat the
 * market?" comparison reads from.
 *
 * (CropID, AratID, PriceDate) is the primary key, so a second price for
 * the same crop, arat and day is rejected by the database rather than by
 * a check here. That is acceptance case T-08, and it is worth triggering
 * live during the viva: submit the same day twice.
 */
export default function DailyPrices() {
  const [prices, setPrices] = useState(null);
  const [crops, setCrops] = useState([]);
  const [arats, setArats] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState({ cropId: '', aratId: '' });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    cropId: '',
    aratId: '',
    priceDate: new Date().toISOString().slice(0, 10),
    pricePerKg: '',
    minPrice: '',
    maxPrice: '',
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter.cropId) params.set('cropId', filter.cropId);
      if (filter.aratId) params.set('aratId', filter.aratId);
      const suffix = params.toString() ? `?${params}` : '';
      const [p, c, a] = await Promise.all([
        api(`/admin/prices${suffix}`),
        api('/reference/crops'),
        api('/reference/arats'),
      ]);
      setPrices(p);
      setCrops(c);
      setArats(a);
    } catch (e) {
      setError(e.message);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value });

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api('/admin/prices', {
        method: 'POST',
        body: {
          cropId: Number(form.cropId),
          aratId: Number(form.aratId),
          priceDate: form.priceDate,
          pricePerKg: Number(form.pricePerKg),
          minPrice: Number(form.minPrice),
          maxPrice: Number(form.maxPrice),
        },
      });
      setNotice(`Logged ${res.pricePerKg}/kg. Farmers comparing against the market see this now.`);
      setForm({ ...form, pricePerKg: '', minPrice: '', maxPrice: '' });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const price = Number(form.pricePerKg);
  const min = Number(form.minPrice);
  const max = Number(form.maxPrice);
  const outOfRange =
    form.pricePerKg !== '' &&
    form.minPrice !== '' &&
    form.maxPrice !== '' &&
    !(min <= price && price <= max);

  return (
    <div className="page">
      <div className="row">
        <div>
          <h1>Daily Prices</h1>
          <p className="muted">One price per crop, per arat, per day.</p>
        </div>
        <button type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'Log a price'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      {showForm && (
        <form onSubmit={submit} className="boxed">
          <div className="grid">
            <label>
              Crop *
              <select value={form.cropId} onChange={set('cropId')} required>
                <option value="">Select…</option>
                {crops.map((c) => (
                  <option key={c.cropId} value={c.cropId}>
                    {c.cropName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Arat *
              <select value={form.aratId} onChange={set('aratId')} required>
                <option value="">Select…</option>
                {arats.map((a) => (
                  <option key={a.aratId} value={a.aratId}>
                    {a.aratName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date *
              <input type="date" value={form.priceDate} onChange={set('priceDate')} required />
            </label>
            <label>
              Day's price /kg *
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.pricePerKg}
                onChange={set('pricePerKg')}
                required
              />
            </label>
            <label>
              Low *
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.minPrice}
                onChange={set('minPrice')}
                required
              />
            </label>
            <label>
              High *
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.maxPrice}
                onChange={set('maxPrice')}
                required
              />
            </label>
          </div>

          {outOfRange && (
            <p className="error">
              The day's price has to sit inside its own range — low ≤ price ≤ high.
            </p>
          )}
          <p className="note">
            A price already logged for that crop, arat and date is refused: the three columns are
            the primary key.
          </p>

          <button type="submit" disabled={busy || outOfRange}>
            {busy ? 'Saving…' : 'Log price'}
          </button>
        </form>
      )}

      <div className="filters">
        <label>
          Crop
          <select
            value={filter.cropId}
            onChange={(e) => setFilter({ ...filter, cropId: e.target.value })}
          >
            <option value="">All crops</option>
            {crops.map((c) => (
              <option key={c.cropId} value={c.cropId}>
                {c.cropName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Arat
          <select
            value={filter.aratId}
            onChange={(e) => setFilter({ ...filter, aratId: e.target.value })}
          >
            <option value="">All arats</option>
            {arats.map((a) => (
              <option key={a.aratId} value={a.aratId}>
                {a.aratName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!prices ? (
        <p className="muted">Loading…</p>
      ) : prices.length === 0 ? (
        <p className="muted">No prices logged for that combination.</p>
      ) : (
        <>
          <p className="muted">Showing the 100 most recent.</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Crop</th>
                <th>Arat</th>
                <th className="num">Price/kg</th>
                <th className="num">Low</th>
                <th className="num">High</th>
                <th>Logged by</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => (
                <tr key={`${p.cropId}-${p.aratId}-${p.priceDate}`}>
                  <td>{date(p.priceDate)}</td>
                  <td>{p.cropName}</td>
                  <td>{p.aratName}</td>
                  <td className="num">
                    <strong>{p.pricePerKg}</strong>
                  </td>
                  <td className="num">{p.minPrice}</td>
                  <td className="num">{p.maxPrice}</td>
                  <td className="small">{p.loggedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
