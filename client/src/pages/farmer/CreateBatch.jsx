import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../api/client';

export default function CreateBatch() {
  const navigate = useNavigate();
  const [farms, setFarms] = useState([]);
  const [crops, setCrops] = useState([]);
  const [arats, setArats] = useState([]);
  const [form, setForm] = useState({ qualityGrade: 'A' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api('/farmer/farms'), api('/reference/crops'), api('/reference/arats')])
      .then(([f, c, a]) => {
        setFarms(f);
        setCrops(c);
        setArats(a);
      })
      .catch((e) => setError(e.message));
  }, []);

  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value });

  const selectedCrop = useMemo(
    () => crops.find((c) => String(c.cropId) === String(form.cropId)),
    [crops, form.cropId]
  );

  const belowBase =
    selectedCrop && form.minimumPrice !== '' && form.minimumPrice !== undefined
      ? Number(form.minimumPrice) < Number(selectedCrop.basePrice)
      : false;

  const minQtyOverTotal =
    form.minimumBidQuantity !== '' &&
    form.minimumBidQuantity !== undefined &&
    form.totalQuantity !== '' &&
    form.totalQuantity !== undefined
      ? Number(form.minimumBidQuantity) > Number(form.totalQuantity)
      : false;

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { batchId } = await api('/farmer/batches', { method: 'POST', body: form });
      navigate(`/farmer/batches/${batchId}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (farms.length === 0 && !error) {
    return (
      <div className="page">
        <h1>New Harvest Batch</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <h1>New Harvest Batch</h1>

      {farms.length === 0 ? (
        <p className="error">You need to add a farm before listing a batch.</p>
      ) : (
        <form onSubmit={submit}>
          <fieldset>
            <legend>What and where</legend>
            <div className="grid">
              <label>
                Farm *
                <select value={form.farmId || ''} onChange={set('farmId')} required>
                  <option value="">Select…</option>
                  {farms.map((f) => (
                    <option key={f.farmId} value={f.farmId}>
                      {f.farmName} ({f.district})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Crop *
                <select value={form.cropId || ''} onChange={set('cropId')} required>
                  <option value="">Select…</option>
                  {crops.map((c) => (
                    <option key={c.cropId} value={c.cropId}>
                      {c.cropName} — base ৳{c.basePrice}/{c.unit}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sell through ARAT *
                <select value={form.aratId || ''} onChange={set('aratId')} required>
                  <option value="">Select…</option>
                  {arats.map((a) => (
                    <option key={a.aratId} value={a.aratId}>
                      {a.label.replace(/ /g, ' ')} ({a.district})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>The harvest</legend>
            <div className="grid">
              <label>
                Harvest date *
                <input
                  type="date"
                  value={form.harvestDate || ''}
                  onChange={set('harvestDate')}
                  required
                />
              </label>
              <label>
                Total quantity (kg) *
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={form.totalQuantity || ''}
                  onChange={set('totalQuantity')}
                  required
                />
              </label>
              <label>
                Quality grade
                <select value={form.qualityGrade} onChange={set('qualityGrade')}>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </label>
              <label>
                Moisture %
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.moisturePercentage || ''}
                  onChange={set('moisturePercentage')}
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Bidding</legend>
            <div className="grid">
              <label>
                Minimum price per kg *
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.minimumPrice || ''}
                  onChange={set('minimumPrice')}
                  required
                />
              </label>
              <label>
                Minimum bid quantity (kg) *
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={form.minimumBidQuantity || ''}
                  onChange={set('minimumBidQuantity')}
                  required
                />
              </label>
              <label>
                Bidding opens
                <input
                  type="datetime-local"
                  value={form.biddingStartTime || ''}
                  onChange={set('biddingStartTime')}
                />
              </label>
              <label>
                Bidding closes
                <input
                  type="datetime-local"
                  value={form.biddingEndTime || ''}
                  onChange={set('biddingEndTime')}
                />
              </label>
            </div>

            {belowBase && (
              <p className="error">
                {selectedCrop.cropName}&rsquo;s base price is ৳{selectedCrop.basePrice}. You
                cannot list below it.
              </p>
            )}
            {minQtyOverTotal && (
              <p className="error">
                Minimum bid quantity cannot exceed the total quantity ({form.totalQuantity} kg).
              </p>
            )}
            <p className="note">
              No bid below the minimum bid quantity will be accepted. Leave the bidding times
              empty to save the batch as a draft — you can open bidding later.
            </p>
          </fieldset>

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={busy || belowBase || minQtyOverTotal}>
            {busy ? 'Creating…' : 'Create batch'}
          </button>
        </form>
      )}
    </div>
  );
}
