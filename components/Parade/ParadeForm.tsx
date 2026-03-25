import React, { useState } from 'react';
import { Plus, Trash2, RefreshCcw } from 'lucide-react';
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

    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
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

    // Determine the officer's course number — fall back to activeRC if needed
    const officerCourseNumber = currentUser?.courseNumber
        ?? (currentUser?.yearGroup ? (activeRC - currentUser.yearGroup + 1) : activeRC);

    const handleAddCadet = () => {
        if (!tempCadet.name || !tempCadet.squad) return;

        // Prevent duplicate names in the non-present list
        const isDuplicate = cadetDetailsList.some(
            c => c.name.toLowerCase() === tempCadet.name.toLowerCase()
        );

        if (isDuplicate) {
            toast.error(`${tempCadet.name} is already in the list.`);
            return;
        }

        setCadetDetailsList([...cadetDetailsList, tempCadet]);
        setTempCadet({ name: '', squad: '', status: CadetStatus.ABSENT });
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
        const today = new Date().toISOString().split('T')[0];
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
                    <h4 className="font-bold text-slate-800 mb-4">Nominal Roll (Non-Present Cadets)</h4>

                    {/* CADET PREVIEW CARD */}
                    {tempCadet.name && (
                        <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-inner">
                                {tempCadet.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-bold text-blue-600 uppercase tracking-widest leading-none mb-1">Cadet Preview</p>
                                <h5 className="font-bold text-slate-900 leading-tight">{tempCadet.name}</h5>
                                <p className="text-sm text-slate-500">{tempCadet.squad || 'Squad not specified'}</p>
                            </div>
                            <div className="text-right">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${tempCadet.status === CadetStatus.ABSENT ? 'bg-rose-100 text-rose-600' :
                                    tempCadet.status === CadetStatus.SICK ? 'bg-amber-100 text-amber-600' :
                                        tempCadet.status === CadetStatus.DETENTION ? 'bg-indigo-100 text-indigo-600' :
                                            tempCadet.status === CadetStatus.PASS ? 'bg-purple-100 text-purple-600' :
                                                tempCadet.status === CadetStatus.SUSPENSION ? 'bg-slate-200 text-slate-700' :
                                                    'bg-cyan-100 text-cyan-600'
                                    }`}>
                                    {tempCadet.status === CadetStatus.YET_TO_REPORT ? 'YTR' : tempCadet.status}
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <CadetSelector
                            courseNumber={officerCourseNumber}
                            onSelect={(cadet) => setTempCadet({ ...tempCadet, name: cadet.name, squad: cadet.squad })}
                            onInputChange={(name) => setTempCadet(prev => ({ ...prev, name, squad: '' }))}
                        />
                        <div className="flex gap-2">
                            <select
                                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                value={tempCadet.status}
                                onChange={(e) => setTempCadet({ ...tempCadet, status: e.target.value as CadetStatus })}
                            >
                                <option value={CadetStatus.ABSENT}>Absent</option>
                                <option value={CadetStatus.SICK}>Sick</option>
                                <option value={CadetStatus.DETENTION}>Detention</option>
                                <option value={CadetStatus.PASS}>On Pass</option>
                                <option value={CadetStatus.SUSPENSION}>On Suspension</option>
                                <option value={CadetStatus.YET_TO_REPORT}>Yet to Report</option>
                            </select>
                            <button
                                onClick={handleAddCadet}
                                className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
                                title="Add Cadet"
                            >
                                <Plus size={24} />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {cadetDetailsList.length > 0 ? (
                            cadetDetailsList.map((c, i) => (
                                <div key={i} className="group flex items-center justify-between p-3 bg-slate-50 hover:bg-white rounded-xl border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                                            {c.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="text-sm font-semibold text-slate-700">
                                            {c.name} <span className="text-slate-400 mx-1">•</span> {c.squad}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${c.status === CadetStatus.ABSENT ? 'text-rose-500 bg-rose-50' :
                                            c.status === CadetStatus.SICK ? 'text-amber-500 bg-amber-50' :
                                                c.status === CadetStatus.DETENTION ? 'text-indigo-500 bg-indigo-50' :
                                                    c.status === CadetStatus.PASS ? 'text-purple-500 bg-purple-50' :
                                                        c.status === CadetStatus.SUSPENSION ? 'text-slate-500 bg-slate-100' :
                                                            'text-cyan-500 bg-cyan-50'
                                            }`}>
                                            {c.status === CadetStatus.YET_TO_REPORT ? 'YTR' : c.status}
                                        </span>
                                        <button
                                            onClick={() => setCadetDetailsList(cadetDetailsList.filter((_, idx) => idx !== i))}
                                            className="text-slate-300 hover:text-rose-600 transition-colors"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <p className="text-slate-400 text-sm italic">No non-present cadets added yet.</p>
                            </div>
                        )}
                    </div>
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
