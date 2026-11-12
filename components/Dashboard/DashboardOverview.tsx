import React from 'react';
import { useLocation } from 'react-router-dom';
import { Users, CheckCircle, AlertCircle, Activity, Calendar, FileText, Zap, History, RefreshCcw, MessageSquarePlus, Flag, CheckCheck, Clock } from 'lucide-react';
import { StatCard } from '../StatCard';
import { AttendanceBarChart } from '../Charts';
import { useParade, CourseSummaryEntry } from '../../context/ParadeContext';
import { formatRC } from '../../utils/rcHelpers';
import { ParadeType } from '../../types';
import AtRiskCadetsWidget from './Commandant/AtRiskCadetsWidget';
import { ParadeRemarkDrawer, ParadeRemarkTarget } from './Commandant/ParadeRemarkDrawer';

const NetworkErrorFallback: React.FC<{ error: any, onRetry: () => void }> = ({ error, onRetry }) => {
    const [isRetrying, setIsRetrying] = React.useState(false);
    return (
        <div className="flex flex-col items-center justify-center p-12 bg-amber-50 rounded-2xl border border-amber-200 mt-6 shadow-sm">
            <AlertCircle size={48} className="text-amber-500 mb-4 animate-pulse" />
            <h3 className="text-xl font-black text-amber-900 uppercase tracking-widest mb-2">Network Connection Interrupted</h3>
            <p className="text-xs font-mono text-amber-700/70 mb-6 bg-white p-3 rounded-md shadow-inner border border-amber-100 max-w-lg text-center break-words">
                {error?.message || 'Database execution failure. Unable to resolve host or connect to gateway.'}
            </p>
            <button
                onClick={async () => {
                    setIsRetrying(true);
                    await onRetry();
                    setTimeout(() => setIsRetrying(false), 500);
                }}
                disabled={isRetrying}
                className="flex items-center gap-3 px-8 py-3.5 bg-amber-600 text-white text-xs font-black uppercase tracking-[0.2em] rounded-xl shadow-lg hover:bg-amber-700 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50 disabled:hover:translate-y-0"
            >
                {isRetrying ? <RefreshCcw className="animate-spin" size={16} /> : <Zap size={16} />}
                {isRetrying ? 'Reconnecting...' : 'Retry Connection'}
            </button>
        </div>
    );
};

