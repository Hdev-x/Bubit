import './ChartLoadStatus.css';

type Props = {
  pending: boolean;
  error?: boolean;
  missing?: readonly string[];
  target?: string;
  onRetry: () => void;
};

export function ChartLoadStatus({ pending, error = false, missing = [], target, onRetry }: Props) {
  if (pending && !error) {
    return <div className="chart-load-status chart-load-status--blocking" aria-busy="true" />;
  }
  if (!pending && !error && missing.length === 0) return null;

  const message = error
    ? `${target ? `${target} ` : ''}차트를 불러오지 못했습니다.`
    : `일부 지표를 불러오지 못했습니다 (${missing.join(', ')}).`;

  return (
    <div className={`chart-load-status${pending || error ? ' chart-load-status--blocking' : ''}`}>
      <div className="chart-load-status-message" role="status" aria-live="polite">
        <span>{message}</span>
        {(error || !pending) && <button type="button" onClick={onRetry}>다시 시도</button>}
      </div>
    </div>
  );
}
