import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { number } from '../../utils/format';
import UtilBar from '../../components/UtilBar';

export default function StorageDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/storage/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const s = data.summary;
  const pct = s.totalCapacity ? Math.round((s.totalLoad / s.totalCapacity) * 1000) / 10 : 0;
  const alert = (level) => data.byAlert.find((a) => a.alertLevel === level)?.count ?? 0;

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <p className="muted">Capacity across the warehouses you manage</p>

      <div className="stats">
        <Stat label="Warehouses" value={number(s.warehouseCount)} />
        <Stat label="Units" value={number(s.unitCount)} />
        <Stat label="Capacity" value={`${number(s.totalCapacity)} kg`} />
        <Stat label="Stored" value={`${number(s.totalLoad)} kg`} />
        <Stat label="Free" value={`${number(s.totalFree)} kg`} />
        <Stat label="Utilization" value={`${pct}%`} />
        <Stat label="Critical units" value={number(alert('CRITICAL'))} tone={alert('CRITICAL') ? 'warn' : undefined} />
        <Stat
          label="Awaiting storage"
          value={number(data.batchesAwaitingStorage)}
          tone={data.batchesAwaitingStorage ? 'good' : undefined}
        />
      </div>

      <h2>Units needing attention</h2>
      {data.needsAttention.length === 0 ? (
        <p className="muted">Nothing above 75% capacity. All units have room.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Warehouse</th>
              <th className="num">Unit</th>
              <th className="num">Load</th>
              <th className="num">Capacity</th>
              <th className="num">Free</th>
              <th>Utilization</th>
              <th>Alert</th>
            </tr>
          </thead>
          <tbody>
            {data.needsAttention.map((u) => (
              <tr key={`${u.warehouseId}-${u.unitNo}`}>
                <td>{u.warehouseName}</td>
                <td className="num">{u.unitNo}</td>
                <td className="num">{number(u.currentLoad)}</td>
                <td className="num">{number(u.capacity)}</td>
                <td className="num">{number(u.freeSpace)}</td>
                <td>
                  <UtilBar pct={u.utilizationPct} />
                </td>
                <td>
                  <span className={`tag tag-alert-${u.alertLevel.toLowerCase()}`}>
                    {u.alertLevel}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="muted">
        <Link to="/storage/allocations">Allocate batches to units →</Link>
      </p>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
