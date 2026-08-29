import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { date, number, taka } from '../../utils/format';

/**
 * The transport module's single page: the job board, this driver's trips,
 * and the two actions that carry PRD §9.10 transactions #5 and #6.
 *
 * Claiming and delivering are kept on one screen deliberately — they are
 * the same trip at two points in its life, and splitting them across
 * pages would hide the fact that one row moves all the way through.
 */

/** What "advance" does next, so the button can say it rather than "Next". */
const NEXT_STEP = { ASSIGNED: 'Mark picked up', PICKED_UP: 'Mark in transit' };

export default function Assignments() {
  const [summary, setSummary] = useState(null);
  const [requests, setRequests] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [claiming, setClaiming] = useState(null);
  const [vehicleId, setVehicleId] = useState('');
  const [delivering, setDelivering] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r, v, t] = await Promise.all([
        api('/transport/summary'),
        api('/transport/requests'),
        api('/transport/vehicles'),
        api('/transport/assignments'),
      ]);
      setSummary(s);
      setRequests(r);
      setVehicles(v);
      setTrips(t);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function claim(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api('/transport/assignments', {
        method: 'POST',
        body: { transportId: claiming.transportId, vehicleId: Number(vehicleId) },
      });
      setNotice(
        `Trip #${res.transportId} is yours, on ${res.vehicleNo} — ` +
          `${number(res.quantity)} kg against ${number(res.capacity)} kg of capacity.`
      );
      setClaiming(null);
      setVehicleId('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function advance(transportId) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api(`/transport/assignments/${transportId}/advance`, { method: 'POST' });
      setNotice(`Trip #${transportId} is now ${res.deliveryStatus.replace(/_/g, ' ')}.`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deliver(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api(`/transport/assignments/${delivering.transportId}/deliver`, {
        method: 'POST',
        body: { paymentMethod },
      });
      setNotice(
        res.payment
          ? `Delivered. ${taka(res.payment.amount)} collected on delivery and recorded ` +
            `against order #${res.saleOrderId} (ref ${res.payment.reference}). Order is ${res.orderStatus}.`
          : `Delivered. Order #${res.saleOrderId} was paid in advance, so no money changed ` +
            `hands here. Order is ${res.orderStatus}.`
      );
      setDelivering(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !summary) return <p className="error">{error}</p>;
  if (!summary) return <p className="muted">Loading…</p>;

  const outstanding = delivering
    ? Number(delivering.totalAmount) - Number(delivering.paidSoFar || 0)
    : 0;
  const collectsCash = delivering?.paymentTerms === 'ON_DELIVERY' && outstanding > 0;

  return (
    <div className="page">
      <h1>My Assignments</h1>
      <p className="muted">Claim an open trip, then move it from pickup to delivery.</p>

      <div className="stats">
        <Stat label="Open requests" value={number(summary.openRequests)} tone={summary.openRequests ? 'good' : undefined} />
        <Stat label="Active trips" value={number(summary.activeTrips)} />
        <Stat label="Completed" value={number(summary.completedTrips)} />
        <Stat label="Vehicles free" value={number(summary.vehiclesAvailable)} />
        <Stat label="Delivered" value={`${number(summary.kgDelivered)} kg`} />
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      <h2>Open requests</h2>
      {requests.length === 0 ? (
        <p className="muted">
          Nothing waiting. Every awarded order already has a driver.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Trip</th>
              <th>Order</th>
              <th>Crop</th>
              <th className="num">Quantity</th>
              <th>From</th>
              <th>To</th>
              <th className="num">Value</th>
              <th>Terms</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.transportId}>
                <td>#{r.transportId}</td>
                <td>#{r.saleOrderId}</td>
                <td>{r.cropName}</td>
                <td className="num">{number(r.quantity)} kg</td>
                <td className="small">{r.pickupLocation || '—'}</td>
                <td className="small">{r.deliveryLocation || '—'}</td>
                <td className="num">{taka(r.totalAmount)}</td>
                <td>
                  <span className="tag">{r.paymentTerms.replace(/_/g, ' ')}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className="small"
                    onClick={() => {
                      setClaiming(r);
                      setDelivering(null);
                    }}
                  >
                    Claim
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Transaction #5 — one act decides all three legs of the ternary. */}
      {claiming && (
        <form onSubmit={claim} className="boxed confirm">
          <h3>Claim trip #{claiming.transportId}</h3>
          <p className="muted">
            {claiming.cropName} · {number(claiming.quantity)} kg · {claiming.farmerName} →{' '}
            {claiming.buyerName}
          </p>

          <label>
            Vehicle
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
              <option value="">Select a vehicle…</option>
              {vehicles.map((v) => (
                <option key={v.vehicleId} value={v.vehicleId}>
                  {v.vehicleNo} — {v.vehicleType || 'vehicle'}, {number(v.capacity)} kg
                </option>
              ))}
            </select>
          </label>

          <p className="note">
            BR-18: the vehicle has to be able to carry {number(claiming.quantity)} kg. Claiming
            records the assignment, marks the vehicle assigned and moves the trip on — all at
            once, or not at all.
          </p>

          <div className="actions">
            <button type="submit" disabled={busy || !vehicleId}>
              {busy ? 'Claiming…' : 'Claim trip'}
            </button>
            <button type="button" className="ghost" onClick={() => setClaiming(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <h2>My trips</h2>
      {trips.length === 0 ? (
        <p className="muted">You have not taken a trip yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Trip</th>
              <th>Order</th>
              <th>Crop</th>
              <th className="num">Quantity</th>
              <th>Vehicle</th>
              <th>Route</th>
              <th className="num">Value</th>
              <th>Terms</th>
              <th>Status</th>
              <th>Delivered</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trips.map((t) => (
              <tr
                key={t.assignmentId}
                className={t.deliveryStatus === 'DELIVERED' ? 'row-won' : undefined}
              >
                <td>#{t.transportId}</td>
                <td>#{t.saleOrderId}</td>
                <td>{t.cropName}</td>
                <td className="num">{number(t.quantity)} kg</td>
                <td className="small">{t.vehicleNo}</td>
                <td className="small">
                  {t.farmerName} → {t.buyerName}
                </td>
                <td className="num">{taka(t.totalAmount)}</td>
                <td>
                  <span className="tag">{t.paymentTerms.replace(/_/g, ' ')}</span>
                </td>
                <td>
                  <span className={`tag tag-${t.deliveryStatus.toLowerCase()}`}>
                    {t.deliveryStatus.replace(/_/g, ' ')}
                  </span>
                </td>
                <td>{date(t.deliveryDate)}</td>
                <td>
                  {NEXT_STEP[t.deliveryStatus] && (
                    <button
                      type="button"
                      className="small ghost"
                      disabled={busy}
                      onClick={() => advance(t.transportId)}
                    >
                      {NEXT_STEP[t.deliveryStatus]}
                    </button>
                  )}
                  {t.deliveryStatus === 'IN_TRANSIT' && (
                    <button
                      type="button"
                      className="small"
                      onClick={() => {
                        setDelivering(t);
                        setClaiming(null);
                      }}
                    >
                      Deliver
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Transaction #6 — the last of the six. */}
      {delivering && (
        <form onSubmit={deliver} className="boxed confirm">
          <h3>Deliver trip #{delivering.transportId}?</h3>
          <p>
            {delivering.cropName} · <strong>{number(delivering.quantity)} kg</strong> to{' '}
            <strong>{delivering.buyerName}</strong>.
          </p>

          {collectsCash ? (
            <>
              <p className="muted">
                Terms are on delivery, so you collect <strong>{taka(outstanding)}</strong> at the
                door. It is recorded as a payment from the buyer straight to the farmer — you only
                witness it.
              </p>
              <label>
                Payment method
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="CASH">Cash</option>
                  <option value="BKASH">bKash</option>
                  <option value="NAGAD">Nagad</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                </select>
              </label>
            </>
          ) : (
            <p className="muted">
              This order was paid in advance, so nothing is collected here. Marking it delivered
              closes the trip and completes the order.
            </p>
          )}

          <p className="note">
            Marks the trip delivered, completes the sale order
            {collectsCash && ', records the payment'} and hands the vehicle back — all at once, or
            not at all. The database blocks any payment before delivery (BR-20).
          </p>

          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Recording…' : collectsCash ? 'Deliver and collect' : 'Mark delivered'}
            </button>
            <button type="button" className="ghost" onClick={() => setDelivering(null)}>
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
