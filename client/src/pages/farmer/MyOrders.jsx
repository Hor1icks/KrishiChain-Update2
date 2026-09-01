import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { date, number, taka } from '../../utils/format';

export default function MyOrders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/farmer/orders').then(setOrders).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!orders) return <p className="muted">Loading…</p>;

  const revenue = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  const received = orders.reduce((sum, o) => sum + Number(o.amountReceived || 0), 0);

  return (
    <div className="page">
      <h1>My Orders</h1>
      <p className="muted">Every sale awarded from one of your batches.</p>

      <div className="stats">
        <Stat label="Orders" value={number(orders.length)} />
        <Stat label="Gross value" value={taka(revenue)} />
        <Stat label="Received" value={taka(received)} tone={received >= revenue ? 'good' : undefined} />
        <Stat
          label="Outstanding"
          value={taka(revenue - received)}
          tone={revenue - received > 0 ? 'warn' : undefined}
        />
      </div>

      {orders.length === 0 ? (
        <p className="muted">
          Nothing sold yet. <Link to="/farmer/batches">Check your open auctions</Link>.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Batch</th>
              <th>Crop</th>
              <th>Buyer</th>
              <th className="num">Quantity</th>
              <th className="num">Price/kg</th>
              <th className="num">Total</th>
              <th className="num">Received</th>
              <th>Terms</th>
              <th>Delivery</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const outstanding = Number(o.totalAmount) - Number(o.amountReceived || 0);
              return (
                <tr key={o.saleOrderId} className={o.status === 'COMPLETED' ? 'row-won' : undefined}>
                  <td>#{o.saleOrderId}</td>
                  <td>
                    <Link to={`/farmer/batches/${o.batchId}`}>#{o.batchId}</Link>
                  </td>
                  <td>{o.cropName}</td>
                  <td>{o.buyerName}</td>
                  <td className="num">{number(o.acceptedQuantity)} kg</td>
                  <td className="num">{o.acceptedPricePerKg}</td>
                  <td className="num">{taka(o.totalAmount)}</td>
                  <td className="num">
                    {taka(o.amountReceived)}
                    {outstanding > 0 && (
                      <div className="muted small">{taka(outstanding)} owing</div>
                    )}
                  </td>
                  <td>
                    <span className="tag">{o.paymentTerms.replace(/_/g, ' ')}</span>
                  </td>
                  <td>
                    {o.deliveryStatus ? (
                      <>
                        <span className={`tag tag-${o.deliveryStatus.toLowerCase()}`}>
                          {o.deliveryStatus.replace(/_/g, ' ')}
                        </span>
                        {o.deliveryDate && (
                          <div className="muted small">{date(o.deliveryDate)}</div>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span className={`tag tag-${o.status.toLowerCase()}`}>{o.status}</span>
                  </td>
                </tr>
              );
            })}
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
