import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { date, number } from '../../utils/format';

export default function Allocations() {
  const [awaiting, setAwaiting] = useState([]);
  const [units, setUnits] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Which batch is being placed, and where.
  const [placing, setPlacing] = useState(null);
  const [target, setTarget] = useState({ unitKey: '', quantityStored: '' });

  const load = useCallback(async () => {
    try {
      const [a, u, al] = await Promise.all([
        api('/storage/awaiting'),
        api('/storage/units'),
        api(`/storage/allocations${showCompleted ? '?all=true' : ''}`),
      ]);
      setAwaiting(a);
      setUnits(u);
      setAllocations(al);
    } catch (e) {
      setError(e.message);
    }
  }, [showCompleted]);

  useEffect(() => {
    load();
  }, [load]);

  function startPlacing(batch) {
    setPlacing(batch);
    setNotice('');
    setError('');
    setTarget({ unitKey: '', quantityStored: String(batch.unstoredQuantity) });
  }

  const selectedUnit = units.find(
    (u) => `${u.warehouseId}-${u.unitNo}` === target.unitKey
  );

  // Both limits shown before submitting: BR-07 (unit free space) and how
  // much of the batch is not already stored. The server enforces both.
  const overCapacity =
    selectedUnit && Number(target.quantityStored) > selectedUnit.freeSpace;
  const overBatch =
    placing && Number(target.quantityStored) > placing.unstoredQuantity;

  async function allocate(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api('/storage/allocations', {
        method: 'POST',
        body: {
          batchId: placing.batchId,
          warehouseId: selectedUnit.warehouseId,
          unitNo: selectedUnit.unitNo,
          quantityStored: Number(target.quantityStored),
        },
      });
      setNotice(
        `Allocation #${res.allocationId}: ${number(res.quantityStored)} kg of batch ` +
          `${res.batchId} into unit ${res.unitNo}. Unit now ${number(res.unitLoad)}/` +
          `${number(res.unitCapacity)} kg, ${number(res.unitFreeSpace)} kg free.` +
          (res.batchPromotedToStored ? ' Batch marked STORED.' : '')
      );
      setPlacing(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function release(allocationId) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api(`/storage/allocations/${allocationId}/release`, {
        method: 'POST',
        body: {},
      });
      setNotice(
        `Allocation #${res.allocationId} released. Unit ${res.unitNo} now holds ` +
          `${number(res.unitLoad)} kg.`
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Allocations</h1>
      <p className="muted">
        Place harvested produce into storage units, and check it back out when it leaves.
      </p>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      <h2>Batches awaiting storage</h2>
      {awaiting.length === 0 ? (
        <p className="muted">Every batch is fully stored.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Batch</th>
              <th>Crop</th>
              <th>Farmer</th>
              <th>District</th>
              <th>Harvested</th>
              <th>Grade</th>
              <th className="num">Total</th>
              <th className="num">Stored</th>
              <th className="num">Unstored</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {awaiting.map((b) => (
              <tr key={b.batchId}>
                <td>#{b.batchId}</td>
                <td>{b.cropName}</td>
                <td>{b.farmerName}</td>
                <td>{b.farmDistrict}</td>
                <td>{date(b.harvestDate)}</td>
                <td>{b.qualityGrade || '—'}</td>
                <td className="num">{number(b.totalQuantity)}</td>
                <td className="num">{number(b.storedQuantity)}</td>
                <td className="num">
                  <strong>{number(b.unstoredQuantity)}</strong>
                </td>
                <td>
                  <span className={`tag tag-${b.batchStatus.toLowerCase()}`}>
                    {b.batchStatus.replace(/_/g, ' ')}
                  </span>
                </td>
                <td>
                  <button type="button" className="small" onClick={() => startPlacing(b)}>
                    Allocate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {placing && (
        <form onSubmit={allocate} className="boxed confirm">
          <h3>
            Allocate batch #{placing.batchId} — {placing.cropName}
          </h3>
          <p className="muted">
            {number(placing.unstoredQuantity)} kg not yet in storage, from {placing.farmerName}.
          </p>

          <div className="grid">
            <label>
              Storage unit *
              <select
                value={target.unitKey}
                onChange={(e) => setTarget({ ...target, unitKey: e.target.value })}
                required
              >
                <option value="">Select a unit…</option>
                {units
                  .filter((u) => u.unitStatus !== 'MAINTENANCE' && u.freeSpace > 0)
                  .map((u) => (
                    <option key={`${u.warehouseId}-${u.unitNo}`} value={`${u.warehouseId}-${u.unitNo}`}>
                      {u.warehouseName} · unit {u.unitNo} — {number(u.freeSpace)} kg free
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Quantity (kg) *
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={target.quantityStored}
                onChange={(e) => setTarget({ ...target, quantityStored: e.target.value })}
                required
              />
            </label>
          </div>

          {selectedUnit && (
            <p className="note">
              Unit {selectedUnit.unitNo} holds {number(selectedUnit.currentLoad)} of{' '}
              {number(selectedUnit.capacity)} kg — {number(selectedUnit.freeSpace)} kg free.
            </p>
          )}
          {overCapacity && (
            <p className="error">
              BR-07: that exceeds the unit&rsquo;s free space of {number(selectedUnit.freeSpace)} kg.
            </p>
          )}
          {overBatch && (
            <p className="error">
              Only {number(placing.unstoredQuantity)} kg of this batch is not already stored.
            </p>
          )}

          <div className="actions">
            <button type="submit" disabled={busy || !selectedUnit || overCapacity || overBatch}>
              {busy ? 'Allocating…' : 'Confirm allocation'}
            </button>
            <button type="button" className="ghost" onClick={() => setPlacing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="row">
        <h2>
          {showCompleted ? 'All allocations' : 'Current allocations'}
        </h2>
        <button type="button" className="ghost small" onClick={() => setShowCompleted((v) => !v)}>
          {showCompleted ? 'Show current only' : 'Include released'}
        </button>
      </div>

      {allocations.length === 0 ? (
        <p className="muted">Nothing in storage.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Batch</th>
              <th>Crop</th>
              <th>Farmer</th>
              <th>Warehouse</th>
              <th className="num">Unit</th>
              <th className="num">Quantity</th>
              <th>Date in</th>
              <th>Date out</th>
              <th className="num">Days</th>
              {/* The ternary's third leg: which manager authorised it. */}
              <th>Authorized by</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {allocations.map((a) => (
              <tr key={a.allocationId}>
                <td>{a.allocationId}</td>
                <td>#{a.batchId}</td>
                <td>{a.cropName}</td>
                <td>{a.farmerName}</td>
                <td>{a.warehouseName}</td>
                <td className="num">{a.unitNo}</td>
                <td className="num">{number(a.quantityStored)}</td>
                <td>{date(a.dateIn)}</td>
                <td>{a.dateOut ? date(a.dateOut) : '—'}</td>
                <td className="num">{a.daysStored}</td>
                <td>{a.authorizedBy}</td>
                <td>
                  <span className={`tag tag-${a.allocationStatus.toLowerCase()}`}>
                    {a.allocationStatus}
                  </span>
                </td>
                <td>
                  {a.allocationStatus === 'ACTIVE' && (
                    <button
                      type="button"
                      className="small ghost"
                      disabled={busy}
                      onClick={() => release(a.allocationId)}
                    >
                      Release
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
