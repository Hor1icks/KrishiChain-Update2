const nf = new Intl.NumberFormat('en-BD');
const cf = new Intl.NumberFormat('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function number(value) {
  if (value === null || value === undefined) return '—';
  return nf.format(value);
}

/** Taka. The PRD is a Bangladeshi agricultural system; every amount is BDT. */
export function taka(value) {
  if (value === null || value === undefined) return '—';
  return `৳${cf.format(value)}`;
}

/** Oracle DATEs arrive over JSON as ISO strings. */
export function date(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function dateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** For <input type="datetime-local">, which wants exactly YYYY-MM-DDTHH:mm. */
export function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Compact age for notification rows — "just now", "12m", "4h", "3d".
 * Deliberately terse: it sits in a narrow gutter beside the title, where a
 * full timestamp would wrap. The exact time is still available as the
 * row's `title` tooltip.
 */
export function relativeTime(value) {
  if (!value) return '';
  const seconds = Math.round((Date.now() - new Date(value)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}
