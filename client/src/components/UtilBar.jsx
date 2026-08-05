/**
 * Capacity bar. Utilisation is the storage module's whole story, and a
 * number in a table cell does not make "this unit is nearly full"
 * obvious at a glance the way a filled bar does.
 *
 * The colour thresholds match V_UNIT_UTILIZATION.AlertLevel exactly
 * (>90 CRITICAL, >75 HIGH) so the bar and the tag never disagree.
 */
export default function UtilBar({ pct }) {
  const value = Math.min(Number(pct) || 0, 100);
  const tone = value > 90 ? 'critical' : value > 75 ? 'high' : value > 0 ? 'ok' : 'empty';

  return (
    <div className="utilbar" title={`${pct}% full`}>
      <div className={`utilbar-fill utilbar-${tone}`} style={{ width: `${value}%` }} />
      <span className="utilbar-label">{pct}%</span>
    </div>
  );
}
