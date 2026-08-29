import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { date, number, taka } from '../../utils/format';

const REPORTS = {
  harvest: {
    label: 'Harvest',
    blurb: 'Every batch with its farm, crop, arat and bidding outcome.',
    filters: ['dateFrom', 'dateTo'],
  },
  storage: {
    label: 'Storage',
    blurb: 'Warehouse occupancy, the manager who authorised each allocation, and fee settlement.',
    filters: ['warehouseId'],
  },
  sales: {
    label: 'Sales',
    blurb: 'Completed orders, how far each cleared its reserve, and what is still outstanding.',
    filters: ['dateFrom', 'dateTo'],
  },
  payment: {
    label: 'Payment',
    blurb: 'Money received against each order, with the running balance.',
    filters: ['dateFrom', 'dateTo'],
  },
  'market-price': {
    label: 'Market price',
    blurb: 'Published arat prices per crop, with the movement over the window.',
    filters: ['cropId', 'days'],
  },
  activity: {
    label: 'User activity',
    blurb: 'What each account has actually done on the platform.',
    filters: ['userId', 'maxRows'],
  },
};

const FILTER_LABEL = {
  dateFrom: 'From',
  dateTo: 'To',
  warehouseId: 'Warehouse ID',
  cropId: 'Crop ID',
  days: 'Days',
  userId: 'User ID',
  maxRows: 'Max rows',
};

const MONEY = /AMOUNT|PRICE|VALUE|OUTSTANDING|PAID|FEE|REVENUE/;
const DATEY = /DATE|ON$/;

function cell(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    if (MONEY.test(key)) return taka(value);
    return number(value);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return date(value);
  if (DATEY.test(key) && typeof value === 'string') return date(value);
  return String(value);
}

function heading(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])([A-Z]+)/g, (_, a, b) => a + b.toLowerCase())
    .replace(/^./, (c) => c.toUpperCase());
}

export default function Reports() {
  const [name, setName] = useState('harvest');
  const [filters, setFilters] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const spec = REPORTS[name];
      const query = spec.filters
        .filter((f) => filters[f])
        .map((f) => `${f}=${encodeURIComponent(filters[f])}`)
        .join('&');
      setResult(await api(`/admin/reports/${name}${query ? `?${query}` : ''}`));
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }, [name, filters]);

  useEffect(() => {
    setFilters({});
    setResult(null);
  }, [name]);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const spec = REPORTS[name];
  const columns = result?.rows?.length ? Object.keys(result.rows[0]) : [];

  return (
    <div className="page">
      <h1>Reports</h1>
      <p className="muted">Pick a report, set any filters and run it.</p>

      <div className="filters">
        <label>
          Report
          <select value={name} onChange={(e) => setName(e.target.value)}>
            {Object.entries(REPORTS).map(([key, r]) => (
              <option key={key} value={key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        {spec.filters.map((f) => (
          <label key={f}>
            {FILTER_LABEL[f]}
            <input
              type={f.startsWith('date') ? 'date' : 'number'}
              value={filters[f] || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, [f]: e.target.value }))}
            />
          </label>
        ))}

        <button type="button" onClick={run} disabled={busy}>
          {busy ? 'Running…' : 'Run report'}
        </button>
      </div>

      <p className="muted">{spec.blurb}</p>

      {error && <p className="error">{error}</p>}

      {!result && !error ? (
        <p className="muted">Loading…</p>
      ) : result && result.rows.length === 0 ? (
        <p className="muted">No rows for those filters.</p>
      ) : (
        result && (
          <>
            <div className="stats">
              <Stat label="Rows" value={result.rowCount} />
              {result.truncated && <Stat label="Truncated" value="yes" tone="warn" />}
            </div>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c} className={typeof result.rows[0][c] === 'number' ? 'num' : ''}>
                        {heading(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>
                      {columns.map((c) => (
                        <td key={c} className={typeof row[c] === 'number' ? 'num' : ''}>
                          {cell(c, row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
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
