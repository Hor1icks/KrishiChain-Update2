import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { date, taka } from '../../utils/format';

/**
 * Complaint triage. The only thing an admin changes is the status, and
 * doing so stamps them as the handler — HandledByAdminID is written
 * nowhere else, so without this page "who dealt with it?" has no answer.
 *
 * Closing a complaint (RESOLVED or REJECTED) sets ResolutionDate; moving
 * it back to OPEN or IN_REVIEW clears it, so a reopened complaint never
 * keeps a stale resolution date.
 */
const FLOW = {
  OPEN: ['IN_REVIEW', 'RESOLVED', 'REJECTED'],
  IN_REVIEW: ['RESOLVED', 'REJECTED', 'OPEN'],
  RESOLVED: ['OPEN'],
  REJECTED: ['OPEN'],
};

const LABEL = {
  OPEN: 'Reopen',
  IN_REVIEW: 'Start review',
  RESOLVED: 'Resolve',
  REJECTED: 'Reject',
};

export default function Complaints() {
  const [complaints, setComplaints] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const suffix = status ? `?status=${status}` : '';
      setComplaints(await api(`/admin/complaints${suffix}`));
    } catch (e) {
      setError(e.message);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function move(complaintId, next) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api(`/admin/complaints/${complaintId}`, {
        method: 'PATCH',
        body: { status: next },
      });
      setNotice(`Complaint #${complaintId} is now ${next.replace(/_/g, ' ').toLowerCase()}.`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !complaints) return <p className="error">{error}</p>;

  const open = (complaints || []).filter((c) => c.status === 'OPEN' || c.status === 'IN_REVIEW');

  return (
    <div className="page">
      <h1>Complaints</h1>
      <p className="muted">Buyer and farmer disputes raised against a sale order.</p>

      {complaints && (
        <div className="stats">
          <Stat label="Total" value={complaints.length} />
          <Stat label="Needs attention" value={open.length} tone={open.length ? 'warn' : 'good'} />
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      <div className="filters">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="OPEN">Open</option>
            <option value="IN_REVIEW">In review</option>
            <option value="RESOLVED">Resolved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>
      </div>

      {!complaints ? (
        <p className="muted">Loading…</p>
      ) : complaints.length === 0 ? (
        <p className="muted">Nothing here.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Complaint</th>
              <th>Order</th>
              <th>Type</th>
              <th>Description</th>
              <th>Buyer</th>
              <th>Farmer</th>
              <th className="num">Order value</th>
              <th>Status</th>
              <th>Handled by</th>
              <th>Resolved</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {complaints.map((c) => (
              <tr key={c.complaintId}>
                <td>#{c.complaintId}</td>
                <td>#{c.saleOrderId}</td>
                <td>{c.complaintType || '—'}</td>
                <td className="small">{c.description || '—'}</td>
                <td>{c.buyerName}</td>
                <td>{c.farmerName}</td>
                <td className="num">{taka(c.orderAmount)}</td>
                <td>
                  <span className={`tag tag-${c.status.toLowerCase()}`}>
                    {c.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="small">{c.handledBy || '—'}</td>
                <td>{date(c.resolutionDate)}</td>
                <td>
                  <div className="actions" style={{ margin: 0 }}>
                    {(FLOW[c.status] || []).map((next) => (
                      <button
                        key={next}
                        type="button"
                        className={next === 'RESOLVED' ? 'small' : 'small ghost'}
                        disabled={busy}
                        onClick={() => move(c.complaintId, next)}
                      >
                        {LABEL[next]}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
