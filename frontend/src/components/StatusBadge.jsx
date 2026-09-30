const STYLES = {
  open: 'bg-blue-50 text-blue-700 ring-blue-200',
  submitted: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-green-50 text-green-700 ring-green-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200',
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  superseded: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${
        STYLES[status] || STYLES.cancelled
      }`}
    >
      {status}
    </span>
  );
}
