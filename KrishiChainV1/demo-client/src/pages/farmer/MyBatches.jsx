import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { date, number } from '../../utils/format';

export default function MyBatches() {
  const [batches, setBatches] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/farmer/batches').then(setBatches).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!batches) return <p className="muted">Loading…</p>;

  return (
    <div className="page">
      <div className="row">
        <h1>My Batches</h1>
        <Link to="/farmer/batches/new">
          <button type="button">List a new batch</button>
        </Link>
      </div>

      {batches.length === 0 ? (
        <p className="muted">Nothing listed yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Crop</th>
              <th>Farm</th>
              <th>ARAT</th>
              <th>Harvested</th>
              <th className="num">Total kg</th>
              <th className="num">Available</th>
              <th className="num">Minimum</th>
              <th className="num">Highest bid</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.batchId}>
                <td>{b.batchId}</td>
                <td>{b.cropName}</td>
                <td>{b.farmName}</td>
                <td>{b.aratName}</td>
                <td>{date(b.harvestDate)}</td>
                <td className="num">{number(b.totalQuantity)}</td>
                <td className="num">{number(b.availableQuantity)}</td>
                <td className="num">{b.minimumPrice}</td>
                <td className="num">
                  {/* Highest bid above the floor is the farmer's headline
                      number, so it is called out rather than plain text. */}
                  {b.currentHighestBid ? (
                    <strong className={b.currentHighestBid >= b.minimumPrice ? 'good' : ''}>
                      {b.currentHighestBid}
                    </strong>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <span className={`tag tag-${b.status.toLowerCase()}`}>
                    {b.status.replace(/_/g, ' ')}
                  </span>
                  {/* A partial award intentionally leaves the batch open
                      for its remainder (see context.md) rather than
                      closing the whole thing — call that out so it does
                      not read as a bug. */}
                  {b.soldQuantity > 0 && b.status !== 'SOLD' && (
                    <div className="muted small">
                      Partially sold — {number(b.availableQuantity)} kg still open
                    </div>
                  )}
                </td>
                <td>
                  <Link to={`/farmer/batches/${b.batchId}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
