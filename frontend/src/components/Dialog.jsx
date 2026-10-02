import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Dialog({ title, onClose, footer, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // portal: an ancestor with transform/animation would otherwise become the containing block
  // of this fixed overlay and the backdrop would only cover that ancestor
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/80 bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-3xl sm:pb-6 shadow-2xl shadow-red-900/20 animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-3 space-y-3 text-sm text-slate-700">{children}</div>
        <div className="mt-5 flex justify-end gap-2">{footer}</div>
      </div>
    </div>,
    document.body
  );
}

export const btn = {
  primary:
    'rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-red-500/25 transition hover:shadow-lg hover:shadow-red-500/35 disabled:opacity-50',
  danger:
    'rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-red-600/25 transition hover:bg-red-500 disabled:opacity-50',
  secondary:
    'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50',
};
