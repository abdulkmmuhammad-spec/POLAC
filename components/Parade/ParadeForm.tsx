import React, { useState } from 'react';
import { Plus, Trash2, RefreshCcw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useParade } from '../../context/ParadeContext';
import { ParadeType, CadetStatus, CadetDetail } from '../../types';
import { dbService } from '../../services/dbService';
import { CadetSelector } from '../CadetRegistry/CadetSelector';
import { formatRC } from '../../utils/rcHelpers';
import { toast } from 'react-hot-toast';
import { SubmissionPreview } from '../Common/SubmissionPreview';

export const ParadeForm: React.FC = () => {
const { currentUser } = useAuth();
    const { isDataLoading, refreshData, getLevelForCourse, activeRC, submissionSettings } = useParade();

    const getWATDateStr = () => {
        const now = new Date();
        const watOffsetMs = 60 * 60 * 1000;
        return new Date(now.getTime() + watOffsetMs).toISOString().split('T')[0];
    };

    const [formDate, setFormDate] = useState(getWATDateStr());
    const [formParadeType, setFormParadeType] = useState<ParadeType>(ParadeType.MUSTER);
    const [counts, setCounts] = useState({
        present: currentUser?.totalCadets || 0,
        absent: 0,
        sick: 0,
        detention: 0,
        pass: 0,
        suspension: 0,
        yetToReport: 0
    });
    const [tempCadet, setTempCadet] = useState<CadetDetail>({ name: '', squad: '', status: CadetStatus.ABSENT });
    const [cadetDetailsList, setCadetDetailsList] = useState<CadetDetail[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewData, setPreviewData] = useState<any>(null);

    // Ledger Local State
    const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'ABSENT' | 'SICK' | string>('ALL');
    const [ledgerSearch, setLedgerSearch] = useState<string>('');
    const [currentPage, setCurrentPage] = useState<number>(1);
    const ITEMS_PER_PAGE = 10;

    // Determine the officer's course number — fall back to activeRC if needed
    const officerCourseNumber = currentUser?.courseNumber
        ?? (currentUser?.yearGroup ? (activeRC - currentUser.yearGroup + 1) : activeRC);

    const handleQuickAdd = (status: CadetStatus) => {
        if (!tempCadet.name || !tempCadet.squad) {
            toast.error("Please select or enter a cadet first.");
            return;
        }

        // Prevent duplicate names in the non-present list
        const isDuplicate = cadetDetailsList.some(
            c => c.name.toLowerCase() === tempCadet.name.toLowerCase()
        );

        if (isDuplicate) {
            toast.error(`${tempCadet.name} is already in the list.`);
            return;
        }

        // LIFO Insertion: Prepend new cadet so it appears at top of Page 1
        setCadetDetailsList([{ ...tempCadet, status }, ...cadetDetailsList]);
        setTempCadet({ name: '', squad: '', status: CadetStatus.ABSENT });
        setCurrentPage(1);
    };

    const handleSubmission = () => {
        if (!currentUser) return;
        const total = counts.present + counts.absent + counts.sick + counts.detention +
            counts.pass + counts.suspension + counts.yetToReport;

        if (total !== currentUser.totalCadets) {
            toast.error(`Error: Total count (${total}) must match your total cadets (${currentUser.totalCadets})`);
            return;
        }

        const neededDetails = counts.absent + counts.sick + counts.detention +
            counts.pass + counts.suspension + counts.yetToReport;
        if (cadetDetailsList.length !== neededDetails) {
            toast.error(`Please provide details for all ${neededDetails} cadets with non-present status.`);
            return;
        }

        // Prepare data for preview
        const data = {
            officerId: currentUser.id,
            officerName: currentUser.fullName,
            courseName: currentUser.courseName || '',
            yearGroup: currentUser.yearGroup || 1,
            courseNumber: officerCourseNumber,
            date: formDate,
            paradeType: formParadeType,
            presentCount: counts.present,
            absentCount: counts.absent,
            sickCount: counts.sick,
            detentionCount: counts.detention,
            passCount: counts.pass,
            suspensionCount: counts.suspension,
            yetToReportCount: counts.yetToReport,
            grandTotal: total,
            cadets: cadetDetailsList
        };

        setPreviewData(data);
        setShowPreview(true);
    };

    const commitSubmission = async () => {
        if (!previewData || !currentUser) return;

        // ──── Submission Guards ───────────────────────────────────────────────

        // 1. Time Window Enforcement (only for "today")
        const today = getWATDateStr();
        if (formDate === today) {
            const currentHour = new Date().getHours();
            const { musterStartHour, musterEndHour, tattooStartHour } = submissionSettings;

            if (formParadeType === ParadeType.MUSTER && (currentHour < musterStartHour || currentHour >= musterEndHour)) {
                toast.error(`Morning Muster can only be submitted between ${String(musterStartHour).padStart(2, '0')}:00 and ${String(musterEndHour - 1).padStart(2, '0')}:59.`);
                setShowPreview(false);
                return;
            }

            if (formParadeType === ParadeType.TATTOO && (currentHour < tattooStartHour)) {
                toast.error(`Night Tattoo can only be submitted from ${String(tattooStartHour).padStart(2, '0')}:00 onwards.`);
                setShowPreview(false);
                return;
            }
        }

        // 2. Duplicate Detection
        setIsSubmitting(true);
        try {
            const alreadySubmitted = await dbService.checkDuplicateParade(
                currentUser.id,
                formDate,
                formParadeType
            );

            if (alreadySubmitted) {
                const label = formParadeType === ParadeType.MUSTER
                    ? 'Morning Muster'
                    : formParadeType === ParadeType.TATTOO
                        ? 'Night Tattoo'
                        : 'Special Parade';
                toast.error(`A ${label} state has already been submitted for ${formDate}.`);
                setIsSubmitting(false);
                setShowPreview(false);
                return;
            }

            await dbService.saveRecord(previewData);

            setCounts({
                present: currentUser.totalCadets || 0,
                absent: 0,
                sick: 0,
                detention: 0,
                pass: 0,
                suspension: 0,
                yetToReport: 0
            });
            setCadetDetailsList([]);
            setShowPreview(false);
            setPreviewData(null);
            await refreshData();
            toast.success('Parade State submitted successfully!');
        } catch (error) {
            toast.error('Submission failed. Try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const levelLabel = officerCourseNumber
        ? `${formatRC(officerCourseNumber)} — YEAR ${getLevelForCourse(officerCourseNumber)}`
        : '';

    // Filtered & Paginated Ledger list
    const filteredCadets = cadetDetailsList.filter(cadet => {
        const matchesFilter = ledgerFilter === 'ALL' || cadet.status === ledgerFilter;
        const matchesSearch = !ledgerSearch.trim() ||
            cadet.name.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
            cadet.squad.toLowerCase().includes(ledgerSearch.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const totalPages = Math.ceil(filteredCadets.length / ITEMS_PER_PAGE) || 1;
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
    const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    const paginatedCadets = filteredCadets.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const filterTabs = [
        { id: 'ALL', label: 'All', count: cadetDetailsList.length },
        { id: CadetStatus.ABSENT, label: 'Absent', count: cadetDetailsList.filter(c => c.status === CadetStatus.ABSENT).length },
        { id: CadetStatus.SICK, label: 'Sick', count: cadetDetailsList.filter(c => c.status === CadetStatus.SICK).length },
        { id: CadetStatus.DETENTION, label: 'Detent', count: cadetDetailsList.filter(c => c.status === CadetStatus.DETENTION).length },
        { id: CadetStatus.PASS, label: 'Pass', count: cadetDetailsList.filter(c => c.status === CadetStatus.PASS).length },
        { id: CadetStatus.SUSPENSION, label: 'Susp', count: cadetDetailsList.filter(c => c.status === CadetStatus.SUSPENSION).length },
        { id: CadetStatus.YET_TO_REPORT, label: 'YTR', count: cadetDetailsList.filter(c => c.status === CadetStatus.YET_TO_REPORT).length },
    ];

    return (
        <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="p-6 md:p-8 bg-blue-900 text-white">
                <h3 className="text-xl font-bold">New Parade Submission</h3>
                <p className="text-blue-200 text-sm">
                    Cadet Accountability Form
                    {levelLabel && <span className="ml-2 bg-blue-700 px-3 py-0.5 rounded-full text-xs font-bold">{levelLabel}</span>}
                </p>
            </div>

            <div className="p-4 md:p-8 space-y-6 md:space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Parade Date</label>
                        <input
                            type="date"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={formDate}
                            onChange={(e) => setFormDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Parade Type</label>
                        <select
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={formParadeType}
                            onChange={(e) => setFormParadeType(e.target.value as ParadeType)}
                        >
                            <option value={ParadeType.MUSTER}>Morning Muster</option>
                            <option value={ParadeType.TATTOO}>Night Tattoo</option>
                            <option value={ParadeType.SPECIAL}>Special Parade</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Primary Status: Present (Auto-calculated) */}
                    <div className={`p-6 rounded-3xl border-2 transition-all shadow-sm ${counts.present < 0 ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
                        <label className={`text-xs font-black uppercase tracking-widest mb-2 block ${counts.present < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            Cadet Present (Calculated)
                        </label>
                        <div className="flex items-baseline gap-2">
                            <span className={`text-4xl font-black ${counts.present < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {counts.present}
                            </span>
                            <span className="text-slate-400 font-bold text-sm">/ {currentUser?.totalCadets || 0}</span>
                        </div>
                        {counts.present < 0 && (
                            <p className="text-[10px] font-bold text-rose-500 mt-2 italic">Error: Total exceeds assigned cadets!</p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Standard Absence Column */}
                        <div className="space-y-3">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Excused / Unexcused</p>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                {(['absent', 'sick', 'detention'] as const).map(key => (
                                    <div key={key} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 focus-within:border-blue-200 transition-colors">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-1 block truncate">{key === 'detention' ? 'Detent.' : key}</label>
                                        <input
                                            type="number"
                                            className="w-full bg-transparent text-lg font-bold text-slate-800 outline-none"
                                            value={counts[key]}
                                            onChange={(e) => {
                                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                                const newCounts = { ...counts, [key]: val };
                                                const nonPresentSum = newCounts.absent + newCounts.sick + newCounts.detention +
                                                    newCounts.pass + newCounts.suspension + newCounts.yetToReport;
                                                setCounts({
                                                    ...newCounts,
                                                    present: (currentUser?.totalCadets || 0) - nonPresentSum
                                                });
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Secondary Status Column */}
                        <div className="space-y-3">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Secondary States</p>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                {([{ key: 'pass', label: 'Pass' }, { key: 'suspension', label: 'Susp.' }, { key: 'yetToReport', label: 'YTR' }] as const).map(item => (
                                    <div key={item.key} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 focus-within:border-blue-200 transition-colors">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-1 block truncate">{item.label}</label>
                                        <input
                                            type="number"
                                            className="w-full bg-transparent text-lg font-bold text-slate-800 outline-none"
                                            value={counts[item.key as keyof typeof counts]}
                                            onChange={(e) => {
                                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                                const newCounts = { ...counts, [item.key]: val };
                                                const nonPresentSum = newCounts.absent + newCounts.sick + newCounts.detention +
                                                    newCounts.pass + newCounts.suspension + newCounts.yetToReport;
                                                setCounts({
                                                    ...newCounts,
                                                    present: (currentUser?.totalCadets || 0) - nonPresentSum
                                                });
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-slate-100">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
                        <h4 className="font-bold text-slate-800">Nominal Roll (Non-Present Cadets)</h4>
                        
                        {/* COMPACT INLINE TRACKER */}
                        <div className="flex flex-wrap items-center gap-2">
                            {([
                                { key: 'absent', status: CadetStatus.ABSENT, label: 'Abs', color: 'rose' },
                                { key: 'sick', status: CadetStatus.SICK, label: 'Sick', color: 'amber' },
                                { key: 'detention', status: CadetStatus.DETENTION, label: 'Det', color: 'indigo' },
                                { key: 'pass', status: CadetStatus.PASS, label: 'Pass', color: 'purple' },
                                { key: 'suspension', status: CadetStatus.SUSPENSION, label: 'Susp', color: 'slate' },
                                { key: 'yetToReport', status: CadetStatus.YET_TO_REPORT, label: 'YTR', color: 'cyan' },
                            ] as const).map(item => {
                                const required = counts[item.key as keyof typeof counts] as number;
                                if (required === 0) return null;
                                const added = cadetDetailsList.filter(c => c.status === item.status).length;
                                const isComplete = added === required;
                                const isOver = added > required;
                                
                                return (
                                    <div key={item.key} className={`px-2 py-1 rounded flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider border transition-all ${isOver ? 'border-rose-400 bg-rose-50 text-rose-600' : isComplete ? 'border-emerald-400 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                                        <span>{item.label}</span>
                                        <span className={`px-1.5 py-0.5 rounded ${isOver ? 'bg-rose-200 text-rose-800' : isComplete ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{added}/{required}</span>
                                    </div>
                                );
                            })}
                            <div className="px-2 py-1 rounded flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider border border-blue-200 bg-blue-50 text-blue-700 ml-1">
                                <span>TOTAL</span>
                                <span className="bg-blue-200 text-blue-900 px-1.5 py-0.5 rounded">{cadetDetailsList.length}/{counts.absent + counts.sick + counts.detention + counts.pass + counts.suspension + counts.yetToReport}</span>
                            </div>
                        </div>
                    </div>

                    {/* COMPACT SEARCH & QUICK-ADD ACTION BAR */}
                    <div className="mb-6 bg-slate-50/50 p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <CadetSelector
                            courseNumber={officerCourseNumber}
                            onSelect={(cadet) => setTempCadet({ ...tempCadet, name: cadet.name, squad: cadet.squad })}
                            onInputChange={(name) => setTempCadet(prev => ({ ...prev, name, squad: '' }))}
                        />

                        {/* COMPACT CONFIRMATION PREVIEW */}
                        <div className={`overflow-hidden transition-all duration-300 ${tempCadet.name ? 'max-h-20 opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`}>
                            <div className="flex items-center gap-3 bg-blue-50/80 p-2.5 rounded-xl border border-blue-100 shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]">
                                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-inner shrink-0">
                                    {tempCadet.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 truncate">
                                    <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest leading-none mb-0.5">Target Cadet</p>
                                    <p className="text-sm font-bold text-slate-800 truncate">
                                        {tempCadet.name} <span className="text-slate-500 font-medium text-xs ml-1">• {tempCadet.squad || 'Squad Unknown'}</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        <div className={`mt-3 flex flex-wrap gap-2 transition-all duration-300 ${tempCadet.name ? 'opacity-100' : 'opacity-40 grayscale pointer-events-none'}`}>
                            <button onClick={() => handleQuickAdd(CadetStatus.ABSENT)} className="flex-1 min-w-[70px] py-2 rounded-xl bg-white text-rose-600 hover:bg-rose-50 font-black text-[9px] sm:text-[10px] uppercase tracking-wider border border-rose-200 shadow-sm transition-all active:scale-95 flex justify-center items-center gap-1">
                                <Plus size={14} /> Absent
                            </button>
                            <button onClick={() => handleQuickAdd(CadetStatus.SICK)} className="flex-1 min-w-[70px] py-2 rounded-xl bg-white text-amber-600 hover:bg-amber-50 font-black text-[9px] sm:text-[10px] uppercase tracking-wider border border-amber-200 shadow-sm transition-all active:scale-95 flex justify-center items-center gap-1">
                                <Plus size={14} /> Sick
                            </button>
                            <button onClick={() => handleQuickAdd(CadetStatus.DETENTION)} className="flex-1 min-w-[70px] py-2 rounded-xl bg-white text-indigo-600 hover:bg-indigo-50 font-black text-[9px] sm:text-[10px] uppercase tracking-wider border border-indigo-200 shadow-sm transition-all active:scale-95 flex justify-center items-center gap-1">
                                <Plus size={14} /> Detent
                            </button>
                            <button onClick={() => handleQuickAdd(CadetStatus.PASS)} className="flex-1 min-w-[70px] py-2 rounded-xl bg-white text-purple-600 hover:bg-purple-50 font-black text-[9px] sm:text-[10px] uppercase tracking-wider border border-purple-200 shadow-sm transition-all active:scale-95 flex justify-center items-center gap-1">
                                <Plus size={14} /> Pass
                            </button>
                            <button onClick={() => handleQuickAdd(CadetStatus.SUSPENSION)} className="flex-1 min-w-[70px] py-2 rounded-xl bg-white text-slate-600 hover:bg-slate-50 font-black text-[9px] sm:text-[10px] uppercase tracking-wider border border-slate-300 shadow-sm transition-all active:scale-95 flex justify-center items-center gap-1">
                                <Plus size={14} /> Susp
                            </button>
                            <button onClick={() => handleQuickAdd(CadetStatus.YET_TO_REPORT)} className="flex-1 min-w-[70px] py-2 rounded-xl bg-white text-cyan-600 hover:bg-cyan-50 font-black text-[9px] sm:text-[10px] uppercase tracking-wider border border-cyan-200 shadow-sm transition-all active:scale-95 flex justify-center items-center gap-1">
                                <Plus size={14} /> YTR
                            </button>
                        </div>
                    </div>

                    {/* LEDGER FILTER TABS & AUDIT QUICK SEARCH */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
                        {/* Contextual Filter Tabs */}
                        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
                            {filterTabs.map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => {
                                        setLedgerFilter(tab.id);
                                        setCurrentPage(1);
                                    }}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                                        ledgerFilter === tab.id
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    <span>{tab.label}</span>
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                                        ledgerFilter === tab.id ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                                    }`}>
                                        {tab.count}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Local Audit Quick Search */}
                        <div className="relative shrink-0 sm:w-56">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input
                                type="text"
                                placeholder="Search ledger..."
                                value={ledgerSearch}
                                onChange={(e) => {
                                    setLedgerSearch(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* SMART LEDGER LIST VIEW */}
                    <div className="space-y-2 min-h-[220px]">
                        {paginatedCadets.length > 0 ? (
                            paginatedCadets.map((c, i) => (
                                <div key={`${c.name}-${startIndex + i}`} className="group flex items-center justify-between p-3 bg-slate-50 hover:bg-white rounded-xl border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                                            {c.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="text-sm font-semibold text-slate-700">
                                            {c.name} <span className="text-slate-400 mx-1">•</span> {c.squad}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                                            c.status === CadetStatus.ABSENT ? 'text-rose-500 bg-rose-50' :
                                            c.status === CadetStatus.SICK ? 'text-amber-500 bg-amber-50' :
                                            c.status === CadetStatus.DETENTION ? 'text-indigo-500 bg-indigo-50' :
                                            c.status === CadetStatus.PASS ? 'text-purple-500 bg-purple-50' :
                                            c.status === CadetStatus.SUSPENSION ? 'text-slate-500 bg-slate-100' :
                                            'text-cyan-500 bg-cyan-50'
                                        }`}>
                                            {c.status === CadetStatus.YET_TO_REPORT ? 'YTR' : c.status}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setCadetDetailsList(cadetDetailsList.filter(item => item !== c))}
                                            className="text-slate-300 hover:text-rose-600 transition-colors"
                                            title="Remove cadet"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center">
                                <p className="text-slate-400 text-sm italic">
                                    {cadetDetailsList.length === 0
                                        ? "No non-present cadets added yet."
                                        : "No cadets match your filter or search criteria."}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* SMART PAGINATION FOOTER */}
                    {filteredCadets.length > 0 && (
                        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                            <div>
                                Showing <span className="font-bold text-slate-700">{startIndex + 1}</span> to{' '}
                                <span className="font-bold text-slate-700">
                                    {Math.min(startIndex + ITEMS_PER_PAGE, filteredCadets.length)}
                                </span>{' '}
                                of <span className="font-bold text-slate-700">{filteredCadets.length}</span> cadets
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={safeCurrentPage === 1}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 font-semibold text-slate-700 transition-all"
                                >
                                    <ChevronLeft size={14} /> Previous
                                </button>
                                <span className="px-2 py-1 font-bold text-slate-600">
                                    Page {safeCurrentPage} of {totalPages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={safeCurrentPage >= totalPages}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 font-semibold text-slate-700 transition-all"
                                >
                                    Next <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={handleSubmission}
                    disabled={isSubmitting}
                    className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center space-x-2"
                >
                    {isSubmitting ? <RefreshCcw className="animate-spin" /> : <span>Submit Official Parade State</span>}
                </button>
            </div>

            <SubmissionPreview
                isOpen={showPreview}
                onClose={() => setShowPreview(false)}
                onConfirm={commitSubmission}
                title={`Review ${formParadeType} State`}
                type="parade"
                data={previewData}
            />
        </div>
    );
};
