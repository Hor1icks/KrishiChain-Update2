export default function UtilBar({ pct }) {
  const value = Math.min(Number(pct) || 0, 100);
  const tone = value > 90 ? 'critical' : value > 75 ? 'high' : value > 0 ? 'ok' : 'empty';

  return (
    <div className="utilbar" title={`${pct}% full`}>
      <span className="utilbar-track">
        <span className={`utilbar-fill utilbar-${tone}`} style={{ width: `${value}%` }} />
      </span>
      <span className="utilbar-label">{pct}%</span>
    </div>
  );
}
