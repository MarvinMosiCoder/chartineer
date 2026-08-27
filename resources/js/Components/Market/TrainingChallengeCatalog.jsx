import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../Context/ThemeContext';
import { useConfirm } from '../../Hooks/useConfirm';
import StatCard from './StatCard';

const VIOLATION_LABELS = {
  risk_percent: 'Over-risked trade',
  missing_playbook: 'No playbook attached',
  loss_streak: 'Loss streak exceeded',
};

const STATUS_BADGES = {
  active: { label: 'Active', className: 'border-blue-500/30 bg-blue-500/10 text-blue-400' },
  completed: { label: 'Passed', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' },
  failed: { label: 'Failed', className: 'border-red-500/30 bg-red-500/10 text-red-400' },
  abandoned: { label: 'Abandoned', className: 'border-gray-500/30 bg-gray-500/10 text-gray-400' },
};

function summarizeRules(rules) {
  if (!rules) return 'No configured rules';
  const parts = [];
  if (rules.requiredTrades) parts.push(`${rules.requiredTrades} trades`);
  if (rules.maxRiskPercentPerTrade) parts.push(`max ${rules.maxRiskPercentPerTrade}% risk/trade`);
  if (rules.requirePlaybookId) parts.push('playbook required');
  if (rules.maxConsecutiveLosses) parts.push(`no ${rules.maxConsecutiveLosses}-trade loss streak`);
  return parts.length ? parts.join(' • ') : 'No configured rules';
}

function groupViolations(violations) {
  const groups = {};
  (violations ?? []).forEach((violation) => {
    const type = violation.type ?? 'other';
    groups[type] = (groups[type] ?? 0) + 1;
  });
  return groups;
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '---';
  return number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TrainingChallengeCatalog() {
  const { theme } = useTheme();
  const isDark = theme === 'bg-skin-black';
  const { confirm, confirmElement } = useConfirm();
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/training-challenges/catalog');
      setChallenges(response.data?.challenges ?? []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message ?? 'Unable to load training challenges.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startAttempt = async (challenge) => {
    setBusyId(`start-${challenge.id}`);
    setError('');
    try {
      await axios.post(`/training-challenges/${challenge.id}/attempts`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Unable to start this challenge.');
    } finally {
      setBusyId(null);
    }
  };

  const abandonAttempt = async (attempt) => {
    if (!(await confirm('Abandon this attempt? Progress so far will not count toward completion.', { title: 'Abandon attempt?', confirmLabel: 'Abandon' }))) return;
    setBusyId(`abandon-${attempt.id}`);
    setError('');
    try {
      await axios.post(`/training-challenges/attempts/${attempt.id}/abandon`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Unable to abandon this attempt.');
    } finally {
      setBusyId(null);
    }
  };

  const surface = isDark ? 'border-gray-800 bg-skin-black text-white' : 'border-slate-200 bg-white text-slate-900';
  const field = isDark ? 'border-gray-700 bg-black-table-color text-white' : 'border-slate-300 bg-white text-slate-900';
  const muted = isDark ? 'text-gray-400' : 'text-slate-600';
  const trackClass = isDark ? 'bg-gray-800' : 'bg-slate-200';

  return (
    <div className={`rounded-lg border p-4 ${surface}`}>
      {confirmElement}
      <div className="mb-4" data-tour="training-intro">
        <h2 className="text-sm font-semibold">Training Challenges</h2>
        <p className={`mt-1 text-xs ${muted}`}>Measurable practice exercises scored on both profitability and rule adherence. Progress is computed from your closed trades since the attempt started.</p>
      </div>
      {error && <div className="mb-3 rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-200">{error}</div>}
      <div data-tour="training-list">
      {loading ? (
        <p className={`text-xs ${muted}`}>Loading challenges…</p>
      ) : challenges.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {challenges.map((challenge) => {
            const latest = challenge.latestAttempt;
            const attempt = latest?.attempt;
            const score = latest?.score;
            const badge = attempt ? STATUS_BADGES[attempt.status] : null;
            const hasActiveAttempt = attempt?.status === 'active';
            const violationGroups = score ? groupViolations(score.violations) : {};

            return (
              <div key={challenge.id} className={`rounded border p-3 ${field}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{challenge.name}</div>
                    <p className={`mt-1 text-xs ${muted}`}>{challenge.description}</p>
                    <p className={`mt-1 text-[11px] font-semibold uppercase tracking-wide ${muted}`}>{summarizeRules(challenge.rules)}</p>
                  </div>
                  {badge && (
                    <span className={`shrink-0 rounded border px-2 py-1 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                  )}
                </div>

                {attempt && score ? (
                  <div className="mt-3 space-y-3">
                    <div>
                      <div className={`mb-1 flex items-center justify-between text-[11px] ${muted}`}>
                        <span>{score.tradeCount} / {score.requiredTrades ?? '—'} trades</span>
                        <span>{score.progressPercent ?? 0}%</span>
                      </div>
                      <div className={`h-2 w-full overflow-hidden rounded-full ${trackClass}`}>
                        <div
                          className="h-full rounded-full bg-teal-500"
                          style={{ width: `${Math.min(100, Number(score.progressPercent) || 0)}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <StatCard label="Net PnL" value={formatMoney(score.netPnl)} tone={Number(score.netPnl) > 0 ? 'win' : Number(score.netPnl) < 0 ? 'loss' : 'neutral'} isDark={isDark} />
                      <StatCard label="Win Rate" value={`${score.winRate}%`} isDark={isDark} />
                    </div>

                    {Object.keys(violationGroups).length > 0 && (
                      <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-400">Violations</div>
                        <ul className="space-y-0.5 text-xs text-amber-300">
                          {Object.entries(violationGroups).map(([type, count]) => (
                            <li key={type}>{VIOLATION_LABELS[type] ?? type} × {count}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {hasActiveAttempt && (
                      <button
                        type="button"
                        disabled={busyId === `abandon-${attempt.id}`}
                        onClick={() => abandonAttempt(attempt)}
                        className="rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {busyId === `abandon-${attempt.id}` ? 'Abandoning…' : 'Abandon attempt'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-3">
                    <button
                      type="button"
                      disabled={busyId === `start-${challenge.id}`}
                      onClick={() => startAttempt(challenge)}
                      className="rounded bg-teal-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {busyId === `start-${challenge.id}` ? 'Starting…' : 'Start challenge'}
                    </button>
                  </div>
                )}

                {attempt && !hasActiveAttempt && (
                  <div className="mt-3">
                    <button
                      type="button"
                      disabled={busyId === `start-${challenge.id}`}
                      onClick={() => startAttempt(challenge)}
                      className={`rounded px-3 py-1.5 text-xs font-semibold ${isDark ? 'bg-skin-black-light text-gray-200 hover:bg-gray-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'} disabled:opacity-50`}
                    >
                      {busyId === `start-${challenge.id}` ? 'Starting…' : 'Try again'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className={`text-xs ${muted}`}>No training challenges are available right now.</p>
      )}
      </div>
    </div>
  );
}
