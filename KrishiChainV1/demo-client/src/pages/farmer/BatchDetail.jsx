import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client';
import { date, dateTime, number, taka } from '../../utils/format';

export default function BatchDetail() {
  const { batchId } = useParams();
  const [batch, setBatch] = useState(null);
  const [bids, setBids] = useState([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  // Which bid is mid-award, and on what terms. Payment terms are an
  // agreement between the two parties (see context.md), so the farmer
  // picks them at the moment of accepting rather than the system fixing
  // one policy for everyone.
  const [awarding, setAwarding] = useState(null);
  const [terms, setTerms] = useState('ON_DELIVERY');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, bd] = await Promise.all([
        api(`/farmer/batches/${batchId}`),
        api(`/farmer/batches/${batchId}/bids`),
      ]);
      setBatch(b);
      setBids(bd);
    } catch (e) {
      setError(e.message);
    }
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  async function award(bidId) {
    setError('');
    setBusy(true);
    try {
      const res = await api(`/farmer/bids/${bidId}/award`, {
        method: 'POST',
        body: { paymentTerms: terms },
      });
      setResult(res);
      setAwarding(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !batch) return <p className="error">{error}</p>;
  if (!batch) return <p className="muted">Loading…</p>;

  const sold = ['SOLD', 'DELIVERED'].includes(batch.status);

  return (
    <div className="page">
      <p className="muted">
        <Link to="/farmer/batches">← My Batches</Link>
      </p>

      <div className="row">
        <div>
          <h1>
            Batch #{batch.batchId} — {batch.cropName}
          </h1>
          <p className="muted">
            {batch.farmName} · {batch.aratName} · harvested {date(batch.harvestDate)}
          </p>
        </div>
        <div>
          <span className={`tag tag-${batch.status.toLowerCase()}`}>
            {batch.status.replace(/_/g, ' ')}
          </span>
          {/* A partial award intentionally leaves the batch open for its
              remainder (see context.md) — call that out so it does not
              read as a bug. */}
          {batch.soldQuantity > 0 && batch.status !== 'SOLD' && (
            <div className="muted small">
              Partially sold — {number(batch.availableQuantity)} kg still open
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="success">
          <strong>Sold.</strong> Sale order #{result.saleOrderId} created for{' '}
          {number(result.acceptedQuantity)} kg at {result.acceptedPricePerKg}/kg ={' '}
          {taka(result.totalAmount)}, terms {result.paymentTerms}. Transport request #
          {result.transportId} raised
          {result.bidsOutbid > 0 && `, ${result.bidsOutbid} rival bid(s) marked OUTBID`}.
        </div>
      )}

      <div className="stats">
        <Stat label="Total" value={`${number(batch.totalQuantity)} kg`} />
        <Stat label="Sold" value={`${number(batch.soldQuantity)} kg`} />
        {/* Virtual column — Oracle computes this, it is never stored. */}
        <Stat label="Available" value={`${number(batch.availableQuantity)} kg`} />
        <Stat label="Minimum price" value={`${batch.minimumPrice}/kg`} />
        <Stat label="Highest bid" value={batch.currentHighestBid ?? '—'} />
        <Stat label="Bids" value={number(batch.bidCount)} />
        <Stat label="Bidders" value={number(batch.bidderCount)} />
        <Stat label="Bidding" value={batch.biddingState} />
      </div>

      <p className="muted">
        Grade {batch.qualityGrade || '—'} · moisture{' '}
        {batch.moisturePercentage ?? '—'}% · crop base price {batch.cropBasePrice}/kg
        {batch.pctAboveMinimum != null && ` · highest bid is ${batch.pctAboveMinimum}% above your minimum`}
        {batch.biddingEndTime && ` · closes ${dateTime(batch.biddingEndTime)}`}
      </p>

      <h2>Bids</h2>
      {error && <p className="error">{error}</p>}

      {bids.length === 0 ? (
        <p className="muted">No bids yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Bid</th>
              <th>Buyer</th>
              <th>Type</th>
              <th className="num">Price/kg</th>
              <th className="num">Quantity</th>
              <th className="num">Value</th>
              <th>Placed</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {bids.map((b) => (
              <tr key={b.bidId} className={b.status === 'WON' ? 'row-won' : undefined}>
                <td>#{b.bidId}</td>
                <td>
                  {b.buyerName}
                  {b.businessName && <div className="muted small">{b.businessName}</div>}
                </td>
                <td>{b.buyerType || '—'}</td>
                <td className="num">
                  <strong>{b.bidPricePerKg}</strong>
                </td>
                <td className="num">{number(b.requestedQuantity)}</td>
                <td className="num">{taka(b.bidValue)}</td>
                <td>{dateTime(b.bidTime)}</td>
                <td>
                  <span className={`tag tag-${b.status.toLowerCase()}`}>{b.status}</span>
                </td>
                <td>
                  {b.status === 'ACTIVE' && !sold && (
                    <button type="button" className="small" onClick={() => setAwarding(b)}>
                      Accept
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Confirmation step. Awarding writes five rows across four tables
          in one transaction and cannot be undone from the UI, so it does
          not happen on a single stray click. */}
      {awarding && (
        <div className="boxed confirm">
          <h3>Accept bid #{awarding.bidId}?</h3>
          <p>
            {awarding.buyerName} pays <strong>{awarding.bidPricePerKg}/kg</strong> for{' '}
            <strong>{number(awarding.requestedQuantity)} kg</strong> ={' '}
            <strong>{taka(awarding.bidValue)}</strong>.
          </p>
          <p className="muted">
            This marks the bid WON, closes the batch, creates the sale order and raises a transport
            request — all at once, or not at all.
          </p>

          <label>
            Payment terms
            <select value={terms} onChange={(e) => setTerms(e.target.value)}>
              <option value="ON_DELIVERY">On delivery — buyer pays once delivered</option>
              <option value="ADVANCE">Advance — buyer may pay before delivery</option>
            </select>
          </label>
          <p className="note">
            On-delivery terms mean the database itself will block any payment until transport is
            marked DELIVERED (BR-20).
          </p>

          <div className="actions">
            <button type="button" disabled={busy} onClick={() => award(awarding.bidId)}>
              {busy ? 'Awarding…' : 'Confirm and sell'}
            </button>
            <button type="button" className="ghost" onClick={() => setAwarding(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
