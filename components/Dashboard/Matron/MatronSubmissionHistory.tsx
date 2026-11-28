import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CheckCircle2, Clock, ChevronDown, ChevronUp, RefreshCw, History, Users } from 'lucide-react';
import { dbService } from '../../../services/dbService';
import { ParadeGenderSubmission } from '../../../types';
import { formatRC } from '../../../utils/rcHelpers';

interface MatronSubmissionHistoryProps {
  activeCourses: number[];
}

const getWATDateStr = (offsetDays = 0) => {
  const now = new Date();
  const watOffsetMs = 60 * 60 * 1000;
  const target = new Date(now.getTime() + watOffsetMs + offsetDays * 86400000);
  return target.toISOString().split('T')[0];
};

const formatDateGroupLabel = (dateStr: string): string => {
  const today = getWATDateStr(0);
  const yesterday = getWATDateStr(-1);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';

  const parsed = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
};

const formatWATTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos'
  });
};

export const MatronSubmissionHistory: React.FC<MatronSubmissionHistoryProps> = ({
  activeCourses
}) => {
  const [history, setHistory] = useState<ParadeGenderSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<number | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await dbService.getMatronSubmissionHistory(200);
      setHistory(rows);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    const onUpdated = () => loadHistory();
    window.addEventListener('parade-gender-submissions-updated', onUpdated);
    return () => window.removeEventListener('parade-gender-submissions-updated', onUpdated);
  }, [loadHistory]);

  const filteredRows = useMemo(() => {
    if (selectedCourseFilter === 'all') return history;
    return history.filter(r => r.courseNumber === selectedCourseFilter);
  }, [history, selectedCourseFilter]);

  const groupedByDate = useMemo(() => {
    const groups: Array<{ date: string; label: string; items: ParadeGenderSubmission[] }> = [];
    const map = new Map<string, ParadeGenderSubmission[]>();

    filteredRows.forEach(item => {
      const list = map.get(item.paradeDate) || [];
      list.push(item);
      map.set(item.paradeDate, list);
    });

    Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .forEach(([date, items]) => {
        groups.push({
          date,
          label: formatDateGroupLabel(date),
          items: items.sort((a, b) => b.courseNumber - a.courseNumber)
        });
      });

    return groups;
  }, [filteredRows]);

  return (
    <div className="space-y-4">
      {/* Top Bar + Course Filter Strip */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Submission History
          </h2>
          <p className="text-xs text-slate-500">
            Past Night Tattoo female parade submissions
          </p>
        </div>

        <button
          type="button"
          onClick={loadHistory}
          disabled={isLoading}
          className="min-h-[44px] min-w-[44px] px-3 rounded-full bg-white border border-slate-200/80 text-slate-700 hover:bg-slate-100 active:scale-95 transition-all flex items-center justify-center gap-1.5 text-xs font-semibold"
          aria-label="Refresh history"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Jakob's Law: WhatsApp/Instagram-style horizontal filter pills */}
      <div
        data-no-page-swipe="true"
        className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
      >
        <button
          type="button"
          onClick={() => setSelectedCourseFilter('all')}
          className={`min-h-[44px] px-4 rounded-full text-xs font-bold shrink-0 transition-all active:scale-95 border ${
            selectedCourseFilter === 'all'
              ? 'bg-slate-950 text-white border-slate-950'
              : 'bg-white text-slate-700 border-slate-200/80 hover:bg-slate-100'
          }`}
        >
          All Courses
        </button>
        {activeCourses.map(rc => (
          <button
            key={rc}
            type="button"
            onClick={() => setSelectedCourseFilter(rc)}
            className={`min-h-[44px] px-4 rounded-full text-xs font-bold tabular-nums shrink-0 transition-all active:scale-95 border ${
              selectedCourseFilter === rc
                ? 'bg-slate-950 text-white border-slate-950'
                : 'bg-white text-slate-700 border-slate-200/80 hover:bg-slate-100'
            }`}
          >
            {formatRC(rc)}
          </button>
        ))}
      </div>

      {/* Loading / Empty / Grouped List */}
      {isLoading && history.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">Loading submission history...</p>
        </div>
      ) : groupedByDate.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center space-y-2">
          <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <History size={20} />
          </div>
          <p className="text-sm font-bold text-slate-900">No submissions recorded yet</p>
          <p className="text-xs text-slate-500">
            Submitted Night Tattoo counts for each Regular Course will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedByDate.map(group => (
            <section key={group.date} className="space-y-2">
              {/* WhatsApp-style sticky/centered date separator */}
              <div className="flex items-center justify-center">
                <span className="px-3 py-1 rounded-full bg-slate-200/70 text-slate-700 text-[11px] font-bold tracking-tight">
                  {group.label}
                </span>
              </div>

              {/* Apple Settings-style grouped container */}
              <div className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-200/70 overflow-hidden">
                {group.items.map(item => {
                  const isExpanded = expandedId === item.id;
                  const isReconciled = item.status === 'reconciled';
                  const exceptionsTotal =
                    item.sickCount +
                    item.passCount +
                    item.detentionCount +
                    item.suspensionCount +
                    item.yetToReportCount +
                    item.absentCount;

                  return (
                    <div key={item.id} className="transition-colors">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="w-full text-left p-4 hover:bg-slate-50/70 active:bg-slate-100/70 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-950 tabular-nums">
                              {formatRC(item.courseNumber)}
                            </span>
                            <span className="text-xs font-medium text-slate-500">
                              Night Tattoo
                            </span>
                            <span className="text-xs text-slate-400 tabular-nums">
                              · {formatWATTime(item.updatedAt || item.createdAt)} WAT
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-xs tabular-nums">
                            <span className="text-slate-600">
                              Strength <strong className="text-slate-900">{item.declaredStrength}</strong>
                            </span>
                            <span className="text-slate-300">|</span>
                            <span className="text-emerald-700">
                              Present <strong>{item.presentCount}</strong>
                            </span>
                            <span className="text-slate-300">|</span>
                            <span className={exceptionsTotal > 0 ? 'text-amber-700' : 'text-slate-500'}>
                              Exc. <strong>{exceptionsTotal}</strong>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              isReconciled
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                : 'bg-amber-50 text-amber-700 border border-amber-200/80'
                            }`}
                          >
                            {isReconciled ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                            <span>{isReconciled ? 'Combined' : 'Awaiting Officer'}</span>
                          </span>
                          {isExpanded ? (
                            <ChevronUp size={16} className="text-slate-400" />
                          ) : (
                            <ChevronDown size={16} className="text-slate-400" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 bg-slate-50/70 border-t border-slate-100 space-y-3">
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2">
                            {[
                              { label: 'Absent', val: item.absentCount },
                              { label: 'Sick', val: item.sickCount },
                              { label: 'Pass', val: item.passCount },
                              { label: 'Detention', val: item.detentionCount },
                              { label: 'Suspension', val: item.suspensionCount },
                              { label: 'Yet to Rep.', val: item.yetToReportCount }
                            ].map(stat => (
                              <div
                                key={stat.label}
                                className="bg-white rounded-xl border border-slate-200/70 px-2.5 py-2 text-center"
                              >
                                <div className="text-[11px] text-slate-500 truncate">{stat.label}</div>
                                <div className="text-sm font-bold text-slate-900 tabular-nums">
                                  {stat.val}
                                </div>
                              </div>
                            ))}
                          </div>

                          {item.cadetDetails && item.cadetDetails.length > 0 && (
                            <div className="bg-white rounded-xl border border-slate-200/70 p-3 space-y-2">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                <Users size={13} />
                                <span>Tagged Female Cadets ({item.cadetDetails.length})</span>
                              </div>
                              <div className="divide-y divide-slate-100">
                                {item.cadetDetails.map((c, idx) => (
                                  <div
                                    key={`${c.name}-${idx}`}
                                    className="py-1.5 flex items-center justify-between text-xs"
                                  >
                                    <div>
                                      <span className="font-semibold text-slate-900">{c.name}</span>
                                      <span className="text-slate-400 ml-1.5">· {c.squad}</span>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold capitalize">
                                      {c.status.replace(/_/g, ' ')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
