type Status = 'pending' | 'success' | 'failed';

const LABEL: Record<Status, string> = {
  pending: 'PENDING',
  success: 'OK',
  failed: 'FAIL',
};

const COLOR: Record<Status, string> = {
  pending: 'text-warn',
  success: 'text-ok',
  failed: 'text-fail',
};

export function StatusTag({
  status,
  className = '',
}: {
  status: Status;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[11px] font-semibold tracking-wide ${COLOR[status]} ${className}`}
    >
      [{LABEL[status]}]
    </span>
  );
}
