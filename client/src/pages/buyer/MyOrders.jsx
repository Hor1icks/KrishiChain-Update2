import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { date, number, taka } from '../../utils/format';

export default function MyOrders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paying, setPaying] = useState(null);
  const [busy, setBusy] = useState(false);
  const [onlinePayment, setOnlinePayment] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrders(await api('/buyer/orders'));
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    api('/reference/features')
      .then((f) => setOnlinePayment(f.onlinePayment))
      .catch(() => setOnlinePayment(false));
  }, [load]);

  async function payOnline() {
    setError('');
    setBusy(true);
    try {
      const { redirectUrl } = await api(
        `/buyer/orders/${paying.saleOrderId}/pay/online`,
        { method: 'POST' }
      );
      window.location.href = redirectUrl;
    } catch (e) {
      setError(e.message);
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

      {orders.some((o) => Number(o.checkoutHeld) > 0) && (
        <p className="note">
          A payment you started is still open at the gateway, so its amount is held and
          shows as paid. Finish or cancel it there, or it is released automatically after
          30 minutes.
        </p>
      )}

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
                          onClick={() => setPaying(o)}
                        >
                          Pay
                        </button>
                      ) : Number(o.checkoutHeld) > 0 ? (
                        <span className="muted small" title="A checkout is open at the gateway">
                          Checkout open
                        </span>
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
        <div className="boxed confirm">
          <h3>Pay order #{paying.saleOrderId}</h3>
          <p className="muted">
            {paying.cropName} · {number(paying.acceptedQuantity)} kg from {paying.farmerName}.
          </p>

          <div className="stats">
            <div className="stat">
              <span className="stat-label">Order total</span>
              <span className="stat-value">{taka(paying.totalAmount)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Already paid</span>
              <span className="stat-value">{taka(paying.amountPaid)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Due now</span>
              <span className="stat-value">
                {taka(Number(paying.totalAmount) - Number(paying.amountPaid || 0))}
              </span>
            </div>
          </div>

          {onlinePayment ? (
            <>
              <p className="note">
                Card, mobile banking and internet banking are all handled on the next
                screen. You will come back here when it is done.
              </p>
              <button
                type="button"
                className="gateway-button"
                onClick={payOnline}
                disabled={busy}
              >
                <img src="/sslcommerz.png" alt="Pay with SSLCommerz" />
                <span>{busy ? 'Opening the gateway…' : 'Pay now'}</span>
              </button>
            </>
          ) : (
            <p className="error">
              Online payment is not configured, so this order cannot be paid yet.
            </p>
          )}

          <div className="actions">
            <button type="button" className="ghost" onClick={() => setPaying(null)}>
              Cancel
            </button>
          </div>
        </div>
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
