import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { date, taka } from '../../utils/format';

/**
 * One review per order — UQ_REVIEW_ORDER enforces that in the database,
 * so an order already reviewed simply drops out of the "waiting" list
 * rather than being offered and then refused.
 */
export default function Reviews() {
  const [reviews, setReviews] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [writing, setWriting] = useState(null);
  const [form, setForm] = useState({ rating: '5', reviewComment: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, o] = await Promise.all([api('/buyer/reviews'), api('/buyer/orders')]);
      setReviews(r);
      setOrders(o);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api('/buyer/reviews', {
        method: 'POST',
        body: {
          saleOrderId: writing.saleOrderId,
          rating: Number(form.rating),
          reviewComment: form.reviewComment || null,
        },
      });
      setNotice(`Thanks — your review of order #${writing.saleOrderId} is saved.`);
      setWriting(null);
      setForm({ rating: '5', reviewComment: '' });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !reviews) return <p className="error">{error}</p>;
  if (!reviews) return <p className="muted">Loading…</p>;

  // Only delivered orders are worth reviewing, and only once.
  const awaiting = orders.filter((o) => !o.reviewId && o.deliveryStatus === 'DELIVERED');

  return (
    <div className="page">
      <h1>Reviews</h1>
      <p className="muted">Rate a farmer once their delivery has arrived.</p>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      <h2>Waiting for your review</h2>
      {awaiting.length === 0 ? (
        <p className="muted">
          Nothing to review. Reviews open once an order has been delivered.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Crop</th>
              <th>Farmer</th>
              <th className="num">Total</th>
              <th>Delivered</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {awaiting.map((o) => (
              <tr key={o.saleOrderId}>
                <td>#{o.saleOrderId}</td>
                <td>{o.cropName}</td>
                <td>{o.farmerName}</td>
                <td className="num">{taka(o.totalAmount)}</td>
                <td>{date(o.deliveryDate)}</td>
                <td>
                  <button type="button" className="small" onClick={() => setWriting(o)}>
                    Write a review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {writing && (
        <form onSubmit={submit} className="boxed confirm">
          <h3>Review order #{writing.saleOrderId}</h3>
          <p className="muted">
            {writing.cropName} from {writing.farmerName}.
          </p>
          <label style={{ maxWidth: '14rem' }}>
            Rating
            <select
              value={form.rating}
              onChange={(e) => setForm({ ...form, rating: e.target.value })}
            >
              <option value="5">5 — excellent</option>
              <option value="4">4 — good</option>
              <option value="3">3 — acceptable</option>
              <option value="2">2 — poor</option>
              <option value="1">1 — unacceptable</option>
            </select>
          </label>
          <label>
            Comment
            <input
              value={form.reviewComment}
              onChange={(e) => setForm({ ...form, reviewComment: e.target.value })}
              placeholder="How were the quality and the handover?"
            />
          </label>
          <p className="note">One review per order, and it cannot be edited afterwards.</p>
          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Post review'}
            </button>
            <button type="button" className="ghost" onClick={() => setWriting(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <h2>Reviews you have written</h2>
      {reviews.length === 0 ? (
        <p className="muted">
          None yet. <Link to="/buyer/orders">Your orders</Link> are the starting point.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Review</th>
              <th>Order</th>
              <th>Crop</th>
              <th>Farmer</th>
              <th className="num">Rating</th>
              <th>Comment</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <tr key={r.reviewId}>
                <td>#{r.reviewId}</td>
                <td>#{r.saleOrderId}</td>
                <td>{r.cropName}</td>
                <td>{r.farmerName}</td>
                <td className="num">
                  <strong className={r.rating >= 4 ? 'good' : undefined}>{r.rating}/5</strong>
                </td>
                <td>{r.reviewComment || <span className="muted">—</span>}</td>
                <td>{date(r.reviewDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
