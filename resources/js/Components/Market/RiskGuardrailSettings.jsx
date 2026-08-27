import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  CheckCircle2,
  Flame,
  Hash,
  Layers,
  Save,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
} from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';
import ToggleSwitch from './ToggleSwitch';

const EMPTY = {
  mode: 'warning', maxDailyLoss: '', maxTradesPerDay: '',
  maxConcurrentPositions: '', maxConsecutiveLosses: '', isEnabled: false,
};

const MODE_OPTIONS = [
  { value: 'warning', label: 'Warning only', description: 'Allows the order, shows a breach notice.' },
  { value: 'enforced', label: 'Enforced', description: 'Blocks new entries that breach a limit.' },
];

const LIMIT_FIELDS = [
  { key: 'maxDailyLoss', label: 'Max daily loss', step: '0.01', icon: TrendingDown },
  { key: 'maxTradesPerDay', label: 'Max trades/day', step: '1', icon: Hash },
  { key: 'maxConcurrentPositions', label: 'Max concurrent', step: '1', icon: Layers },
  { key: 'maxConsecutiveLosses', label: 'Loss streak limit', step: '1', icon: Flame },
];

export default function RiskGuardrailSettings() {
  const { theme } = useTheme();
  const isDark = theme === 'bg-skin-black';
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    axios.get('/market-backtest/risk-settings').then((response) => {
      const settings = response.data?.settings ?? {};
      setForm({
        mode: settings.mode ?? 'warning',
        maxDailyLoss: settings.maxDailyLoss ?? '',
        maxTradesPerDay: settings.maxTradesPerDay ?? '',
        maxConcurrentPositions: settings.maxConcurrentPositions ?? '',
        maxConsecutiveLosses: settings.maxConsecutiveLosses ?? '',
        isEnabled: Boolean(settings.isEnabled),
      });
    }).catch(() => setMessage('Unable to load risk guardrails.'));
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const nullableNumber = (value) => value === '' ? null : Number(value);
    try {
      await axios.put('/market-backtest/risk-settings', {
        mode: form.mode,
        max_daily_loss: nullableNumber(form.maxDailyLoss),
        max_trades_per_day: nullableNumber(form.maxTradesPerDay),
        max_concurrent_positions: nullableNumber(form.maxConcurrentPositions),
        max_consecutive_losses: nullableNumber(form.maxConsecutiveLosses),
        is_enabled: form.isEnabled,
      });
      setMessage('Risk guardrails saved.');
    } catch (err) {
      const errors = err.response?.data?.errors;
      setMessage(errors ? Object.values(errors).flat()[0] : (err.response?.data?.message ?? 'Unable to save risk guardrails.'));
    } finally {
      setSaving(false);
    }
  };

  const surface = isDark ? 'border-gray-800 bg-skin-black text-white' : 'border-slate-200 bg-white text-slate-900';
  const field = isDark ? 'border-gray-700 bg-black-table-color text-white' : 'border-slate-300 bg-white text-slate-900';
  const muted = isDark ? 'text-gray-400' : 'text-slate-600';
  const faint = isDark ? 'text-gray-500' : 'text-slate-400';
  const cardSurface = isDark ? 'border-gray-800 bg-black-table-color' : 'border-slate-200 bg-slate-50';
  const segmentSurface = isDark ? 'border-gray-700 bg-skin-black' : 'border-slate-200 bg-slate-50';
  const isSuccess = message.includes('saved');

  return (
    <form onSubmit={save} data-tour="journal-risk" className={`rounded-lg border p-4 ${surface}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {form.isEnabled ? (
              <ShieldCheck size={18} className={isDark ? 'text-emerald-400' : 'text-emerald-600'} />
            ) : (
              <ShieldAlert size={18} className={faint} />
            )}
            <h2 className="text-base font-bold">Risk Guardrails</h2>
          </div>
          <p className={`mt-1 max-w-3xl text-sm ${muted}`}>Limits follow the UTC calendar day of the replay candle, not today’s wall-clock date. Warning mode allows the order; enforced mode blocks new entries.</p>
        </div>
        <ToggleSwitch
          checked={form.isEnabled}
          onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })}
          label="Enable guardrails"
          isDark={isDark}
        />
      </div>

      <div className="mt-4">
        <div className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${muted}`}>Mode</div>
        <div className={`flex flex-col gap-1 rounded-lg border p-1 sm:flex-row ${segmentSurface}`}>
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={form.mode === option.value}
              onClick={() => setForm({ ...form, mode: option.value })}
              className={`flex-1 rounded-md px-3 py-2 text-left transition-colors ${
                form.mode === option.value
                  ? 'bg-[#2dd4bf] text-white'
                  : isDark ? 'text-gray-300 hover:bg-white/5' : 'text-slate-600 hover:bg-white'
              }`}
            >
              <div className="text-sm font-semibold">{option.label}</div>
              <div className={`mt-0.5 text-xs ${form.mode === option.value ? 'text-blue-100' : muted}`}>{option.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${muted}`}>Limits</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LIMIT_FIELDS.map(({ key, label, step, icon: Icon }) => (
            <label key={key} className={`block rounded-lg border p-3 ${cardSurface}`}>
              <span className="mb-2 flex items-center justify-between gap-2">
                <span className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${muted}`}>
                  <Icon size={13} />
                  {label}
                </span>
                {form[key] === '' && (
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${isDark ? 'bg-gray-700/60 text-gray-300' : 'bg-slate-200 text-slate-500'}`}>
                    No limit
                  </span>
                )}
              </span>
              <input
                type="number"
                min={step}
                step={step}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                placeholder="No limit"
                className={`h-9 w-full rounded-md border px-2 text-sm ${field}`}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <Save size={14} />
          {saving ? 'Saving…' : 'Save guardrails'}
        </button>
      </div>

      {message && (
        <div
          className={`mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            isSuccess
              ? isDark ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : isDark ? 'border-red-800 bg-red-950/40 text-red-300' : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {isSuccess ? <CheckCircle2 size={15} className="shrink-0" /> : <AlertCircle size={15} className="shrink-0" />}
          <span>{message}</span>
        </div>
      )}
    </form>
  );
}
