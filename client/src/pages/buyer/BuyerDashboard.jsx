import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { number, taka } from '../../utils/format';

export default function BuyerDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/buyer/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const count = (status) => data.bidsByStatus.find((b) => b.status === status)?.count ?? 0;

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <p className="muted">Your bidding activity across the marketplace</p>

      <div className="stats">
        <Stat label="Leading" value={number(count('ACTIVE'))} tone={count('ACTIVE') ? 'good' : undefined} />
        <Stat label="Outbid" value={number(count('OUTBID'))} />
        <Stat label="Won" value={number(count('WON'))} />
        <Stat label="Orders" value={number(data.orders.orderCount)} />
        <Stat label="Committed" value={taka(data.orders.totalCommitted)} />
        <Stat label="Paid" value={taka(data.orders.totalPaid)} />
        <Stat
          label="Outstanding"
          value={taka(data.orders.totalCommitted - data.orders.totalPaid)}
          tone={data.orders.totalCommitted - data.orders.totalPaid > 0 ? 'warn' : undefined}
        />
      </div>

      <h2>Auctions you are currently leading</h2>
      {data.leading.length === 0 ? (
        <p className="muted">
          You have no standing bids. <Link to="/buyer/browse">Browse open listings</Link>.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Batch</th>
              <th>Crop</th>
              <th className="num">Your bid</th>
              <th className="num">Quantity</th>
              <th className="num">Hours left</th>
              <th>State</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.leading.map((b) => (
              <tr key={b.bidId}>
                <td>#{b.batchId}</td>
                <td>{b.cropName}</td>
                <td className="num">
                  <strong className="good">{b.bidPricePerKg}</strong>
                </td>
                <td className="num">{number(b.requestedQuantity)}</td>
                <td className="num">{b.hoursRemaining ?? '—'}</td>
                <td>{b.biddingState}</td>
                <td>
                  <Link to={`/buyer/batches/${b.batchId}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
