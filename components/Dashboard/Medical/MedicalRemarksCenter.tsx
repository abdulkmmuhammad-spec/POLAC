import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  MessageSquare,
  CheckCheck,
  Clock,
  X
} from 'lucide-react';
import { dbService } from '../../../services/dbService';
import { SickbayVerification } from '../../../types';
import { formatRC } from '../../../utils/rcHelpers';
import { SickbayChatDrawer } from './SickbayChatDrawer';

type ThreadFilter = 'all' | 'open' | 'replied' | 'resolved';

const formatRelativeTimestamp = (isoDate?: string): string => {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const targetTime = date.getTime();

  if (targetTime >= todayStart) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (targetTime >= yesterdayStart) {
    return 'Yesterday';
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/**
 * MedicalRemarksCenter — Unified WhatsApp / Instagram DM conversation list
 * matching Commandant and Course Officer Remarks hubs (Jakob's Law).
 */
export const MedicalRemarksCenter: React.FC = () => {
  const [verifications, setVerifications] = useState<SickbayVerification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<ThreadFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeChat, setActiveChat] = useState<SickbayVerification | null>(null);

  const loadThreads = async () => {
    setIsLoading(true);
    try {
      const data = await dbService.fetchSickbayVerifications();
      const threads = data.filter(
        v =>
          v.status === 'not_admitted' ||
          Boolean(v.clinicalNote) ||
          (v.messages && v.messages.length > 0)
      );
      setVerifications(threads);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadThreads();
    const handler = () => loadThreads();
    window.addEventListener('sickbay-verifications-updated', handler);
    return () => window.removeEventListener('sickbay-verifications-updated', handler);
  }, []);

  const counts = useMemo(
    () => ({
      all: verifications.length,
      open: verifications.filter(v => (v.threadStatus || 'open') === 'open').length,
      replied: verifications.filter(v => v.threadStatus === 'replied').length,
      resolved: verifications.filter(v => v.threadStatus === 'resolved').length
    }),
    [verifications]
  );

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return verifications.filter(v => {
      const tStatus = v.threadStatus || 'open';
      if (filter !== 'all' && tStatus !== filter) return false;
      if (!q) return true;
      return (
        v.cadetName.toLowerCase().includes(q) ||
        (v.squad || '').toLowerCase().includes(q) ||
        (v.clinicalNote || '').toLowerCase().includes(q) ||
        `rc ${v.courseNumber}`.includes(q)
      );
    });
  }, [verifications, filter, searchTerm]);

  const recipientLabel = (role?: string) => {
    if (role === 'commandant') return 'Commandant';
    if (role === 'dfs') return 'DFS';
    if (role === 'course_officer') return 'Course Officer';
    return 'Leadership';
  };

  return (
    <div className="p-3 sm:p-5 space-y-4 pb-24 max-w-4xl mx-auto">
      {/* ── Top Search & Filter Toolbar (Same DM Pattern) ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-3 sm:p-4 space-y-3">
        <div className="relative flex items-center">
          <Search size={16} className="absolute left-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search cadet, RC, squad, or message..."
            className="w-full pl-10 pr-10 py-2.5 bg-slate-100/80 focus:bg-white border border-transparent focus:border-slate-300 rounded-full text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(
            [
              { key: 'all', label: 'All', count: counts.all, active: 'bg-slate-900 text-white' },
              { key: 'open', label: 'Open', count: counts.open, active: 'bg-rose-600 text-white' },
              { key: 'replied', label: 'Replied', count: counts.replied, active: 'bg-blue-600 text-white' },
              { key: 'resolved', label: 'Resolved', count: counts.resolved, active: 'bg-emerald-600 text-white' }
            ] as const
          ).map(pill => (
            <button
              key={pill.key}
              type="button"
              onClick={() => setFilter(pill.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap inline-flex items-center gap-1.5 ${
                filter === pill.key
                  ? pill.active
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <span>{pill.label}</span>
              <span className={`text-[11px] ${filter === pill.key ? 'opacity-80' : 'text-slate-400'}`}>
                {pill.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── DM Conversation List ── */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-medium">Loading conversations...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2.5">
          <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <MessageSquare size={22} />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">No medical remarks yet</h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Remarks sent when marking cadets Not Admitted will appear here as chat threads.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden divide-y divide-slate-100">
          {filtered.map(v => {
            const msgs = v.messages || [];
            const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
            const previewText = lastMsg?.text || v.clinicalNote || 'Marked Not Admitted';
            const tStatus = v.threadStatus || 'open';
            const isResolved = tStatus === 'resolved';
            const isReplied = tStatus === 'replied';

            const ringClass = isResolved
              ? 'bg-slate-100 text-slate-600'
              : isReplied
              ? 'bg-blue-50 text-blue-900 ring-2 ring-blue-600 ring-offset-2'
              : 'bg-rose-50 text-rose-700 ring-2 ring-rose-500 ring-offset-2';

            const monogram =
              v.targetedRecipientRole === 'dfs'
                ? 'DFS'
                : v.targetedRecipientRole === 'course_officer'
                ? `RC${v.courseNumber}`
                : 'CMD';

            return (
              <div
                key={v.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveChat(v)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveChat(v);
                  }
                }}
                className="px-4 py-3.5 flex items-center gap-3 hover:bg-slate-50/80 active:bg-slate-50 cursor-pointer transition-colors"
              >
                <div
                  className={`w-[46px] h-[46px] rounded-full flex items-center justify-center shrink-0 font-mono text-xs font-black tracking-tight ${ringClass}`}
                >
                  {monogram}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`truncate text-sm ${
                        isReplied ? 'font-black text-slate-950' : 'font-semibold text-slate-800'
                      }`}
                    >
                      {v.cadetName}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold shrink-0">
                      {formatRC(v.courseNumber)}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium truncate">
                      • To {recipientLabel(v.targetedRecipientRole)}
                    </span>
                  </div>
                  <p
                    className={`text-xs truncate mt-0.5 ${
                      isReplied ? 'text-slate-800 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {lastMsg && lastMsg.senderRole === 'medical_officer' ? 'You: ' : ''}
                    {previewText}
                  </p>
                </div>

                <div className="flex flex-col items-end justify-center gap-1 shrink-0 pl-1">
                  <span className="text-[11px] font-medium text-slate-400">
                    {formatRelativeTimestamp(lastMsg?.createdAt || v.verifiedAt || v.createdAt)}
                  </span>
                  {isReplied ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" title="New reply" />
                  ) : isResolved ? (
                    <CheckCheck size={14} className="text-emerald-600" />
                  ) : (
                    <Clock size={13} className="text-rose-500" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── WhatsApp-Style Chat Drawer ── */}
      <SickbayChatDrawer
        verification={activeChat}
        onClose={() => setActiveChat(null)}
        onUpdated={updated => {
          setVerifications(prev => prev.map(item => (item.id === updated.id ? updated : item)));
          setActiveChat(updated);
        }}
      />
    </div>
  );
};