export const DashboardOverview: React.FC = () => {
    const location = useLocation();
    const { records, remarks, stats, courseSummary, yesterdaySummary, activeDate, activeRC, selectedParadeType, setSelectedParadeType, isError, error, refetchRecords } = useParade();
    const [showYesterday, setShowYesterday] = React.useState(false);
    const [activeRemarkTarget, setActiveRemarkTarget] = React.useState<ParadeRemarkTarget | null>(null);
    const [focusRemarkLog, setFocusRemarkLog] = React.useState(false);

    const openTargetFromRemarkPayload = React.useCallback(
        (payload: {
            submissionId?: string | number;
            remarkId?: string;
            courseNumber?: number;
            paradeType?: ParadeType | string;
            remark?: any;
            focusLog?: boolean;
        }) => {
            if (!payload) return;
            const matchedRemark =
                payload.remark ||
                (payload.remarkId
                    ? remarks.find(r => String(r.id) === String(payload.remarkId))
                    : undefined) ||
                (payload.submissionId
                    ? remarks.find(r => String(r.submissionId) === String(payload.submissionId))
                    : undefined) ||
                (payload.courseNumber
                    ? remarks.find(r => Number(r.courseNumber) === Number(payload.courseNumber))
                    : undefined);

            const subId = payload.submissionId || matchedRemark?.submissionId;
            if (subId) {
                const recordMatch = records.find(r => String(r.id) === String(subId));
                if (recordMatch) {
                    setFocusRemarkLog(Boolean(payload.focusLog ?? true));
                    setActiveRemarkTarget(recordMatch);
                    return;
                }
            }

            const cNum = payload.courseNumber || matchedRemark?.courseNumber;
            if (cNum) {
                const cEntry =
                    courseSummary.find(c => Number(c.courseNumber) === Number(cNum)) ||
                    yesterdaySummary.find(c => Number(c.courseNumber) === Number(cNum));
                if (cEntry?.latestSubmission) {
                    setFocusRemarkLog(Boolean(payload.focusLog ?? true));
                    setActiveRemarkTarget(cEntry.latestSubmission);
                    return;
                }
                if (cEntry) {
                    setFocusRemarkLog(Boolean(payload.focusLog ?? true));
                    setActiveRemarkTarget({
                        id: subId || `${cEntry.courseNumber}-${matchedRemark?.paradeDate || activeDate}-${matchedRemark?.paradeType || selectedParadeType}`,
                        officerName: matchedRemark?.courseOfficerName || `${formatRC(cEntry.courseNumber)} Course Officer`,
                        courseNumber: cEntry.courseNumber,
                        yearGroup: cEntry.currentLevel,
                        date: matchedRemark?.paradeDate || activeDate,
                        paradeType: matchedRemark?.paradeType || selectedParadeType,
                        presentCount: cEntry.present,
                        absentCount: cEntry.absent,
                        sickCount: cEntry.sick,
                        detentionCount: cEntry.detention,
                        passCount: cEntry.pass,
                        suspensionCount: cEntry.suspension,
                        yetToReportCount: cEntry.yet_to_report,
                        grandTotal: cEntry.total
                    });
                    return;
                }
            }

            if (matchedRemark) {
                setFocusRemarkLog(Boolean(payload.focusLog ?? true));
                setActiveRemarkTarget({
                    id: matchedRemark.submissionId,
                    officerName: matchedRemark.courseOfficerName || `${formatRC(matchedRemark.courseNumber)} Course Officer`,
                    courseNumber: matchedRemark.courseNumber,
                    date: matchedRemark.paradeDate || activeDate,
                    paradeType: matchedRemark.paradeType || selectedParadeType,
                    presentCount: 0,
                    absentCount: 0,
                    sickCount: 0,
                    detentionCount: 0,
                    grandTotal: 0
                });
            }
        },
        [remarks, records, courseSummary, yesterdaySummary, activeDate, selectedParadeType]
    );

    React.useEffect(() => {
        const navState = location.state as any;
        if (navState && (navState.openRemarkSubmissionId || navState.remarkId || navState.focusLog)) {
            openTargetFromRemarkPayload({
                submissionId: navState.openRemarkSubmissionId,
                remarkId: navState.remarkId,
                courseNumber: navState.courseNumber,
                paradeType: navState.paradeType,
                focusLog: true
            });
        }
    }, [location.state, openTargetFromRemarkPayload]);

    React.useEffect(() => {
        const handleOpenDrawerEvent = (e: Event) => {
            const customEvt = e as CustomEvent;
            if (customEvt.detail) {
                openTargetFromRemarkPayload(customEvt.detail);
            }
        };
        window.addEventListener('open-parade-remark-drawer', handleOpenDrawerEvent);
        return () => window.removeEventListener('open-parade-remark-drawer', handleOpenDrawerEvent);
    }, [openTargetFromRemarkPayload]);

    const openCourseRemarkDrawer = (c: CourseSummaryEntry) => {
        setFocusRemarkLog(false);
        if (c.latestSubmission) {
            setActiveRemarkTarget(c.latestSubmission);
            return;
        }
        // Fallback synthesis if aggregated without direct latestSubmission reference
        const fallbackDate = showYesterday
            ? (() => {
                  const d = new Date(activeDate);
                  d.setDate(d.getDate() - 1);
                  return d.toISOString().split('T')[0];
              })()
            : activeDate;
        setActiveRemarkTarget({
            id: `${c.courseNumber}-${fallbackDate}-${selectedParadeType}`,
            officerName: `${formatRC(c.courseNumber)} Course Officer`,
            courseNumber: c.courseNumber,
            yearGroup: c.currentLevel,
            date: fallbackDate,
            paradeType: selectedParadeType,
            presentCount: c.present,
            absentCount: c.absent,
            sickCount: c.sick,
            detentionCount: c.detention,
            passCount: c.pass,
            suspensionCount: c.suspension,
            yetToReportCount: c.yet_to_report,
            grandTotal: c.total
        });
    };

    const getSubmissionRemarkSummary = (submissionId?: string | number) => {
        if (!submissionId) return { total: 0, pending: 0, addressed: 0, resolved: 0 };
        const matched = remarks.filter(r => String(r.submissionId) === String(submissionId));
        return {
            total: matched.length,
            pending: matched.filter(r => r.status === 'pending' && !r.officerResponse).length,
            addressed: matched.filter(r => r.status === 'addressed' || (r.status === 'pending' && Boolean(r.officerResponse))).length,
            resolved: matched.filter(r => r.status === 'resolved').length
        };
    };

    // Auto-detect if today's data has arrived and reset yesterday view
    React.useEffect(() => {
        if (courseSummary.length > 0 && showYesterday) {
            setShowYesterday(false);
        }
    }, [courseSummary.length, showYesterday]);

    const displayData = showYesterday ? yesterdaySummary : courseSummary;
    const isTodayEmpty = courseSummary.length === 0;

    const chartData = [
        { name: 'Present', value: Math.round(stats.totalCadets * (stats.presentToday / 100)), color: '#3b82f6' },
        { name: 'Absent', value: stats.absentThisWeek, color: '#f59e0b' },
        { name: 'Sick', value: stats.sickCadets, color: '#f43f5e' },
        { name: 'Detention', value: records.reduce((sum, r) => sum + r.detentionCount, 0), color: '#6366f1' },
    ];


    const paradeTypes = [
        { id: ParadeType.MUSTER, label: 'MUSTER', icon: '☀️' },
        { id: ParadeType.SPECIAL, label: 'SPECIAL', icon: '⚡' },
        { id: ParadeType.TATTOO, label: 'TATTOO', icon: '🌙' },
    ];

    // Format active date safely
    const formattedActiveDate = React.useMemo(() => {
        if (!activeDate) return '';
        const [year, month, day] = activeDate.split('-');
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        return dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }, [activeDate]);

    if (isError) {
        return <NetworkErrorFallback error={error} onRetry={refetchRecords} />;
    }

    return (
        <div className="space-y-6 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                <StatCard label="total strength" value={stats.totalCadets} icon={<Users />} color="blue" />
                <StatCard label="present today" value={`${stats.presentToday}%`} icon={<CheckCircle />} color="green" />
                <StatCard label="weekly absence" value={stats.absentThisWeek} icon={<AlertCircle />} color="orange" />
                <StatCard label="cadets in sickbay" value={stats.sickCadets} icon={<Activity />} color="red" />
            </div>

            {/* Antigravity Module: At-Risk Cadets Widget */}
            <AtRiskCadetsWidget />

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-5 border-b bg-slate-50/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-blue-900 flex items-center justify-center text-white shadow-sm border border-blue-950">
                            <Zap size={18} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-blue-900 uppercase tracking-[0.2em] mb-0.5">
                                Tactical Summary • {showYesterday ? 'ARCHIVE DATA' : `Today ${formattedActiveDate}`}
                            </p>
                            <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm">
                                {selectedParadeType} FORMATION STATE {showYesterday && '(YESTERDAY)'}
                            </h3>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-200/50 p-1 rounded-md border border-slate-200 w-full md:w-auto">
                        {paradeTypes.map((type) => (
                            <button
                                key={type.id}
                                onClick={() => setSelectedParadeType(type.id)}
                                className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-3 sm:px-5 py-2.5 md:py-2 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all ${selectedParadeType === type.id
                                    ? 'bg-blue-900 text-white shadow-md'
                                    : 'text-slate-500 hover:text-slate-800'
                                    }`}
                            >
                                {type.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    {/* Desktop Table View */}
                    <table className="w-full text-sm text-left hidden md:table">
                        <thead className="bg-blue-900 text-white">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">REGULAR COURSE</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-center">LEVEL</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">PRESENT</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">ABSENT</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">SICK</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">DETENTION</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">PASS</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">SUSPENSION</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">YET TO REPORT</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">TOTAL</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">COMMAND ACTION</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {displayData.map(c => {
                                const subId = c.latestSubmission?.id;
                                const rSummary = getSubmissionRemarkSummary(subId);
                                return (
                                    <tr key={c.courseNumber} className="hover:bg-slate-50 border-l-[3px] border-l-transparent hover:border-l-blue-900 transition-all font-mono">
                                        <td className="px-6 py-4 font-black">
                                            <span className="text-blue-900 tracking-tighter">
                                                {formatRC(c.courseNumber)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 font-bold text-center">Terma {c.currentLevel}</td>
                                        <td className="px-6 py-4 text-emerald-600 font-black text-right">{c.present}</td>
                                        <td className="px-6 py-4 text-rose-600 font-black text-right">{c.absent}</td>
                                        <td className="px-6 py-4 text-amber-600 font-black text-right">{c.sick}</td>
                                        <td className="px-6 py-4 text-indigo-600 font-black text-right">{c.detention}</td>
                                        <td className="px-6 py-4 text-cyan-600 font-black text-right">{c.pass}</td>
                                        <td className="px-6 py-4 text-slate-500 font-black text-right">{c.suspension}</td>
                                        <td className="px-6 py-4 text-orange-600 font-black text-right">{c.yet_to_report}</td>
                                        <td className="px-6 py-4 font-black text-slate-900 text-right bg-slate-50/30">{c.total}</td>
                                        <td className="px-6 py-4 text-right font-sans">
                                            <div className="inline-flex items-center justify-end gap-2">
                                                {rSummary.addressed > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-blue-100 text-blue-800 border border-blue-200" title="Course Officer responded">
                                                        <Clock size={10} /> Reply ({rSummary.addressed})
                                                    </span>
                                                )}
                                                {rSummary.pending > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300" title="Pending Course Officer review">
                                                        Pending ({rSummary.pending})
                                                    </span>
                                                )}
                                                {rSummary.total > 0 && rSummary.pending === 0 && rSummary.addressed === 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                        <CheckCheck size={10} /> Resolved
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => openCourseRemarkDrawer(c)}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border shadow-2xs ${
                                                        c.absent > 0
                                                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                                                            : 'bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-900 border-slate-200 hover:border-blue-200'
                                                    }`}
                                                >
                                                    {c.absent > 0 ? <Flag size={12} /> : <MessageSquarePlus size={12} />}
                                                    <span>{c.absent > 0 ? 'Flag Absence' : 'Add Remark'}</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {displayData.length === 0 && (
                                <tr>
                                    <td colSpan={11} className="px-6 py-24 text-center">
                                        {isTodayEmpty && !showYesterday ? (
                                            <div className="flex flex-col items-center justify-center max-w-md mx-auto p-8 bg-blue-50/50 rounded-2xl border border-blue-100 shadow-[inset_0_2px_10px_rgba(30,58,138,0.03)] animate-in fade-in slide-in-from-bottom-2 duration-700">
                                                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 shadow-sm border border-blue-200">
                                                    <Calendar size={32} />
                                                </div>
                                                <h4 className="text-lg font-black text-blue-950 uppercase tracking-tight mb-2">No Command Returns Available</h4>
                                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 leading-relaxed">
                                                    There are currently no parade states submitted for {selectedParadeType} formation today. Officers may not have completed their daily submissions yet.
                                                </p>
                                                <button 
                                                    onClick={() => setShowYesterday(true)}
                                                    className="group flex items-center gap-3 px-8 py-3.5 bg-blue-900 text-white text-xs font-black uppercase tracking-[0.2em] rounded-xl shadow-xl hover:bg-blue-800 hover:shadow-blue-900/30 hover:-translate-y-0.5 transition-all active:scale-95 border border-blue-700"
                                                >
                                                    <History size={16} className="group-hover:-rotate-45 transition-transform duration-300" />
                                                    View Yesterday's Archive
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-3 opacity-60">
                                                <AlertCircle size={24} className="text-slate-400" />
                                                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] italic">No Historical Data Available in Command Buffer</p>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    {/* Mobile List/Card View */}
                    <div className="md:hidden divide-y divide-slate-100">
                        {displayData.map((item: any, idx) => {
                            const rcLabel = formatRC(item.courseNumber);
                            const yearLabel = item.currentLevel;
                            return (
                                <div key={idx} className="p-4 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="bg-blue-900 text-white text-xs font-black px-2 py-0.5 rounded-sm uppercase tracking-tighter font-mono">
                                                {rcLabel}
                                            </span>
                                            <span className="text-xs font-black text-slate-500 tracking-widest">Terma {yearLabel}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Strength</span>
                                            <span className="text-base font-black text-slate-900 font-mono tracking-tighter">{item.total}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex items-center justify-between min-w-0">
                                            <span className="text-xs font-black text-slate-500 uppercase tracking-tight truncate pr-1">Present</span>
                                            <span className="text-sm font-black text-emerald-600 font-mono shrink-0">{item.present}</span>
                                        </div>
                                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex items-center justify-between min-w-0">
                                            <span className="text-xs font-black text-slate-500 uppercase tracking-tight truncate pr-1">Absent</span>
                                            <span className="text-sm font-black text-rose-600 font-mono shrink-0">{item.absent}</span>
                                        </div>
                                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex items-center justify-between min-w-0">
                                            <span className="text-xs font-black text-slate-500 uppercase tracking-tight truncate pr-1">Sick Bay</span>
                                            <span className="text-sm font-black text-amber-600 font-mono shrink-0">{item.sick}</span>
                                        </div>
                                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex items-center justify-between min-w-0">
                                            <span className="text-xs font-black text-slate-500 uppercase tracking-tight truncate pr-1">Detention</span>
                                            <span className="text-sm font-black text-indigo-600 font-mono shrink-0">{item.detention}</span>
                                        </div>
                                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex items-center justify-between min-w-0">
                                            <span className="text-xs font-black text-slate-500 uppercase tracking-tight truncate pr-1">On Permission</span>
                                            <span className="text-sm font-black text-cyan-600 font-mono shrink-0">{item.pass}</span>
                                        </div>
                                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex items-center justify-between min-w-0">
                                            <span className="text-xs font-black text-slate-500 uppercase tracking-tight truncate pr-1">Suspension</span>
                                            <span className="text-sm font-black text-slate-600 font-mono shrink-0">{item.suspension}</span>
                                        </div>
                                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex items-center justify-between col-span-2 min-w-0">
                                            <span className="text-xs font-black text-slate-500 uppercase tracking-tight truncate pr-1">Yet to Report</span>
                                            <span className="text-sm font-black text-orange-600 font-mono shrink-0">{item.yet_to_report}</span>
                                        </div>
                                    </div>
                                    <div className="pt-1 flex items-center justify-between gap-2">
                                        {(() => {
                                            const rSum = getSubmissionRemarkSummary(item.latestSubmission?.id);
                                            if (rSum.addressed > 0) {
                                                return (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-800 border border-blue-200">
                                                        <Clock size={11} /> Officer Replied ({rSum.addressed})
                                                    </span>
                                                );
                                            }
                                            if (rSum.pending > 0) {
                                                return (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300">
                                                        Pending Review ({rSum.pending})
                                                    </span>
                                                );
                                            }
                                            if (rSum.resolved > 0) {
                                                return (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                        <CheckCheck size={11} /> Resolved
                                                    </span>
                                                );
                                            }
                                            return <span className="text-[10px] font-bold text-slate-400 uppercase">Parade Review</span>;
                                        })()}
                                        <button
                                            type="button"
                                            onClick={() => openCourseRemarkDrawer(item)}
                                            className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                                                item.absent > 0
                                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                    : 'bg-blue-50 text-blue-900 border-blue-200'
                                            }`}
                                        >
                                            {item.absent > 0 ? <Flag size={12} /> : <MessageSquarePlus size={12} />}
                                            <span>{item.absent > 0 ? 'Flag Absence' : 'Add Remark'}</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {displayData.length === 0 && (
                            <div className="p-8 text-center pb-12">
                                {isTodayEmpty && !showYesterday ? (
                                    <div className="flex flex-col items-center gap-4 bg-blue-50/50 p-6 rounded-2xl border border-blue-100 shadow-[inset_0_2px_10px_rgba(30,58,138,0.03)] animate-in fade-in zoom-in-95 duration-500">
                                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shadow-sm border border-blue-200">
                                            <Calendar size={24} />
                                        </div>
                                        <div className="space-y-1">
                                            <h5 className="font-black text-blue-950 uppercase tracking-tight text-base">Awaiting Submissions</h5>
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                                                No returns for {selectedParadeType} formation today.
                                            </p>
                                        </div>
                                        <button 
                                            onClick={() => setShowYesterday(true)}
                                            className="mt-2 w-full flex justify-center items-center gap-2 px-5 py-3 bg-blue-900 text-white text-xs font-black uppercase tracking-[0.2em] rounded-xl shadow-lg active:scale-95 transition-transform"
                                        >
                                            <History size={16} />
                                            View Archive
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 opacity-60 pt-4">
                                        <AlertCircle size={24} className="text-slate-400" />
                                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest italic">No Historical Data</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                <AttendanceBarChart
                    title="SYSTEM ANALYTIC TRENDS"
                    data={chartData}
                />
                <div className="hidden md:block bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-6 sm:mb-8">
                        <div>
                            <p className="text-[9px] font-black text-blue-900 uppercase tracking-[0.2em] mb-1">Queue Traffic</p>
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Recent Ingress logs</h3>
                        </div>
                        <Calendar size={16} className="text-slate-300" />
                    </div>
                    <div className="space-y-3">
                        {records.slice(0, 5).map(r => {
                            const rSum = getSubmissionRemarkSummary(r.id);
                            return (
                                <div key={r.id} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-md border border-slate-200 group hover:border-blue-300 transition-all font-mono gap-3">
                                    <div className="flex items-center space-x-4 min-w-0">
                                        <div className="w-9 h-9 shrink-0 rounded bg-white border border-slate-200 flex items-center justify-center text-slate-400 shadow-sm group-hover:bg-blue-900 group-hover:text-white transition-colors">
                                            <FileText size={16} />
                                        </div>
                                        <div className="truncate">
                                            <div className="flex items-center gap-2">
                                                <p className="font-black text-slate-900 text-[11px] uppercase tracking-tighter truncate">{r.officerName}</p>
                                                {rSum.pending > 0 && (
                                                    <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[8px] font-sans font-black uppercase">
                                                        Flagged
                                                    </span>
                                                )}
                                                {rSum.addressed > 0 && (
                                                    <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 border border-blue-200 text-[8px] font-sans font-black uppercase">
                                                        Replied
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                                {r.courseNumber ? formatRC(r.courseNumber) : r.courseName} <span className="mx-1 opacity-30">|</span> {r.paradeType}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="text-right">
                                            <p className="text-[11px] font-black text-blue-900 uppercase tracking-tighter">{r.presentCount} / {r.grandTotal}</p>
                                            <p className="text-[8px] font-black text-slate-400 uppercase">{new Date(r.date).toLocaleDateString()}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setActiveRemarkTarget(r)}
                                            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-900 border border-slate-200 hover:border-blue-300 text-[9px] font-sans font-black uppercase tracking-wider flex items-center gap-1 transition-all shadow-2xs"
                                            title="Add Remark or Flag Absence"
                                        >
                                            <MessageSquarePlus size={12} />
                                            <span>Remark</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {records.length === 0 && (
                            <div className="text-center py-12 border border-dashed border-slate-200 rounded-md">
                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No Active Records in Buffer</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <ParadeRemarkDrawer
                submission={activeRemarkTarget}
                isOpen={Boolean(activeRemarkTarget)}
                onClose={() => {
                    setActiveRemarkTarget(null);
                    setFocusRemarkLog(false);
                }}
                focusLog={focusRemarkLog}
            />
        </div>
    );
};
