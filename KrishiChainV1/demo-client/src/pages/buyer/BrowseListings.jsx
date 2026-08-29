import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { date, number } from '../../utils/format';

export default function BrowseListings() {
  const [batches, setBatches] = useState(null);
  const [crops, setCrops] = useState([]);
  const [arats, setArats] = useState([]);
  const [filters, setFilters] = useState({ cropId: '', aratId: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api('/reference/crops'), api('/reference/arats')])
      .then(([c, a]) => {
        setCrops(c);
        setArats(a);
      })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(() => {
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v)
    ).toString();
    api(`/buyer/batches${qs ? `?${qs}` : ''}`)
      .then(setBatches)
      .catch((e) => setError(e.message));
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (name) => (e) => setFilters({ ...filters, [name]: e.target.value });

  return (
    <div className="page">
      <h1>Browse Listings</h1>
      <p className="muted">
        Batches with bidding open right now. Closed and unsold batches are not shown — you could
        not act on them.
      </p>

      <div className="filters">
        <label>
          Crop
          <select value={filters.cropId} onChange={set('cropId')}>
            <option value="">All crops</option>
            {crops.map((c) => (
              <option key={c.cropId} value={c.cropId}>
                {c.cropName}
              </option>
            ))}
          </select>
        </label>
        <label>
          ARAT
          <select value={filters.aratId} onChange={set('aratId')}>
            <option value="">All ARATs</option>
            {arats.map((a) => (
              <option key={a.aratId} value={a.aratId}>
                {a.aratName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      {!batches ? (
        <p className="muted">Loading…</p>
      ) : batches.length === 0 ? (
        <p className="muted">No auctions are open at the moment.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Batch</th>
              <th>Crop</th>
              <th>Farmer</th>
              <th>ARAT</th>
              <th>Harvested</th>
              <th>Grade</th>
              <th className="num">Available</th>
              <th className="num">Minimum</th>
              <th className="num">Standing bid</th>
              <th className="num">Bids</th>
              <th className="num">Hours left</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.batchId}>
                <td>#{b.batchId}</td>
                <td>
                  {b.cropName}
                  {/* Standing-bid holder gets a badge — the single most
                      useful thing for a bidder scanning the list. */}
                  {b.myBidStatus === 'ACTIVE' && (
                    <div>
                      <span className="tag tag-active">You lead</span>
                    </div>
                  )}
                  {/* A partial award intentionally leaves the remainder
                      open (see context.md) rather than closing the whole
                      batch — call that out so it does not read as a bug. */}
                  {b.soldQuantity > 0 && (
                    <div className="muted small">Partially sold</div>
                  )}
                </td>
                <td>{b.farmerName}</td>
                <td>{b.aratName}</td>
                <td>{date(b.harvestDate)}</td>
                <td>{b.qualityGrade || '—'}</td>
                <td className="num">{number(b.availableQuantity)} kg</td>
                <td className="num">{b.minimumPrice}</td>
                <td className="num">
                  {b.currentHighestBid ? <strong>{b.currentHighestBid}</strong> : '—'}
                </td>
                <td className="num">{b.bidCount}</td>
                <td className="num">{b.hoursRemaining ?? '—'}</td>
                <td>
                  <Link to={`/buyer/batches/${b.batchId}`}>
                    <button type="button" className="small">
                      Bid
                    </button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
