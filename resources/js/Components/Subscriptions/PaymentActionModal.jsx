import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';

const TONES = {
  danger: { badge: 'border-red-500/40 bg-red-500/10 text-red-500', button: 'bg-red-600 hover:bg-red-500' },
  success: { badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500', button: 'bg-emerald-600 hover:bg-emerald-500' },
};

export default function PaymentActionModal({
  icon: Icon, tone = 'danger', title, description, reasonCodes, daysDefault,
  reasonPlaceholder, confirmLabel, confirmingLabel, loading, onClose, onConfirm,
}) {
  const { theme } = useTheme();
  const dark = theme === 'bg-skin-black';
  const [reasonCode, setReasonCode] = useState(reasonCodes?.[0]?.[0] ?? '');
  const [days, setDays] = useState(daysDefault ?? 30);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const colors = TONES[tone] ?? TONES.danger;

  const shell = dark ? 'border-[#2a2e39] bg-[#131722] text-white' : 'border-slate-200 bg-white text-slate-900';
  const surface = dark ? 'border-[#2a2e39] bg-[#0b0e14]' : 'border-slate-200 bg-slate-50';
  const field = dark ? 'border-[#2a2e39] bg-[#0b0e14] text-white' : 'border-slate-200 bg-white text-slate-900';
  const cancelBtn = dark ? 'border-[#2a2e39] text-[#d1d4dc] hover:bg-white/5' : 'border-slate-300 text-slate-700 hover:bg-slate-50';

  const submit = () => {
    const trimmed = reason.trim();
    if (trimmed.length < 10) { setError('Enter at least 10 characters explaining this action.'); return; }
    const parsedDays = daysDefault !== undefined ? parseInt(days, 10) : null;
    if (daysDefault !== undefined && (!parsedDays || parsedDays < 1)) { setError('Enter a valid number of days.'); return; }
    onConfirm({
      ...(reasonCodes ? { reason_code: reasonCode } : {}),
      ...(daysDefault !== undefined ? { days: parsedDays } : {}),
      reason: trimmed,
    });
  };

  return <div className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/75 p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className={`w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl ${shell}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className={`flex items-start justify-between gap-3 border-b p-5 ${surface}`}>
        <div className="flex items-center gap-3">
          {Icon && <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${colors.badge}`}><Icon size={18}/></span>}
          <h2 className="text-base font-bold leading-tight">{title}</h2>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 rounded p-1 text-[#787b86] hover:text-current" aria-label="Close">
          <X size={18}/>
        </button>
      </header>
      <div className="space-y-4 p-5">
        <p className="text-sm leading-6 text-[#9598a1]">{description}</p>
        {reasonCodes && <label className="block text-xs font-semibold">
          Reason
          <select value={reasonCode} onChange={event => setReasonCode(event.target.value)} className={`mt-1.5 h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-[#2dd4bf] ${field}`}>
            {reasonCodes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>}
        {daysDefault !== undefined && <label className="block text-xs font-semibold">
          Days to restore
          <input type="number" min="1" max="3650" value={days} onChange={event => setDays(event.target.value)} className={`mt-1.5 h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-[#2dd4bf] ${field}`}/>
        </label>}
        <label className="block text-xs font-semibold">
          Internal note
          <textarea value={reason} onChange={event => setReason(event.target.value)} rows="3" placeholder={reasonPlaceholder} className={`mt-1.5 w-full resize-y rounded-lg border p-3 text-sm outline-none focus:border-[#2dd4bf] ${field}`}/>
        </label>
        {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
      </div>
      <footer className={`flex justify-end gap-2 border-t p-4 ${surface}`}>
        <button type="button" onClick={onClose} className={`h-10 rounded-lg border px-4 text-xs font-bold ${cancelBtn}`}>Cancel</button>
        <button type="button" disabled={loading} onClick={submit} className={`h-10 rounded-lg px-4 text-xs font-bold text-white disabled:opacity-50 ${colors.button}`}>{loading ? confirmingLabel : confirmLabel}</button>
      </footer>
    </section>
  </div>;
}
