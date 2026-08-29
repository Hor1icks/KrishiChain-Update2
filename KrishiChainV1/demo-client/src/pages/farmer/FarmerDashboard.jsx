import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { taka, number } from '../../utils/format';

export default function FarmerDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/farmer/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const s = data.summary;

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <p className="muted">
        {s.farmerName} · {s.district}
      </p>

      {/* V_FARMER_EARNINGS supplies every figure on this row in one query. */}
      <div className="stats">
        <Stat label="Farms" value={number(s.farmCount)} />
        <Stat label="Batches listed" value={number(s.batchesListed)} />
        <Stat label="Batches sold" value={number(s.batchesSold)} />
        <Stat label="Quantity sold" value={`${number(s.quantitySoldKg)} kg`} />
        <Stat label="Total revenue" value={taka(s.totalRevenue)} />
        <Stat label="Received" value={taka(s.amountReceived)} />
        <Stat
          label="Outstanding"
          value={taka(s.amountOutstanding)}
          tone={s.amountOutstanding > 0 ? 'warn' : undefined}
        />
        <Stat
          label="Avg price"
          value={s.avgPricePerKg ? `${s.avgPricePerKg} /kg` : '—'}
        />
      </div>

      <h2>Auctions open right now</h2>
      {data.openAuctions.length === 0 ? (
        <p className="muted">
          No batches are currently accepting bids.{' '}
          <Link to="/farmer/batches/new">List a new batch</Link>.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Batch</th>
              <th>Crop</th>
              <th className="num">Bids</th>
              <th className="num">Minimum</th>
              <th className="num">Highest</th>
              <th className="num">Hours left</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.openAuctions.map((a) => (
              <tr key={a.batchId}>
                <td>#{a.batchId}</td>
                <td>{a.cropName}</td>
                <td className="num">{a.bidCount}</td>
                <td className="num">{a.minimumPrice}</td>
                <td className="num">{a.highestBid ?? '—'}</td>
                <td className="num">{a.hoursRemaining ?? '—'}</td>
                <td>
                  <Link to={`/farmer/batches/${a.batchId}`}>View bids</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Batches by status</h2>
      {data.batchesByStatus.length === 0 ? (
        <p className="muted">Nothing listed yet.</p>
      ) : (
        <ul className="chips">
          {data.batchesByStatus.map((b) => (
            <li key={b.status}>
              <strong>{b.count}</strong> {b.status.replace(/_/g, ' ').toLowerCase()}
            </li>
          ))}
        </ul>
      )}
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
