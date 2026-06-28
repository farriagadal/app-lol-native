/** Barra de progreso (0..1) con texto opcional. */
export function ProgressBar({ value, text }: { value: number; text?: string }) {
  const w = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="progress-wrap">
      <div className="progress">
        <div className="progress-fill" style={{ width: `${w}%` }} />
      </div>
      {text != null && <div className="progress-text">{text}</div>}
    </div>
  );
}
