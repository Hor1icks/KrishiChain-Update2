import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { number } from '../../utils/format';
import UtilBar from '../../components/UtilBar';

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState(null);
  const [units, setUnits] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});
  const [unitForm, setUnitForm] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, u] = await Promise.all([api('/storage/warehouses'), api('/storage/units')]);
      setWarehouses(w);
      setUnits(u);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value });

  async function createWarehouse(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/storage/warehouses', { method: 'POST', body: form });
      setForm({});
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addUnit(warehouseId) {
    const capacity = unitForm[warehouseId];
    if (!capacity) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api(`/storage/warehouses/${warehouseId}/units`, {
        method: 'POST',
        body: { capacity: Number(capacity) },
      });
      setNotice(
        `Unit ${res.unitNo} created in warehouse ${res.warehouseId}. ` +
          `The number was assigned by pkg_krishi_rules.next_unit_no, not by you.`
      );
      setUnitForm({ ...unitForm, [warehouseId]: '' });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

    async function toggleMaintenance(warehouseId, unit) {
    const inMaintenance = unit.unitStatus !== 'MAINTENANCE';
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api(
        `/storage/warehouses/${warehouseId}/units/${unit.unitNo}/maintenance`,
        { method: 'PATCH', body: { inMaintenance } }
      );
      setNotice(
        inMaintenance
          ? `Unit ${res.unitNo} is out of service — nothing can be allocated into it.`
          : `Unit ${res.unitNo} is back in service, re-derived as ${res.status} from what it holds.`
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!warehouses) return <p className="muted">Loading…</p>;

  return (
    <div className="page">
      <div className="row">
        <div>
          <h1>Warehouses &amp; Units</h1>
          <p className="muted">
            Units are numbered per warehouse — every warehouse starts again at 1.
          </p>
        </div>
        <button type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'Add warehouse'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      {showForm && (
        <form onSubmit={createWarehouse} className="boxed">
          <div className="grid">
            <label>
              Warehouse name *
              <input value={form.warehouseName || ''} onChange={set('warehouseName')} required />
            </label>
            <label>
              District *
              <input value={form.district || ''} onChange={set('district')} required />
            </label>
            <label>
              Capacity (kg) *
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={form.capacity || ''}
                onChange={set('capacity')}
                required
              />
            </label>
            <label>
              Address
              <input value={form.address || ''} onChange={set('address')} />
            </label>
          </div>
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Create warehouse'}
          </button>
        </form>
      )}

      {warehouses.length === 0 ? (
        <p className="muted">You do not manage any warehouses yet.</p>
      ) : (
        warehouses.map((w) => {
          const wUnits = units.filter((u) => u.warehouseId === w.warehouseId);
          return (
            <section key={w.warehouseId} className="boxed">
              <div className="row">
                <div>
                  <h2>
                    #{w.warehouseId} {w.warehouseName}
                  </h2>
                  <p className="muted">
                    {w.address ? `${w.address} · ` : ''}
                    {w.district} · {w.unitCount} units · {number(w.currentLoad)} /{' '}
                    {number(w.unitCapacity)} kg used · {number(w.freeSpace)} kg free
                  </p>
                </div>
              </div>

              {wUnits.length === 0 ? (
                <p className="muted">No units yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th className="num">Unit</th>
                      <th className="num">Capacity</th>
                      <th className="num">Load</th>
                      <th className="num">Free</th>
                      <th>Utilization</th>
                      <th className="num">Batches</th>
                      <th>Status</th>
                      <th>Alert</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {wUnits.map((u) => (
                      <tr key={u.unitNo}>
                        <td className="num">
                          <strong>{u.unitNo}</strong>
                        </td>
                        <td className="num">{number(u.capacity)}</td>
                        <td className="num">{number(u.currentLoad)}</td>
                        <td className="num">{number(u.freeSpace)}</td>
                        <td>
                          <UtilBar pct={u.utilizationPct} />
                        </td>
                        <td className="num">{u.batchesHeld}</td>
                        <td>
                          <span className={`tag tag-${u.unitStatus.toLowerCase()}`}>
                            {u.unitStatus}
                          </span>
                        </td>
                        <td>
                          <span className={`tag tag-alert-${u.alertLevel.toLowerCase()}`}>
                            {u.alertLevel}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="small ghost"
                            disabled={busy}
                            onClick={() => toggleMaintenance(w.warehouseId, u)}
                            title={
                              u.unitStatus === 'MAINTENANCE'
                                ? 'Return this unit to service'
                                : 'Take this unit out of service — only possible while empty'
                            }
                          >
                            {u.unitStatus === 'MAINTENANCE' ? 'Back in service' : 'Maintenance'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="inline-form">
                <label>
                  New unit capacity (kg)
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={unitForm[w.warehouseId] || ''}
                    onChange={(e) =>
                      setUnitForm({ ...unitForm, [w.warehouseId]: e.target.value })
                    }
                    placeholder="e.g. 40000"
                  />
                </label>
                <button
                  type="button"
                  className="small"
                  disabled={busy || !unitForm[w.warehouseId]}
                  onClick={() => addUnit(w.warehouseId)}
                >
                  Add unit
                </button>
                <span className="note">Unit number is assigned automatically.</span>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
