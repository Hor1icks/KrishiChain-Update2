import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { dateTime, relativeTime } from '../utils/format';

/**
 * Where a notification takes you when it is clicked.
 *
 * The row carries RelatedEntityType and RelatedEntityID — the same pair
 * the NOTIFICATION table stores — and the destination depends on the
 * reader's role as well as the entity: a SALE_ORDER is /farmer/orders for
 * the grower and /buyer/orders for the person who bought it.
 *
 * Returns null when there is nowhere sensible to go, and the row then
 * renders as plain text rather than a dead link.
 */
export function routeFor({ relatedEntityType, relatedEntityId }, role) {
  const id = relatedEntityId;
  switch (relatedEntityType) {
    case 'HARVEST_BATCH':
      if (role === 'FARMER') return `/farmer/batches/${id}`;
      if (role === 'BUYER') return `/buyer/batches/${id}`;
      return null;
    case 'BID':
      if (role === 'BUYER') return '/buyer/bids';
      if (role === 'FARMER') return '/farmer/batches';
      return null;
    case 'SALE_ORDER':
      if (role === 'FARMER') return '/farmer/orders';
      if (role === 'BUYER') return '/buyer/orders';
      if (role === 'TRANSPORT_PERSONNEL') return '/transport';
      return null;
    case 'STORES':
      if (role === 'FARMER') return '/farmer/storage';
      if (role === 'BUYER') return '/buyer/storage';
      if (role === 'STORAGE_MANAGER') return '/storage/allocations';
      return null;
    case 'WAREHOUSE':
      return role === 'STORAGE_MANAGER' ? '/storage/warehouses' : null;
    case 'PAYMENT':
      if (role === 'FARMER') return '/farmer/payments';
      if (role === 'BUYER') return '/buyer/payments';
      return null;
    case 'TRANSPORT_REQUEST':
      return role === 'TRANSPORT_PERSONNEL' ? '/transport' : null;
    case 'COMPLAINT':
      return role === 'ADMIN' ? '/admin/complaints' : null;
    case 'PHYSICAL_BAZAR':
      return role === 'ADMIN' ? '/admin/prices' : null;
    case 'USERS':
      return role === 'ADMIN' ? '/admin/users' : null;
    default:
      return null;
  }
}

/**
 * Three tones, so the list can be triaged without reading it. Anything
 * needing the reader to act is amber; anything that closed a loop in
 * their favour is green; the rest is neutral.
 */
function toneFor(type) {
  if (/OUTBID|FEE_DUE|COMPLAINT_RAISED|RELEASE_REQUESTED|NEAR_CAPACITY|STALE|COUNTERED/.test(type)) {
    return 'warn';
  }
  if (/WON|ACCEPTED|PAID|RECEIVED|DELIVERED/.test(type)) return 'good';
  return 'plain';
}

const label = (type) => type.replace(/_/g, ' ').toLowerCase();

export default function NotificationBell() {
  const { user } = useAuth();
  const { items, unread, loading, error, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);

  // Close on a click anywhere else, and on Escape. Escape also returns
  // focus to the bell so keyboard users are not dropped at the top of
  // the document.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const openRow = (item) => {
    if (item.isRead === 'N') markRead(item.notificationId);
    const to = routeFor(item, user.role);
    setOpen(false);
    if (to) navigate(to);
  };

  return (
    <div className="notif" ref={wrapRef}>
      <button
        type="button"
        ref={buttonRef}
        className="notif-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
          <path d="M10.5 18.5a1.9 1.9 0 0 0 3 0" />
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <header className="notif-head">
            <span>
              Notifications
              {unread > 0 && <em>{unread} unread</em>}
            </span>
            <button
              type="button"
              className="notif-linkbtn"
              onClick={markAllRead}
              disabled={unread === 0}
            >
              Mark all read
            </button>
          </header>

          <div className="notif-list">
            {error && <p className="notif-empty error">{error}</p>}

            {!error && items.length === 0 && (
              <p className="notif-empty muted">
                {loading ? 'Loading…' : 'Nothing yet. Bids, storage offers and deliveries land here.'}
              </p>
            )}

            {items.map((item) => {
              // A row with nowhere to go renders as plain markup, not a
              // button — a click affordance that does nothing is worse
              // than no affordance.
              const to = routeFor(item, user.role);
              const Row = to ? 'button' : 'div';
              return (
                <Row
                  key={item.notificationId}
                  {...(to
                    ? { type: 'button', onClick: () => openRow(item) }
                    : { onClick: () => item.isRead === 'N' && markRead(item.notificationId) })}
                  className={
                    `notif-item${item.isRead === 'N' ? ' is-unread' : ''}` +
                    (to ? '' : ' is-static')
                  }
                  title={dateTime(item.createdAt)}
                >
                  <span className={`notif-dot notif-${toneFor(item.type)}`} aria-hidden="true" />
                  <span className="notif-body">
                    <span className="notif-title">{item.title}</span>
                    <span className="notif-message">{item.message}</span>
                    <span className="notif-type">{label(item.type)}</span>
                  </span>
                  <span className="notif-age">{relativeTime(item.createdAt)}</span>
                </Row>
              );
            })}
          </div>

          <footer className="notif-foot">
            Showing the most recent {items.length}. Backend wiring is Phase D — these are
            seeded locally for now.
          </footer>
        </div>
      )}
    </div>
  );
}
