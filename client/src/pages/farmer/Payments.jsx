import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { date, taka } from '../../utils/format';

export default function Payments() {
  const [payments, setPayments] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/farmer/payments').then(setPayments).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!payments) return <p className="muted">Loading…</p>;

  const total = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return (
    <div className="page">
      <h1>Payment History</h1>
      <p className="muted">Paid straight to you by the buyer — no commission is taken.</p>

      <div className="stats">
        <Stat label="Payments" value={payments.length} />
        <Stat label="Total received" value={taka(total)} tone="good" />
      </div>

      {payments.length === 0 ? (
        <p className="muted">No payments yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Payment</th>
              <th>Order</th>
              <th>Crop</th>
              <th>Buyer</th>
              <th className="num">Amount</th>
              <th className="num">Order total</th>
              <th>Method</th>
              <th>Date</th>
              <th>Reference</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.paymentId}>
                <td>#{p.paymentId}</td>
                <td>#{p.saleOrderId}</td>
                <td>{p.cropName}</td>
                <td>{p.buyerName}</td>
                <td className="num">
                  <strong className="good">{taka(p.amount)}</strong>
                </td>
                <td className="num">{taka(p.orderTotal)}</td>
                <td>{p.paymentMethod.replace(/_/g, ' ')}</td>
                <td>{date(p.paymentDate)}</td>
                <td className="small">{p.transactionReference}</td>
                <td>
                  <span className={`tag tag-${p.paymentStatus.toLowerCase()}`}>
                    {p.paymentStatus}
                  </span>
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
