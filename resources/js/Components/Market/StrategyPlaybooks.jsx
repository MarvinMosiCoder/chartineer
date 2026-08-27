import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Archive,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  ListChecks,
  LogIn,
  OctagonX,
  Pencil,
  Plus,
  Save,
  SlidersHorizontal,
  Target,
  X,
  XCircle,
} from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';
import { useConfirm } from '../../Hooks/useConfirm';
import { broadcastChange } from '../../utils/crossTabSync';
import ToggleSwitch from './ToggleSwitch';
import StatCard from './StatCard';

const EMPTY_FORM = {
  name: '', description: '', entryRules: '', confirmationRules: '', invalidationRules: '',
  stopRules: '', targetRules: '', checklistText: '', isActive: true,
};

const RULE_FIELDS = [
  { key: 'entryRules', label: 'Entry rules', icon: LogIn },
  { key: 'confirmationRules', label: 'Confirmation rules', icon: CheckCircle2 },
  { key: 'invalidationRules', label: 'Invalidation rules', icon: XCircle },
  { key: 'stopRules', label: 'Stop rules', icon: OctagonX },
  { key: 'targetRules', label: 'Target rules', icon: Target },
];

function PlaybookCard({ playbook, isDark, cardSurface, muted, buttonClass, onEdit, onArchive }) {
  const populatedRules = RULE_FIELDS.filter(({ key }) => String(playbook[key] ?? '').trim().length > 0);

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${cardSurface}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{playbook.name}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                playbook.isActive
                  ? isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
                  : isDark ? 'bg-gray-700/60 text-gray-300' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {playbook.isActive ? <CheckCircle2 size={11} /> : <Archive size={11} />}
              {playbook.isActive ? 'Active' : 'Archived'}
            </span>
          </div>
          <p className={`mt-1 text-sm ${muted}`}>{playbook.description || 'No description'} · {playbook.checklist.length} checklist items</p>
          {populatedRules.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {populatedRules.map(({ key, label, icon: Icon }) => (
                <span
                  key={key}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${isDark ? 'bg-skin-black text-gray-400' : 'bg-slate-100 text-slate-500'}`}
                >
                  <Icon size={10} />
                  {label.replace(' rules', '')}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onEdit} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${buttonClass}`}>
            <Pencil size={12} />
            Edit
          </button>
          {playbook.isActive && (
            <button type="button" onClick={onArchive} className="inline-flex items-center gap-1 rounded-md bg-red-700 px-2 py-1 text-xs font-semibold text-white hover:bg-red-600">
              <Archive size={12} />
              Archive
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StrategyPlaybooks() {
  const { theme } = useTheme();
  const isDark = theme === 'bg-skin-black';
  const { confirm, confirmElement } = useConfirm();
  const [playbooks, setPlaybooks] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/market-backtest/playbooks', { params: { include_archived: 1 } });
      setPlaybooks(response.data?.playbooks ?? []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message ?? 'Unable to load strategy playbooks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const reset = () => { setForm(EMPTY_FORM); setEditingId(null); setFormError(''); };
  const closeModal = () => { setIsModalOpen(false); reset(); };
  const openCreateModal = () => { reset(); setIsModalOpen(true); };
  const edit = (playbook) => {
    setEditingId(playbook.id);
    setForm({
      name: playbook.name ?? '', description: playbook.description ?? '', entryRules: playbook.entryRules ?? '',
      confirmationRules: playbook.confirmationRules ?? '', invalidationRules: playbook.invalidationRules ?? '',
      stopRules: playbook.stopRules ?? '', targetRules: playbook.targetRules ?? '',
      checklistText: (playbook.checklist ?? []).join('\n'), isActive: Boolean(playbook.isActive),
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const payload = {
      name: form.name,
      description: form.description || null,
      entry_rules: form.entryRules || null,
      confirmation_rules: form.confirmationRules || null,
      invalidation_rules: form.invalidationRules || null,
      stop_rules: form.stopRules || null,
      target_rules: form.targetRules || null,
      checklist: form.checklistText.split('\n').map((item) => item.trim()).filter(Boolean),
      is_active: form.isActive,
    };
    try {
      if (editingId) await axios.put(`/market-backtest/playbooks/${editingId}`, payload);
      else await axios.post('/market-backtest/playbooks', payload);
      closeModal();
      await load();
      broadcastChange('backtradelab-playbooks-changed');
    } catch (err) {
      const validation = err.response?.data?.errors;
      setFormError(validation ? Object.values(validation).flat()[0] : (err.response?.data?.message ?? 'Unable to save playbook.'));
    } finally {
      setSaving(false);
    }
  };

  const archive = async (playbook) => {
    if (!(await confirm(`Archive "${playbook.name}"? Historical trades will keep their saved copy.`, { title: 'Archive playbook?', confirmLabel: 'Archive' }))) return;
    await axios.delete(`/market-backtest/playbooks/${playbook.id}`);
    if (editingId === playbook.id) closeModal();
    await load();
    broadcastChange('backtradelab-playbooks-changed');
  };

  const surface = isDark ? 'border-gray-800 bg-skin-black text-white' : 'border-slate-200 bg-white text-slate-900';
  const field = isDark ? 'border-gray-700 bg-black-table-color text-white' : 'border-slate-300 bg-white text-slate-900';
  const muted = isDark ? 'text-gray-400' : 'text-slate-600';
  const faint = isDark ? 'text-gray-500' : 'text-slate-400';
  const buttonClass = isDark ? 'bg-skin-black-light text-gray-200 hover:bg-gray-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200';
  const cardSurface = isDark ? 'border-gray-800 bg-black-table-color' : 'border-slate-200 bg-slate-50';
  const sectionSurface = isDark ? 'border-gray-800 bg-skin-black' : 'border-slate-200 bg-white';
  const borderClass = isDark ? 'border-gray-800' : 'border-slate-200';
  const activeCount = playbooks.filter((playbook) => playbook.isActive).length;

  return (
    <div className={`rounded-lg border p-4 ${surface}`}>
      {confirmElement}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen size={18} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
            <h2 className="text-base font-bold">Strategy Playbooks</h2>
          </div>
          <p className={`mt-1 text-sm ${muted}`}>Define repeatable trade rules. One checklist item per line is required before an attached order can be placed.</p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && playbooks.length > 0 && (
            <StatCard label="Active playbooks" value={`${activeCount} / ${playbooks.length}`} icon={ClipboardList} isDark={isDark} />
          )}
          <button
            type="button"
            onClick={openCreateModal}
            data-tour="journal-playbooks"
            className="inline-flex items-center gap-2 rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            <Plus size={14} />
            New playbook
          </button>
        </div>
      </div>

      {error && <div className="mb-3 rounded border border-red-800 bg-red-950/50 p-2 text-sm text-red-200">{error}</div>}

      {loading ? (
        <p className={`text-sm ${muted}`}>Loading playbooks…</p>
      ) : playbooks.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {playbooks.map((playbook) => (
            <PlaybookCard
              key={playbook.id}
              playbook={playbook}
              isDark={isDark}
              cardSurface={cardSurface}
              muted={muted}
              buttonClass={buttonClass}
              onEdit={() => edit(playbook)}
              onArchive={() => archive(playbook)}
            />
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={openCreateModal}
          className={`flex w-full flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center transition hover:opacity-80 ${cardSurface}`}
        >
          <ClipboardList size={26} className={faint} />
          <div className="mt-2 text-sm font-semibold">No playbooks yet</div>
          <p className={`mt-1 text-sm ${muted}`}>Create your first repeatable setup.</p>
        </button>
      )}

      {isModalOpen && (
        <div
          className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => event.target === event.currentTarget && closeModal()}
        >
          <div
            className={`flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border shadow-2xl ${surface}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="playbook-modal-title"
          >
            <div className={`flex items-center justify-between border-b px-5 py-4 ${borderClass}`}>
              <div className="flex items-center gap-2">
                <BookOpen size={17} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
                <h2 id="playbook-modal-title" className="text-base font-bold">{editingId ? 'Edit playbook' : 'New playbook'}</h2>
              </div>
              <button type="button" onClick={closeModal} className={`rounded-md p-1.5 ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                {formError && <div className="rounded border border-red-800 bg-red-950/50 p-2 text-sm text-red-200">{formError}</div>}
                <input
                  required
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Playbook name"
                  className={`h-10 w-full rounded-md border px-3 text-sm ${field}`}
                />
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Short description"
                  rows={2}
                  className={`w-full rounded-md border p-3 text-sm ${field}`}
                />

                <div className={`rounded-lg border p-3 ${sectionSurface}`}>
                  <div className={`mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${muted}`}>
                    <SlidersHorizontal size={13} />
                    <span>Trade rules</span>
                  </div>
                  <div className="space-y-3">
                    {RULE_FIELDS.map(({ key, label, icon: Icon }) => (
                      <label key={key} className="block">
                        <span className={`mb-1 flex items-center gap-1.5 text-xs font-medium ${muted}`}>
                          <Icon size={13} />
                          {label}
                        </span>
                        <textarea
                          value={form[key]}
                          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                          rows={2}
                          className={`w-full rounded-md border p-2.5 text-sm ${field}`}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className={`rounded-lg border p-3 ${sectionSurface}`}>
                  <div className={`mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${muted}`}>
                    <ListChecks size={13} />
                    <span>Pre-trade checklist</span>
                  </div>
                  <textarea
                    value={form.checklistText}
                    onChange={(e) => setForm({ ...form, checklistText: e.target.value })}
                    placeholder={'One item per line\nTrend agrees with setup\nStop loss is defined'}
                    rows={5}
                    className={`w-full rounded-md border p-2.5 text-sm ${field}`}
                  />
                </div>

                <ToggleSwitch
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  label="Active and available during order entry"
                  isDark={isDark}
                />
              </div>

              <div className={`flex justify-end gap-2 border-t px-5 py-4 ${borderClass}`}>
                <button type="button" onClick={closeModal} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${buttonClass}`}>
                  <X size={14} />
                  Cancel
                </button>
                <button disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  <Save size={14} />
                  {saving ? 'Saving…' : editingId ? 'Update playbook' : 'Create playbook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
