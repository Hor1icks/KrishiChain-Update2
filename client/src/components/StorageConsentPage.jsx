import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { date, number, taka } from '../utils/format';

/**
 * Storage consent, shared by the farmer (leg 1, pre-sale) and the buyer
 * (leg 2, post-sale). Both sides of the workflow are identical from the
 * customer's seat — accept or reject a manager's proposal, ask for the
 * batch back, answer someone else's release request, settle the fee — so
 * this is one component parameterised by role rather than two files that
 * would drift apart.
 *
 * `base` is the API prefix ('/farmer' or '/buyer'); the server resolves
 * the customer from the token, so nothing here needs an ID.
 */
export default function StorageConsentPage({ base, title, intro, legNote }) {
  const [proposals, setProposals] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [fees, setFees] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paying, setPaying] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', paymentMethod: 'BKASH' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, h, f] = await Promise.all([
        api(`${base}/storage/proposals`),
        api(`${base}/storage`),
        api(`${base}/storage/fees`),
      ]);
      setProposals(p);
      setHoldings(h);
      setFees(f);
    } catch (e) {
      setError(e.message);
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(path, body, message) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api(path, { method: 'POST', body });
      setNotice(message);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function pay(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api(`${base}/storage/${paying.allocationId}/pay`, {
        method: 'POST',
        body: { amount: Number(payForm.amount), paymentMethod: payForm.paymentMethod },
      });
      setNotice(
        res.fullyPaid
          ? `Allocation #${res.allocationId} is fully paid — ${taka(res.totalPaid)} of ${taka(res.owed)}.`
          : `${taka(res.amount)} paid. ${taka(res.owed - res.totalPaid)} still owing on allocation #${res.allocationId}.`
      );
      setPaying(null);
      setPayForm({ amount: '', paymentMethod: 'BKASH' });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && proposals === null) return <p className="error">{error}</p>;
  if (proposals === null) return <p className="muted">Loading…</p>;

  const owedFor = (allocationId) => {
    const fee = fees.find((f) => f.allocationId === allocationId);
    if (!fee) return null;
    return Number(fee.totalFee || 0) - Number(fee.paidSoFar || 0);
  };

  return (
    <div className="page">
      <h1>{title}</h1>
      <p className="muted">{intro}</p>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      <h2>Awaiting your decision</h2>
      {proposals.length === 0 ? (
        <p className="muted">No storage manager is waiting on you.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Allocation</th>
              <th>Batch</th>
              <th>Crop</th>
              <th>Warehouse</th>
              <th className="num">Unit</th>
              <th className="num">Quantity</th>
              <th className="num">Min days</th>
              <th className="num">Rate/kg</th>
              <th className="num">Fee</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {proposals.map((p) => (
              <tr key={p.allocationId}>
                <td>#{p.allocationId}</td>
                <td>#{p.batchId}</td>
                <td>{p.cropName}</td>
                <td>{p.warehouseName}</td>
                <td className="num">{p.unitNo}</td>
                <td className="num">{number(p.quantityStored)} kg</td>
                <td className="num">{p.minimumStorageDays}</td>
                <td className="num">{p.ratePerKg}</td>
                <td className="num">{taka(p.estimatedFee)}</td>
                <td>
                  <div className="actions" style={{ margin: 0 }}>
                    <button
                      type="button"
                      className="small"
                      disabled={busy}
                      onClick={() =>
                        act(
                          `${base}/storage/proposals/${p.allocationId}/respond`,
                          { decision: 'ACCEPT' },
                          `Allocation #${p.allocationId} accepted — the batch is now in storage and the clock has started.`
                        )
                      }
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="small ghost"
                      disabled={busy}
                      onClick={() =>
                        act(
                          `${base}/storage/proposals/${p.allocationId}/respond`,
                          { decision: 'REJECT' },
                          `Allocation #${p.allocationId} rejected. The unit's space is free again.`
                        )
                      }
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>In storage</h2>
      <p className="note" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
        {legNote}
      </p>
      {holdings.length === 0 ? (
        <p className="muted">Nothing of yours is in a warehouse.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Allocation</th>
              <th>Batch</th>
              <th>Crop</th>
              <th>Warehouse</th>
              <th className="num">Unit</th>
              <th className="num">Quantity</th>
              <th>In</th>
              <th>Free to release</th>
              <th className="num">Fee</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const owed = owedFor(h.allocationId);
              // Someone else asked to end this early and it is our turn.
              const awaitingUs =
                h.allocationStatus === 'PENDING_RELEASE' && h.releaseRequestedBy === 'MANAGER';
              return (
                <tr key={h.allocationId}>
                  <td>#{h.allocationId}</td>
                  <td>#{h.batchId}</td>
                  <td>{h.cropName}</td>
                  <td>{h.warehouseName}</td>
                  <td className="num">{h.unitNo}</td>
                  <td className="num">{number(h.quantityStored)} kg</td>
                  <td>{date(h.dateIn)}</td>
                  <td>{date(h.minimumReleaseDate)}</td>
                  <td className="num">
                    {taka(h.storageFee)}
                    {owed > 0 && <div className="muted small">{taka(owed)} owing</div>}
                  </td>
                  <td>
                    <span className={`tag tag-${h.allocationStatus.toLowerCase()}`}>
                      {h.allocationStatus.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>
                    <div className="actions" style={{ margin: 0 }}>
                      {h.allocationStatus === 'ACTIVE' && (
                        <button
                          type="button"
                          className="small ghost"
                          disabled={busy}
                          onClick={() =>
                            act(
                              `${base}/storage/${h.allocationId}/release`,
                              {},
                              `Release requested on allocation #${h.allocationId}.`
                            )
                          }
                        >
                          Request release
                        </button>
                      )}
                      {awaitingUs && (
                        <>
                          <button
                            type="button"
                            className="small"
                            disabled={busy}
                            onClick={() =>
                              act(
                                `${base}/storage/${h.allocationId}/release/respond`,
                                { decision: 'APPROVE' },
                                `Early release approved for allocation #${h.allocationId}.`
                              )
                            }
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="small ghost"
                            disabled={busy}
                            onClick={() =>
                              act(
                                `${base}/storage/${h.allocationId}/release/respond`,
                                { decision: 'REJECT' },
                                `Early release declined for allocation #${h.allocationId}.`
                              )
                            }
                          >
                            Decline
                          </button>
                        </>
                      )}
                      {owed > 0 && (
                        <button
                          type="button"
                          className="small"
                          onClick={() => {
                            setPaying(h);
                            setPayForm({ amount: String(owed), paymentMethod: 'BKASH' });
                          }}
                        >
                          Pay fee
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {paying && (
        <form onSubmit={pay} className="boxed confirm">
          <h3>Pay storage fee — allocation #{paying.allocationId}</h3>
          <p className="muted">
            {paying.cropName} · {number(paying.quantityStored)} kg at {paying.warehouseName}.
          </p>
          <div className="grid">
            <label>
              Amount
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                required
              />
            </label>
            <label>
              Method
              <select
                value={payForm.paymentMethod}
                onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}
              >
                <option value="BKASH">bKash</option>
                <option value="NAGAD">Nagad</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CASH">Cash</option>
              </select>
            </label>
          </div>
          <p className="note">
            Paying more than the fee is refused — the total owed is {taka(paying.storageFee)}.
          </p>
          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Paying…' : 'Pay'}
            </button>
            <button type="button" className="ghost" onClick={() => setPaying(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
