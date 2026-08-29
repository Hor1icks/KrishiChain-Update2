import { useCallback, useEffect, useMemo, useState } from 'react';
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

  // A counter-offer being composed against a manager's proposal.
  const [countering, setCountering] = useState(null);
  const [counterRate, setCounterRate] = useState('');

  // Asking a warehouse for space, rather than waiting to be offered it.
  // The thing being stored differs by leg — a farmer offers up an unsold
  // batch, a buyer an order they have won — so the source list does too.
  const isFarmer = base === '/farmer';
  const storableEndpoint = isFarmer ? '/farmer/batches' : '/buyer/orders';

  const [warehouses, setWarehouses] = useState([]);
  const [storable, setStorable] = useState([]);
  const [units, setUnits] = useState([]);
  const [asking, setAsking] = useState(false);
  const [askForm, setAskForm] = useState({
    targetKey: '',
    unitKey: '',
    quantityStored: '',
    minimumStorageDays: '30',
  });

  const load = useCallback(async () => {
    try {
      const [p, h, f, w, t] = await Promise.all([
        api(`${base}/storage/proposals`),
        api(`${base}/storage`),
        api(`${base}/storage/fees`),
        api('/reference/warehouses'),
        api(storableEndpoint),
      ]);
      setProposals(p);
      setHoldings(h);
      setFees(f);
      setWarehouses(w);
      setStorable(t);
    } catch (e) {
      setError(e.message);
    }
  }, [base, storableEndpoint]);

  useEffect(() => {
    load();
  }, [load]);

  const storableOptions = useMemo(() => {
    if (isFarmer) {
      return storable
        .filter(
          (b) =>
            Number(b.availableQuantity) > 0 &&
            !['SOLD', 'DELIVERED', 'EXPIRED'].includes(b.status)
        )
        .map((b) => ({
          key: `batch-${b.batchId}`,
          label: `Batch #${b.batchId} · ${b.cropName} — ${number(b.availableQuantity)} kg unsold`,
          maxQuantity: Number(b.availableQuantity),
          body: { batchId: b.batchId },
        }));
    }
    return storable.map((o) => ({
      key: `order-${o.saleOrderId}`,
      label: `Order #${o.saleOrderId} · ${o.cropName} — ${number(o.acceptedQuantity)} kg`,
      maxQuantity: Number(o.acceptedQuantity),
      body: { saleOrderId: o.saleOrderId },
    }));
  }, [storable, isFarmer]);

  const askTarget = storableOptions.find((o) => o.key === askForm.targetKey);

  async function openAsk() {
    setError('');
    setNotice('');
    setAsking(true);
    setAskForm({ targetKey: '', unitKey: '', quantityStored: '', minimumStorageDays: '30' });
    setUnits([]);
  }

  async function pickWarehouse(warehouseId) {
    setAskForm((f) => ({ ...f, unitKey: '' }));
    if (!warehouseId) return setUnits([]);
    try {
      setUnits(await api(`/reference/warehouses/${warehouseId}/units`));
    } catch (e) {
      setError(e.message);
    }
  }

  async function submitAsk(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const [warehouseId, unitNo] = askForm.unitKey.split('-').map(Number);
      const res = await api(`${base}/storage/requests`, {
        method: 'POST',
        body: {
          ...askTarget.body,
          warehouseId,
          unitNo,
          quantityStored: Number(askForm.quantityStored),
          minimumStorageDays: Number(askForm.minimumStorageDays),
        },
      });
      setNotice(
        `Request #${res.allocationId} sent — ${number(res.quantityStored)} kg into unit ` +
          `${res.unitNo} at ${res.storageFeePerKgRate}/kg (${taka(res.estimatedFee)}). ` +
          `Nothing is stored until the manager accepts.`
      );
      setAsking(false);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

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

      <div className="row">
        <h2>Awaiting your decision</h2>
        <button type="button" className="small" onClick={openAsk} disabled={busy}>
          Request storage
        </button>
      </div>
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
            {proposals.map((p) => {
              // Two shapes land in this queue: a manager's offer we can
              // accept/reject/counter, and a manager's counter against our
              // own request, which we can only take or leave.
              const isCounter = p.awaiting === 'COUNTER';
              const respondPath = isCounter
                ? `${base}/storage/${p.allocationId}/counter/respond`
                : `${base}/storage/proposals/${p.allocationId}/respond`;
              const settledRate = isCounter ? p.counterRatePerKg : p.ratePerKg;
              return (
                <tr key={p.allocationId}>
                  <td>
                    #{p.allocationId}
                    {isCounter && (
                      <div>
                        <span className="tag tag-countered">counter</span>
                      </div>
                    )}
                  </td>
                  <td>#{p.batchId}</td>
                  <td>{p.cropName}</td>
                  <td>{p.warehouseName}</td>
                  <td className="num">{p.unitNo}</td>
                  <td className="num">{number(p.quantityStored)} kg</td>
                  <td className="num">{p.minimumStorageDays}</td>
                  <td className="num">
                    <strong>{settledRate}</strong>
                    {isCounter && <div className="muted small">you asked at {p.ratePerKg}</div>}
                  </td>
                  <td className="num">{taka(p.estimatedFee)}</td>
                  <td>
                    <div className="actions" style={{ margin: 0 }}>
                      <button
                        type="button"
                        className="small"
                        disabled={busy}
                        onClick={() =>
                          act(
                            respondPath,
                            { decision: 'ACCEPT' },
                            `Allocation #${p.allocationId} accepted at ${settledRate}/kg — the batch is now in storage and the clock has started.`
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
                            respondPath,
                            { decision: 'REJECT' },
                            `Allocation #${p.allocationId} rejected. The unit's space is free again.`
                          )
                        }
                      >
                        Reject
                      </button>
                      {/* A counter is the manager's last word — countering
                          it back is refused by the server, so no button. */}
                      {!isCounter && (
                        <button
                          type="button"
                          className="small ghost"
                          disabled={busy}
                          onClick={() => {
                            setCountering(p);
                            setCounterRate(String(p.ratePerKg));
                            setNotice('');
                            setError('');
                          }}
                        >
                          Counter
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

      {countering && (
        <form
          className="boxed confirm"
          onSubmit={(e) => {
            e.preventDefault();
            const rateValue = Number(counterRate);
            act(
              `${base}/storage/proposals/${countering.allocationId}/respond`,
              { decision: 'COUNTER', counterRatePerKg: rateValue },
              `Counter-offer of ${rateValue}/kg sent on allocation #${countering.allocationId}. The manager can accept or reject it, but not counter back.`
            ).then(() => setCountering(null));
          }}
        >
          <h3>Counter allocation #{countering.allocationId}</h3>
          <p className="muted">
            {countering.warehouseName} quoted {countering.ratePerKg}/kg for{' '}
            {number(countering.quantityStored)} kg — {taka(countering.estimatedFee)}.
          </p>
          <label>
            Your rate per kg *
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={counterRate}
              onChange={(e) => setCounterRate(e.target.value)}
              required
            />
          </label>
          {Number(counterRate) > 0 && (
            <p className="note">
              {number(countering.quantityStored)} kg at {counterRate}/kg ={' '}
              <strong>{taka(countering.quantityStored * Number(counterRate))}</strong>. You get one
              counter — after this the manager either takes it or the proposal ends.
            </p>
          )}
          <div className="actions">
            <button
              type="submit"
              disabled={
                busy ||
                !(Number(counterRate) > 0) ||
                Number(counterRate) === Number(countering.ratePerKg)
              }
            >
              {busy ? 'Sending…' : 'Send counter-offer'}
            </button>
            <button type="button" className="ghost" onClick={() => setCountering(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {asking && (
        <form className="boxed confirm" onSubmit={submitAsk}>
          <h3>Request storage</h3>
          <p className="muted">
            Pick somewhere to store {isFarmer ? 'an unsold batch' : 'an order you have won'} and ask
            its manager for space. They can accept, reject, or counter your rate.
          </p>

          {storableOptions.length === 0 ? (
            <p className="muted">
              {isFarmer
                ? 'You have no unsold batch that needs storing.'
                : 'You have no orders to store yet.'}
            </p>
          ) : (
            <>
              <div className="grid">
                <label>
                  {isFarmer ? 'Batch' : 'Order'} *
                  <select
                    value={askForm.targetKey}
                    onChange={(e) => {
                      const opt = storableOptions.find((o) => o.key === e.target.value);
                      setAskForm({
                        ...askForm,
                        targetKey: e.target.value,
                        quantityStored: opt ? String(opt.maxQuantity) : '',
                      });
                    }}
                    required
                  >
                    <option value="">Select…</option>
                    {storableOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Warehouse *
                  <select
                    defaultValue=""
                    onChange={(e) => pickWarehouse(e.target.value)}
                    required
                  >
                    <option value="">Select…</option>
                    {warehouses.map((w) => (
                      <option key={w.warehouseId} value={w.warehouseId}>
                        {w.warehouseName} · {w.district} — {w.storageFeePerKgRate}/kg,{' '}
                        {number(w.freeSpace)} kg free
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Unit *
                  <select
                    value={askForm.unitKey}
                    onChange={(e) => setAskForm({ ...askForm, unitKey: e.target.value })}
                    required
                    disabled={units.length === 0}
                  >
                    <option value="">{units.length ? 'Select…' : 'Pick a warehouse first'}</option>
                    {units
                      .filter((u) => u.freeSpace > 0)
                      .map((u) => (
                        <option
                          key={`${u.warehouseId}-${u.unitNo}`}
                          value={`${u.warehouseId}-${u.unitNo}`}
                        >
                          Unit {u.unitNo} — {number(u.freeSpace)} kg free
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  Quantity (kg) *
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={askForm.quantityStored}
                    onChange={(e) => setAskForm({ ...askForm, quantityStored: e.target.value })}
                    required
                  />
                </label>

                <label>
                  Minimum storage days *
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={askForm.minimumStorageDays}
                    onChange={(e) =>
                      setAskForm({ ...askForm, minimumStorageDays: e.target.value })
                    }
                    required
                  />
                </label>
              </div>

              {askTarget && Number(askForm.quantityStored) > askTarget.maxQuantity && (
                <p className="error">
                  Only {number(askTarget.maxQuantity)} kg is available on that{' '}
                  {isFarmer ? 'batch' : 'order'}.
                </p>
              )}

              <p className="note">
                The rate shown is the warehouse&rsquo;s own. If it does not suit you, send the
                request anyway — the manager may counter, and you can settle it then.
              </p>
            </>
          )}

          <div className="actions">
            <button
              type="submit"
              disabled={
                busy ||
                !askTarget ||
                !askForm.unitKey ||
                !(Number(askForm.quantityStored) > 0) ||
                Number(askForm.quantityStored) > (askTarget?.maxQuantity ?? 0) ||
                !(Number(askForm.minimumStorageDays) > 0)
              }
            >
              {busy ? 'Sending…' : 'Send request'}
            </button>
            <button type="button" className="ghost" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        </form>
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
                                { decision: 'DECLINE' },
                                `Early release declined for allocation #${h.allocationId}.`
                              )
                            }
                          >
                            Decline
                          </button>
                        </>
                      )}
                      {/* Server already excludes PENDING_ACCEPT/COUNTERED
                          rows from `fees` (so `owed` is null for them) —
                          this status check is belt-and-suspenders,
                          matching the pattern in storage/Allocations.jsx. */}
                      {owed > 0 &&
                        (h.allocationStatus === 'ACTIVE' ||
                          h.allocationStatus === 'PENDING_RELEASE') && (
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
