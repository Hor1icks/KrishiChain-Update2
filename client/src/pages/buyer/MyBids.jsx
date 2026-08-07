import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { dateTime, number, taka } from '../../utils/format';

export default function MyBids() {
  const [bids, setBids] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/buyer/bids').then(setBids).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!bids) return <p className="muted">Loading…</p>;

  return (
    <div className="page">
      <div className="row">
        <h1>My Bids</h1>
        <Link to="/buyer/browse">
          <button type="button">Browse listings</button>
        </Link>
      </div>

      {bids.length === 0 ? (
        <p className="muted">
          You have not bid on anything yet. <Link to="/buyer/browse">Find a batch</Link>.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Bid</th>
              <th>Batch</th>
              <th>Crop</th>
              <th>Farmer</th>
              <th className="num">Your bid</th>
              <th className="num">Quantity</th>
              <th className="num">Value</th>
              <th className="num">Standing</th>
              <th>Placed</th>
              <th>Status</th>
              <th>Order</th>
            </tr>
          </thead>
          <tbody>
            {bids.map((b) => (
              <tr key={b.bidId}>
                <td>#{b.bidId}</td>
                <td>
                  <Link to={`/buyer/batches/${b.batchId}`}>#{b.batchId}</Link>
                </td>
                <td>{b.cropName}</td>
                <td>{b.farmerName}</td>
                <td className="num">
                  <strong className={b.status === 'ACTIVE' ? 'good' : undefined}>
                    {b.bidPricePerKg}
                  </strong>
                </td>
                <td className="num">{number(b.requestedQuantity)}</td>
                <td className="num">{taka(b.bidValue)}</td>
                {/* Shows an OUTBID buyer exactly what they need to beat. */}
                <td className="num">{b.standingBid ?? '—'}</td>
                <td>{dateTime(b.bidTime)}</td>
                <td>
                  <span className={`tag tag-${b.status.toLowerCase()}`}>{b.status}</span>
                </td>
                <td>
                  {b.saleOrderId ? (
                    <>
                      #{b.saleOrderId} · {taka(b.orderTotal)}
                      <div className="muted small">
                        {b.paymentTerms} · {b.deliveryStatus}
                      </div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
