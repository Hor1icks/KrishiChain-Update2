import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { date, number, taka } from '../../utils/format';

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const s = data.summary;

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <p className="muted">Platform-wide oversight.</p>

      <div className="stats">
        <Stat label="Users" value={number(s.userCount)} />
        <Stat label="Farmers" value={number(s.farmerCount)} />
        <Stat label="Buyers" value={number(s.buyerCount)} />
        <Stat label="Batches" value={number(s.batchCount)} />
        <Stat label="Open auctions" value={number(s.openAuctions)} tone={s.openAuctions ? 'good' : undefined} />
        <Stat label="Bids" value={number(s.bidCount)} />
        <Stat label="Orders" value={number(s.orderCount)} />
        <Stat label="Gross value" value={taka(s.grossValue)} />
        <Stat label="Paid" value={taka(s.amountPaid)} />
        <Stat
          label="Undelivered"
          value={number(s.undelivered)}
          tone={s.undelivered ? 'warn' : undefined}
        />
        <Stat
          label="Open complaints"
          value={number(s.openComplaints)}
          tone={s.openComplaints ? 'warn' : undefined}
        />
        <Stat label="Prices logged today" value={number(s.pricesLoggedToday)} />
      </div>

      <h2>Still in transit</h2>
      {data.inFlight.length === 0 ? (
        <p className="muted">Nothing is in transit.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Crop</th>
              <th>Buyer</th>
              <th>Carrier</th>
              <th>Vehicle</th>
              <th className="num">Days waiting</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.inFlight.map((t) => (
              <tr key={t.saleOrderId}>
                <td>#{t.saleOrderId}</td>
                <td>{t.cropName}</td>
                <td>{t.buyerName}</td>
                <td>{t.driverName || <span className="muted">unassigned</span>}</td>
                <td>{t.vehicleNo || <span className="muted">—</span>}</td>
                <td className="num">{number(t.daysSinceRequest)}</td>
                <td>
                  <span className={`tag tag-${String(t.deliveryStatus).toLowerCase()}`}>
                    {t.deliveryStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Delivered but not paid</h2>
      {data.unpaidOrders.length === 0 ? (
        <p className="muted">Every delivered order is settled.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Buyer</th>
              <th>Delivered</th>
              <th className="num">Total</th>
              <th className="num">Outstanding</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.unpaidOrders.map((o) => (
              <tr key={o.saleOrderId}>
                <td>#{o.saleOrderId}</td>
                <td>{o.buyerName}</td>
                <td>{date(o.deliveryDate)}</td>
                <td className="num">{taka(o.totalAmount)}</td>
                <td className="num">
                  <strong>{taka(o.outstanding)}</strong>
                </td>
                <td>
                  <span className={`tag tag-${o.orderStatus.toLowerCase()}`}>{o.orderStatus}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Batches that never attracted a bid</h2>
      {data.unsoldBatches.length === 0 ? (
        <p className="muted">Every batch has had at least one bid.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Batch</th>
              <th>Crop</th>
              <th>Farmer</th>
              <th className="num">Quantity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.unsoldBatches.map((b) => (
              <tr key={b.batchId}>
                <td>#{b.batchId}</td>
                <td>{b.cropName}</td>
                <td>{b.farmerName}</td>
                <td className="num">{number(b.totalQuantity)} kg</td>
                <td>
                  <span className={`tag tag-${b.status.toLowerCase()}`}>
                    {b.status.replace(/_/g, ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Volume by crop</h2>
      <table>
        <thead>
          <tr>
            <th>Crop</th>
            <th className="num">Batches</th>
            <th className="num">Listed</th>
            <th className="num">Sold</th>
            <th className="num">Sell-through</th>
          </tr>
        </thead>
        <tbody>
          {data.byCrop.map((c) => {
            const pct = c.totalQuantity
              ? Math.round((c.soldQuantity / c.totalQuantity) * 1000) / 10
              : 0;
            return (
              <tr key={c.cropName}>
                <td>{c.cropName}</td>
                <td className="num">{number(c.batches)}</td>
                <td className="num">{number(c.totalQuantity)} kg</td>
                <td className="num">{number(c.soldQuantity)} kg</td>
                <td className="num">{pct}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="muted" style={{ marginTop: '1.5rem' }}>
        <Link to="/admin/prices">Log today's market prices →</Link>
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
