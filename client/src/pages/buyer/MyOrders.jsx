import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { date, number, taka } from '../../utils/format';

export default function MyOrders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paying, setPaying] = useState(null);
  const [form, setForm] = useState({ amount: '', paymentMethod: 'BKASH' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrders(await api('/buyer/orders'));
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function pay(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api(`/buyer/orders/${paying.saleOrderId}/pay`, {
        method: 'POST',
        body: { amount: Number(form.amount), paymentMethod: form.paymentMethod },
      });
      setNotice(
        res.outstanding > 0
          ? `${taka(res.amount)} sent to the farmer. ${taka(res.outstanding)} still outstanding on order #${res.saleOrderId}.`
          : `Order #${res.saleOrderId} settled in full — ${taka(res.totalPaid)} paid.` +
            (res.orderCompleted ? ' The order is now complete.' : '')
      );
      setPaying(null);
      setForm({ amount: '', paymentMethod: 'BKASH' });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

    async function chooseDirect(saleOrderId) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api(`/buyer/orders/${saleOrderId}/delivery-preference`, {
        method: 'POST',
        body: {},
      });
      setNotice(
        `Order #${res.saleOrderId} will be delivered straight to you at ${res.deliveryLocation}. ` +
          `Drivers can now pick up the trip.`
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !orders) return <p className="error">{error}</p>;
  if (!orders) return <p className="muted">Loading…</p>;

  const spend = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  const paid = orders.reduce((sum, o) => sum + Number(o.amountPaid || 0), 0);

  const canPay = (o) => {
    const outstanding = Number(o.totalAmount) - Number(o.amountPaid || 0);
    if (outstanding <= 0) return false;
    return o.paymentTerms === 'ADVANCE' || o.deliveryStatus === 'DELIVERED';
  };

  return (
    <div className="page">
      <h1>My Orders</h1>
      <p className="muted">Batches you have won, and what you still owe on them.</p>

      <div className="stats">
        <Stat label="Orders" value={number(orders.length)} />
        <Stat label="Total value" value={taka(spend)} />
        <Stat label="Paid" value={taka(paid)} />
        <Stat
          label="Outstanding"
          value={taka(spend - paid)}
          tone={spend - paid > 0 ? 'warn' : 'good'}
        />
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      {orders.length === 0 ? (
        <p className="muted">
          You have not won anything yet. <Link to="/buyer/browse">Browse open auctions</Link>.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Crop</th>
              <th>Farmer</th>
              <th className="num">Quantity</th>
              <th className="num">Total</th>
              <th className="num">Paid</th>
              <th>Terms</th>
              <th>Delivery</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const outstanding = Number(o.totalAmount) - Number(o.amountPaid || 0);
              return (
                <tr key={o.saleOrderId} className={o.status === 'COMPLETED' ? 'row-won' : undefined}>
                  <td>#{o.saleOrderId}</td>
                  <td>{o.cropName}</td>
                  <td>{o.farmerName}</td>
                  <td className="num">{number(o.acceptedQuantity)} kg</td>
                  <td className="num">{taka(o.totalAmount)}</td>
                  <td className="num">
                    {taka(o.amountPaid)}
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
                    {}
                    {o.deliveryPreference === 'PENDING' ? (
                      <div className="muted small">destination not set</div>
                    ) : o.deliveryPreference === 'VIA_STORAGE' ? (
                      <div className="muted small">via storage</div>
                    ) : null}
                  </td>
                  <td>
                    <span className={`tag tag-${o.status.toLowerCase()}`}>{o.status}</span>
                  </td>
                  <td>
                    <div className="actions" style={{ margin: 0 }}>
                      {o.deliveryPreference === 'PENDING' && (
                        <button
                          type="button"
                          className="small"
                          disabled={busy}
                          onClick={() => chooseDirect(o.saleOrderId)}
                        >
                          Deliver to me
                        </button>
                      )}
                      {canPay(o) ? (
                        <button
                          type="button"
                          className="small"
                          onClick={() => {
                            setPaying(o);
                            setForm({ amount: String(outstanding), paymentMethod: 'BKASH' });
                          }}
                        >
                          Pay
                        </button>
                      ) : outstanding > 0 ? (
                        <span className="muted small">Pay on delivery</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {paying && (
        <form onSubmit={pay} className="boxed confirm">
          <h3>Pay order #{paying.saleOrderId}</h3>
          <p className="muted">
            {paying.cropName} · {number(paying.acceptedQuantity)} kg from {paying.farmerName}.
            Money goes straight to the farmer.
          </p>
          <div className="grid">
            <label>
              Amount
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </label>
            <label>
              Method
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
              >
                <option value="BKASH">bKash</option>
                <option value="NAGAD">Nagad</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CASH">Cash</option>
              </select>
            </label>
          </div>
          <p className="note">
            A payment cannot take the total above the {taka(paying.totalAmount)} order value.
          </p>
          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send payment'}
            </button>
            <button type="button" className="ghost" onClick={() => setPaying(null)}>
              Cancel
            </button>
          </div>
        </form>
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
