export default function RefreshButton({ onClick, refreshing }) {
  return (
    <button
      onClick={onClick}
      aria-label="Refresh"
      disabled={refreshing}
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-2.5 py-2 text-sm active:scale-95 sm:px-3 sm:py-1.5 text-slate-700 shadow-sm transition hover:bg-white hover:shadow disabled:opacity-60"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
      >
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 3v6h-6" />
      </svg>
      <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
    </button>
  );
}
