import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client';
import { date, dateTime, number, taka } from '../../utils/format';

export default function BuyerBatchDetail() {
  const { batchId } = useParams();
  const [batch, setBatch] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [form, setForm] = useState({ bidPricePerKg: '', requestedQuantity: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setBatch(await api(`/buyer/batches/${batchId}`));
    } catch (e) {
      setError(e.message);
    }
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value });

  async function submit(event) {
    event.preventDefault();
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const res = await api('/buyer/bids', {
        method: 'POST',
        body: {
          batchId: Number(batchId),
          bidPricePerKg: Number(form.bidPricePerKg),
          requestedQuantity: Number(form.requestedQuantity),
        },
      });
      setResult(res);
      setForm({ bidPricePerKg: '', requestedQuantity: '' });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !batch) return <p className="error">{error}</p>;
  if (!batch) return <p className="muted">Loading…</p>;

  const open = batch.biddingState === 'OPEN NOW';

  // BR-11 preview: the floor this bid has to clear is whichever is
  // higher — the farmer's minimum, or one step above the standing bid.
  // The server re-checks both; this just explains the rule up front.
  const floor = batch.currentHighestBid
    ? Math.max(Number(batch.minimumPrice), Number(batch.currentHighestBid))
    : Number(batch.minimumPrice);
  const price = Number(form.bidPricePerKg);
  const priceTooLow =
    form.bidPricePerKg !== '' &&
    (batch.currentHighestBid ? price <= floor : price < floor);
  const qtyTooHigh =
    form.requestedQuantity !== '' && Number(form.requestedQuantity) > batch.availableQuantity;

  return (
    <div className="page">
      <p className="muted">
        <Link to="/buyer/browse">← Browse Listings</Link>
      </p>

      <div className="row">
        <div>
          <h1>
            Batch #{batch.batchId} — {batch.cropName}
          </h1>
          <p className="muted">
            {batch.farmerName} · {batch.farmName}, {batch.farmDistrict} · via {batch.aratName} ·
            harvested {date(batch.harvestDate)}
          </p>
        </div>
        <span className={`tag tag-${batch.status.toLowerCase()}`}>{batch.biddingState}</span>
      </div>

      {result && (
        <div className="success">
          <strong>Bid placed.</strong> #{result.bidId} at {result.bidPricePerKg}/kg for{' '}
          {number(result.requestedQuantity)} kg = {taka(result.bidValue)}.{' '}
          {result.outbid
            ? `You outbid the standing bid of ${result.outbid.price}/kg.`
            : 'Yours is the first bid on this batch.'}
        </div>
      )}

      <div className="stats">
        <Stat label="Available" value={`${number(batch.availableQuantity)} kg`} />
        <Stat label="Minimum" value={`${batch.minimumPrice}/kg`} />
        <Stat label="Standing bid" value={batch.currentHighestBid ?? '—'} />
        <Stat label="Bids" value={number(batch.bidCount)} />
        <Stat label="Bidders" value={number(batch.bidderCount)} />
        <Stat label="Hours left" value={batch.hoursRemaining ?? '—'} />
        <Stat label="Grade" value={batch.qualityGrade || '—'} />
        <Stat label="Crop base" value={`${batch.basePrice}/kg`} />
      </div>

      <p className="muted">
        Moisture {batch.moisturePercentage ?? '—'}% · total {number(batch.totalQuantity)} kg
        {batch.biddingEndTime && ` · closes ${dateTime(batch.biddingEndTime)}`}
      </p>

      <h2>Place a bid</h2>
      {!open ? (
        <p className="muted">Bidding is not open on this batch.</p>
      ) : (
        <form onSubmit={submit} className="boxed">
          {batch.myActiveBidId && (
            <p className="note">
              You already hold the standing bid (#{batch.myActiveBidId}). Bidding again raises your
              own offer — your previous bid becomes OUTBID, so you never hold two at once.
            </p>
          )}
          <div className="grid">
            <label>
              Price per kg *
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.bidPricePerKg}
                onChange={set('bidPricePerKg')}
                required
              />
            </label>
            <label>
              Quantity (kg) *
              <input
                type="number"
                step="0.001"
                min="0.001"
                max={batch.availableQuantity}
                value={form.requestedQuantity}
                onChange={set('requestedQuantity')}
                required
              />
            </label>
          </div>

          <p className="note">
            {batch.currentHighestBid
              ? `Must be strictly above the standing bid of ${batch.currentHighestBid}/kg (BR-11).`
              : `Must be at least the minimum of ${batch.minimumPrice}/kg (BR-11).`}
          </p>

          {priceTooLow && (
            <p className="error">
              {batch.currentHighestBid
                ? `Your bid must be more than ${batch.currentHighestBid}/kg.`
                : `Your bid must be at least ${batch.minimumPrice}/kg.`}
            </p>
          )}
          {qtyTooHigh && (
            <p className="error">Only {number(batch.availableQuantity)} kg are available.</p>
          )}
          {form.bidPricePerKg && form.requestedQuantity && !priceTooLow && !qtyTooHigh && (
            <p className="muted">
              Total commitment: <strong>{taka(price * Number(form.requestedQuantity))}</strong>
            </p>
          )}
          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={busy || priceTooLow || qtyTooHigh}>
            {busy ? 'Placing…' : 'Place bid'}
          </button>
        </form>
      )}

      <h2>Bid history</h2>
      {batch.bidHistory.length === 0 ? (
        <p className="muted">No bids yet — yours would be the first.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Bid</th>
              <th>Bidder</th>
              <th className="num">Price/kg</th>
              <th className="num">Quantity</th>
              <th>Placed</th>
              <th>Status</th>
              <th>Outbid</th>
            </tr>
          </thead>
          <tbody>
            {batch.bidHistory.map((b) => (
              <tr key={b.bidId} className={b.isMine ? 'row-won' : undefined}>
                <td>#{b.bidId}</td>
                <td>
                  {b.buyerName}
                  {b.isMine === 1 && <strong className="good"> (you)</strong>}
                </td>
                <td className="num">
                  <strong>{b.bidPricePerKg}</strong>
                </td>
                <td className="num">{number(b.requestedQuantity)}</td>
                <td>{dateTime(b.bidTime)}</td>
                <td>
                  <span className={`tag tag-${b.status.toLowerCase()}`}>{b.status}</span>
                </td>
                {/* PreviousBidID — the recursive relationship, shown as
                    the chain it actually is. */}
                <td className="muted">{b.previousBidId ? `#${b.previousBidId}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
