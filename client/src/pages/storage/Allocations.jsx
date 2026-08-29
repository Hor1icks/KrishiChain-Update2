import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { date, number, taka } from '../../utils/format';

const FINISHED = ['COMPLETED', 'REJECTED'];

export default function Allocations() {
  const [leg1, setLeg1] = useState([]);
  const [leg2, setLeg2] = useState([]);
  const [units, setUnits] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [requests, setRequests] = useState([]);
  const [showFinished, setShowFinished] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [countering, setCountering] = useState(null);
  const [counterRate, setCounterRate] = useState('');

  const [placing, setPlacing] = useState(null);
  const [terms, setTerms] = useState({
    unitKey: '',
    quantityStored: '',
    minimumStorageDays: '30',
  });

  const load = useCallback(async () => {
    try {
      const [l1, l2, u, w, al, rq] = await Promise.all([
        api('/storage/awaiting/leg1'),
        api('/storage/awaiting/leg2'),
        api('/storage/units'),
        api('/storage/warehouses'),
        api('/storage/allocations'),
        api('/storage/requests'),
      ]);
      setLeg1(l1);
      setLeg2(l2);
      setUnits(u);
      setWarehouses(w);
      setAllocations(al);
      setRequests(rq);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startLeg1(batch) {
    setNotice('');
    setError('');
    setPlacing({
      leg: 1,
      label: `batch #${batch.batchId}`,
      cropName: batch.cropName,
      customerName: batch.farmerName,
      customerRole: 'farmer',
      maxQuantity: Number(batch.unstoredQuantity),
      maxLabel: 'unsold and not already proposed',
      body: { batchId: batch.batchId },
    });
    setTerms({
      unitKey: '',
      quantityStored: String(batch.unstoredQuantity),
      minimumStorageDays: '30',
    });
  }

  function startLeg2(order) {
    setNotice('');
    setError('');
    setPlacing({
      leg: 2,
      label: `sale order #${order.saleOrderId}`,
      cropName: order.cropName,
      customerName: order.businessName || order.buyerName,
      customerRole: 'buyer',
      maxQuantity: Number(order.acceptedQuantity),
      maxLabel: 'purchased on this order',
      body: { saleOrderId: order.saleOrderId },
    });
    setTerms({
      unitKey: '',
      quantityStored: String(order.acceptedQuantity),
      minimumStorageDays: '30',
    });
  }

  const selectedUnit = units.find((u) => `${u.warehouseId}-${u.unitNo}` === terms.unitKey);

  const rate = selectedUnit
    ? warehouses.find((w) => w.warehouseId === selectedUnit.warehouseId)?.storageFeePerKgRate
    : null;

  const quantity = Number(terms.quantityStored);
  const days = Number(terms.minimumStorageDays);

  const overCapacity = selectedUnit && quantity > selectedUnit.freeSpace;
  const overSource = placing && quantity > placing.maxQuantity;
  const noRate = selectedUnit && !rate;
  const estimatedFee =
    rate && quantity > 0 && !overCapacity && !overSource ? quantity * rate : null;

  const blocked = !selectedUnit || overCapacity || overSource || noRate || !(quantity > 0) || !(days > 0);

  async function propose(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api('/storage/allocations', {
        method: 'POST',
        body: {
          ...placing.body,
          warehouseId: selectedUnit.warehouseId,
          unitNo: selectedUnit.unitNo,
          quantityStored: quantity,
          minimumStorageDays: days,
        },
      });
      setNotice(
        `Proposal #${res.allocationId} sent to the ${res.customerType.toLowerCase()} — ` +
          `${number(res.quantityStored)} kg into unit ${res.unitNo} for at least ` +
          `${res.minimumStorageDays} days, ${taka(res.estimatedFee)} at ` +
          `${res.storageFeePerKgRate}/kg. Nothing is stored until they accept.`
      );
      setPlacing(null);
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
      const res = await api(path, { method: 'POST', body });
      setNotice(typeof message === 'function' ? message(res) : message);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(
    () => (showFinished ? allocations : allocations.filter((a) => !FINISHED.includes(a.allocationStatus))),
    [allocations, showFinished]
  );

  if (!loaded) return <p className="muted">Loading…</p>;

  return (
    <div className="page">
      <h1>Allocations</h1>
      <p className="muted">
        Propose storage to a farmer or a buyer, and see every proposal through to release.
        A proposal reserves the space but stores nothing until the customer accepts it.
      </p>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      {}
      {requests.length > 0 && (
        <>
          <h2>Needs your answer</h2>
          <p className="note" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
            Customers who came to you: either asking for space, or countering a rate you quoted.
            Countering is a single round — whatever you send back, they can only take or leave.
          </p>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Kind</th>
                <th>Batch</th>
                <th>Crop</th>
                <th>Customer</th>
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
              {requests.map((r) => {
                const isCounter = r.awaiting === 'COUNTER';
                const respondPath = isCounter
                  ? `/storage/allocations/${r.allocationId}/counter/respond`
                  : `/storage/requests/${r.allocationId}/respond`;
                return (
                  <tr key={r.allocationId}>
                    <td>{r.allocationId}</td>
                    <td>
                      <span className={`tag tag-${isCounter ? 'countered' : 'pending_accept'}`}>
                        {isCounter ? 'counter' : 'request'}
                      </span>
                    </td>
                    <td>#{r.batchId}</td>
                    <td>{r.cropName}</td>
                    <td>
                      {r.customerName}
                      <div className="muted small">{r.customerType.toLowerCase()}</div>
                    </td>
                    <td>{r.warehouseName}</td>
                    <td className="num">{r.unitNo}</td>
                    <td className="num">{number(r.quantityStored)}</td>
                    <td className="num">{r.minimumStorageDays}</td>
                    <td className="num">
                      {isCounter ? (
                        <>
                          <strong>{r.counterRatePerKg}</strong>
                          <div className="muted small">you quoted {r.ratePerKg}</div>
                        </>
                      ) : (
                        r.ratePerKg
                      )}
                    </td>
                    <td className="num">{taka(r.estimatedFee)}</td>
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
                              `Allocation #${r.allocationId} accepted at ${
                                isCounter ? r.counterRatePerKg : r.ratePerKg
                              }/kg — the batch is in storage and the clock has started.`
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
                              `Allocation #${r.allocationId} rejected. The unit's space is free again.`
                            )
                          }
                        >
                          Reject
                        </button>
                        {}
                        {!isCounter && (
                          <button
                            type="button"
                            className="small ghost"
                            disabled={busy}
                            onClick={() => {
                              setCountering(r);
                              setCounterRate(String(r.ratePerKg));
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
        </>
      )}

      {countering && (
        <form
          className="boxed confirm"
          onSubmit={(e) => {
            e.preventDefault();
            const rateValue = Number(counterRate);
            act(
              `/storage/requests/${countering.allocationId}/respond`,
              { decision: 'COUNTER', counterRatePerKg: rateValue },
              `Counter-offer of ${rateValue}/kg sent to ${countering.customerName}. They can accept or reject it, but not counter back.`
            ).then(() => setCountering(null));
          }}
        >
          <h3>Counter allocation #{countering.allocationId}</h3>
          <p className="muted">
            {countering.customerName} asked for {number(countering.quantityStored)} kg in unit{' '}
            {countering.unitNo} at your rate of {countering.ratePerKg}/kg.
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
              <strong>{taka(countering.quantityStored * Number(counterRate))}</strong>.
              This is your one counter — they can only accept or reject it.
            </p>
          )}
          <div className="actions">
            <button
              type="submit"
              disabled={
                busy || !(Number(counterRate) > 0) || Number(counterRate) === Number(countering.ratePerKg)
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

      <h2>Leg 1 · unsold batches</h2>
      <p className="note" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
        A farmer&rsquo;s own harvest, held before it sells. The farmer is the customer and pays the fee.
      </p>
      {leg1.length === 0 ? (
        <p className="muted">Every unsold batch is already stored or proposed.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Batch</th>
              <th>Crop</th>
              <th>Farmer</th>
              <th>District</th>
              <th>Harvested</th>
              <th>Grade</th>
              <th className="num">Total</th>
              <th className="num">Stored</th>
              <th className="num">Unstored</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {leg1.map((b) => (
              <tr key={b.batchId}>
                <td>#{b.batchId}</td>
                <td>{b.cropName}</td>
                <td>{b.farmerName}</td>
                <td>{b.farmDistrict}</td>
                <td>{date(b.harvestDate)}</td>
                <td>{b.qualityGrade || '—'}</td>
                <td className="num">{number(b.totalQuantity)}</td>
                <td className="num">{number(b.storedQuantity)}</td>
                <td className="num">
                  <strong>{number(b.unstoredQuantity)}</strong>
                </td>
                <td>
                  <span className={`tag tag-${b.batchStatus.toLowerCase()}`}>
                    {b.batchStatus.replace(/_/g, ' ')}
                  </span>
                </td>
                <td>
                  <button type="button" className="small" onClick={() => startLeg1(b)}>
                    Propose
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Leg 2 · sold orders</h2>
      <p className="note" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
        Produce a buyer has won and not yet taken away. The buyer is the customer and pays the fee.
      </p>
      {leg2.length === 0 ? (
        <p className="muted">Every sale order has storage arranged.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Crop</th>
              <th>Buyer</th>
              <th>District</th>
              <th>Ordered</th>
              <th className="num">Quantity</th>
              <th>Delivery</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {leg2.map((o) => (
              <tr key={o.saleOrderId}>
                <td>#{o.saleOrderId}</td>
                <td>{o.cropName}</td>
                <td>
                  {o.businessName || o.buyerName}
                  {o.businessName && <div className="muted small">{o.buyerName}</div>}
                </td>
                <td>{o.buyerDistrict}</td>
                <td>{date(o.orderDate)}</td>
                <td className="num">{number(o.acceptedQuantity)}</td>
                <td>
                  {o.deliveryStatus ? (
                    <span className={`tag tag-${o.deliveryStatus.toLowerCase()}`}>
                      {o.deliveryStatus.replace(/_/g, ' ')}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <button type="button" className="small" onClick={() => startLeg2(o)}>
                    Propose
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {placing && (
        <form onSubmit={propose} className="boxed confirm">
          <h3>
            Propose storage — {placing.label}, {placing.cropName}
          </h3>
          <p className="muted">
            {number(placing.maxQuantity)} kg {placing.maxLabel}, for {placing.customerName}. They
            must accept before anything is stored.
          </p>

          <div className="grid">
            <label>
              Storage unit *
              <select
                value={terms.unitKey}
                onChange={(e) => setTerms({ ...terms, unitKey: e.target.value })}
                required
              >
                <option value="">Select a unit…</option>
                {units
                  .filter((u) => u.unitStatus !== 'MAINTENANCE' && u.freeSpace > 0)
                  .map((u) => (
                    <option
                      key={`${u.warehouseId}-${u.unitNo}`}
                      value={`${u.warehouseId}-${u.unitNo}`}
                    >
                      {u.warehouseName} · unit {u.unitNo} — {number(u.freeSpace)} kg free
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
                value={terms.quantityStored}
                onChange={(e) => setTerms({ ...terms, quantityStored: e.target.value })}
                required
              />
            </label>
            <label>
              Minimum storage days *
              <input
                type="number"
                step="1"
                min="1"
                value={terms.minimumStorageDays}
                onChange={(e) => setTerms({ ...terms, minimumStorageDays: e.target.value })}
                required
              />
            </label>
          </div>

          {selectedUnit && (
            <p className="note">
              Unit {selectedUnit.unitNo} holds {number(selectedUnit.currentLoad)} of{' '}
              {number(selectedUnit.capacity)} kg — {number(selectedUnit.freeSpace)} kg free.
              {estimatedFee !== null && (
                <>
                  {' '}
                  Fee at {rate}/kg would be <strong>{taka(estimatedFee)}</strong>, fixed now even
                  if the warehouse rate changes later.
                </>
              )}
            </p>
          )}
          {noRate && (
            <p className="error">
              {selectedUnit.warehouseName} has no storage fee rate set. Set it on the Warehouses
              page before proposing.
            </p>
          )}
          {overCapacity && (
            <p className="error">
              That exceeds the unit&rsquo;s free space of {number(selectedUnit.freeSpace)} kg.
            </p>
          )}
          {overSource && (
            <p className="error">
              Only {number(placing.maxQuantity)} kg is {placing.maxLabel}.
            </p>
          )}

          <p className="note">
            Before the minimum term is up, releasing early needs both sides to agree. After it,
            either side can release on their own.
          </p>

          <div className="actions">
            <button type="submit" disabled={busy || blocked}>
              {busy ? 'Sending…' : 'Send proposal'}
            </button>
            <button type="button" className="ghost" onClick={() => setPlacing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="row">
        <h2>{showFinished ? 'All proposals' : 'Live proposals'}</h2>
        <button
          type="button"
          className="ghost small"
          onClick={() => setShowFinished((v) => !v)}
        >
          {showFinished ? 'Hide finished' : 'Include finished'}
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="muted">
          {allocations.length === 0
            ? 'You have not proposed any storage yet.'
            : 'Nothing live — every proposal has been released or rejected.'}
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Leg</th>
              <th>Batch</th>
              <th>Crop</th>
              <th>Customer</th>
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
            {visible.map((a) => {
              const feeIsDue = ['ACTIVE', 'PENDING_RELEASE', 'COMPLETED'].includes(
                a.allocationStatus
              );
              const owed = feeIsDue
                ? Number(a.storageFee || 0) - Number(a.feePaid || 0)
                : 0;
              const oursToAnswer =
                a.allocationStatus === 'PENDING_RELEASE' && a.releaseRequestedBy !== 'MANAGER';
              const waitingOnCustomer =
                (a.allocationStatus === 'PENDING_ACCEPT' && a.proposedBy === 'MANAGER') ||
                (a.allocationStatus === 'COUNTERED' && a.counteredBy === 'MANAGER') ||
                (a.allocationStatus === 'PENDING_RELEASE' && a.releaseRequestedBy === 'MANAGER');
              const oursToNegotiate =
                (a.allocationStatus === 'PENDING_ACCEPT' && a.proposedBy === 'CUSTOMER') ||
                (a.allocationStatus === 'COUNTERED' && a.counteredBy === 'CUSTOMER');
              return (
                <tr key={a.allocationId}>
                  <td>{a.allocationId}</td>
                  <td>{a.saleOrderId ? `2 · SO#${a.saleOrderId}` : '1'}</td>
                  <td>#{a.batchId}</td>
                  <td>{a.cropName}</td>
                  <td>
                    {a.customerName}
                    <div className="muted small">{a.customerType.toLowerCase()}</div>
                  </td>
                  <td>{a.warehouseName}</td>
                  <td className="num">{a.unitNo}</td>
                  <td className="num">{number(a.quantityStored)}</td>
                  <td>{date(a.dateIn)}</td>
                  <td>{a.minimumReleaseDate ? date(a.minimumReleaseDate) : '—'}</td>
                  <td className="num">
                    {taka(a.storageFee)}
                    {owed > 0 && <div className="muted small">{taka(owed)} owing</div>}
                    {!feeIsDue && <div className="muted small">not yet agreed</div>}
                  </td>
                  <td>
                    <span className={`tag tag-${a.allocationStatus.toLowerCase()}`}>
                      {a.allocationStatus.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>
                    <div className="actions" style={{ margin: 0 }}>
                      {a.allocationStatus === 'ACTIVE' && (
                        <button
                          type="button"
                          className="small ghost"
                          disabled={busy}
                          onClick={() =>
                            act(
                              `/storage/allocations/${a.allocationId}/release`,
                              {},
                              (res) =>
                                res.status === 'COMPLETED'
                                  ? `Allocation #${a.allocationId} released — the minimum term was already served, so no approval was needed.`
                                  : `Release requested on allocation #${a.allocationId}. It is early, so ${a.customerName} has to approve it.`
                            )
                          }
                        >
                          Request release
                        </button>
                      )}
                      {oursToAnswer && (
                        <>
                          <button
                            type="button"
                            className="small"
                            disabled={busy}
                            onClick={() =>
                              act(
                                `/storage/allocations/${a.allocationId}/release/respond`,
                                { decision: 'APPROVE' },
                                `Early release approved — allocation #${a.allocationId} is out of storage.`
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
                                `/storage/allocations/${a.allocationId}/release/respond`,
                                { decision: 'DECLINE' },
                                `Early release declined — allocation #${a.allocationId} stays in storage until ${date(a.minimumReleaseDate)}.`
                              )
                            }
                          >
                            Decline
                          </button>
                        </>
                      )}
                      {waitingOnCustomer && (
                        <span className="muted small">Waiting on {a.customerName}</span>
                      )}
                      {oursToNegotiate && (
                        <span className="muted small">Your answer — see “Needs your answer”</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
