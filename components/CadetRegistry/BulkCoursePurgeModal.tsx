import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    ShieldAlert,
    Trash2,
    Download,
    CheckCircle2,
    AlertTriangle,
    RefreshCw,
    Upload,
    FileSpreadsheet,
    FileText,
    RotateCcw,
    Lock,
    Unlock,
    Layers,
    Users,
    ClipboardList,
    BellRing,
    ArrowRight,
    ArrowLeft,
    X,
    CheckSquare,
    Square,
    Database,
    History,
    Sparkles
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { dbService } from '../../services/dbService';
import {
    parseCadetImportFile,
    downloadNPACSVTemplate,
    downloadNPAExcelTemplate,
    downloadLegacyExcelTemplate,
    buildCoursePurgeConfirmationPhrase,
    downloadCourseBackupCSV
} from '../../services/cadetImportService';
import {
    CourseImpactSummary,
    CourseImpactBreakdownItem,
    CoursePurgeMode,
    CoursePurgeSnapshot,
    BulkCoursePurgeResult,
    CadetImportParseResult,
    TemplateImportFormat
} from '../../types';
import { formatRC, calculateCurrentLevel, calculateAdmissionYearFromRC } from '../../utils/rcHelpers';
import { useAuth } from '../../context/AuthContext';

interface BulkCoursePurgeModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeRC: number;
    initialSelectedRC?: number;
    onPurgeAndSeedComplete: () => void;
}

type WorkflowStep = 'SELECT_AND_AUDIT' | 'CONFIRM_DESTRUCTIVE' | 'RE_ENROLL_SEED';

export const BulkCoursePurgeModal: React.FC<BulkCoursePurgeModalProps> = ({
    isOpen,
    onClose,
    activeRC,
    initialSelectedRC,
    onPurgeAndSeedComplete
}) => {
    const { currentUser } = useAuth();

    // Workflow Navigation State
    const [step, setStep] = useState<WorkflowStep>('SELECT_AND_AUDIT');
    const [showSnapshotsDrawer, setShowSnapshotsDrawer] = useState(false);

    // Step 1: Course Selection & Impact Preview State
    const [availableCourses, setAvailableCourses] = useState<CourseImpactBreakdownItem[]>([]);
    const [selectedRCs, setSelectedRCs] = useState<number[]>(
        initialSelectedRC && initialSelectedRC > 0 ? [initialSelectedRC] : [10]
    );
    const [customRCInput, setCustomRCInput] = useState('');
    const [impactSummary, setImpactSummary] = useState<CourseImpactSummary>({
        totalCadets: 0,
        activeCadets: 0,
        paradeRecordsCount: 0,
        attendanceLogsCount: 0,
        disciplinaryLogsCount: 0,
        assignedOfficersCount: 0,
        pushSubscriptionsCount: 0,
        courseBreakdown: []
    });
    const [isLoadingCourses, setIsLoadingCourses] = useState(false);
    const [isLoadingImpact, setIsLoadingImpact] = useState(false);
    const [isExportingBackup, setIsExportingBackup] = useState(false);
    const [hasExportedBackup, setHasExportedBackup] = useState(false);
    const [lastBackupFilename, setLastBackupFilename] = useState<string | null>(null);

    // Emergency Recovery Snapshots State
    const [snapshots, setSnapshots] = useState<CoursePurgeSnapshot[]>([]);
    const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
    const [restoringSnapshotId, setRestoringSnapshotId] = useState<string | null>(null);

    // Step 2: High-Friction Confirmation Guardrail State
    const [purgeMode, setPurgeMode] = useState<CoursePurgeMode>('SOFT_DELETE');
    const [purgeAttendance, setPurgeAttendance] = useState(false);
    const [hazardAckBackup, setHazardAckBackup] = useState(false);
    const [hazardAckDestructive, setHazardAckDestructive] = useState(false);
    const [typedPhrase, setTypedPhrase] = useState('');
    const [isExecutingPurge, setIsExecutingPurge] = useState(false);

    // Step 3: Immediate Re-Enrollment / Seeding State
    const [purgeResult, setPurgeResult] = useState<BulkCoursePurgeResult | null>(null);
    const [selectedFormatMode, setSelectedFormatMode] = useState<'AUTO' | TemplateImportFormat>('AUTO');
    const [seedFileName, setSeedFileName] = useState<string | null>(null);
    const [isParsingSeed, setIsParsingSeed] = useState(false);
    const [ isCommittingSeed, setIsCommittingSeed] = useState(false);
    const [seedParseResult, setSeedParseResult] = useState<CadetImportParseResult | null>(null);
    const [seedPreviewTab, setSeedPreviewTab] = useState<'ALL' | 'VALID' | 'INVALID'>('ALL');
    const seedFileInputRef = useRef<HTMLInputElement>(null);

    const requiredPhrase = useMemo(
        () => buildCoursePurgeConfirmationPhrase(selectedRCs),
        [selectedRCs]
    );

    const isPhraseMatched = useMemo(
        () => typedPhrase.trim().toUpperCase() === requiredPhrase.toUpperCase(),
        [typedPhrase, requiredPhrase]
    );

    const canExecutePurge = useMemo(
        () =>
            selectedRCs.length > 0 &&
            hazardAckBackup &&
            hazardAckDestructive &&
            isPhraseMatched &&
            !isExecutingPurge,
        [selectedRCs, hazardAckBackup, hazardAckDestructive, isPhraseMatched, isExecutingPurge]
    );

    // Load courses and snapshots when modal opens
    useEffect(() => {
        if (!isOpen) return;
        loadAvailableCourses();
        loadSnapshots();
    }, [isOpen, activeRC]);

    // Sync initialSelectedRC when opened
    useEffect(() => {
        if (isOpen && initialSelectedRC && initialSelectedRC > 0) {
            setSelectedRCs([initialSelectedRC]);
        }
    }, [isOpen, initialSelectedRC]);

    // Refresh impact summary whenever selectedRCs changes
    useEffect(() => {
        if (!isOpen) return;
        fetchImpactSummary(selectedRCs);
        // Reset backup & confirmation state when course selection changes
        setHasExportedBackup(false);
        setLastBackupFilename(null);
        setHazardAckBackup(false);
        setHazardAckDestructive(false);
        setTypedPhrase('');
    }, [selectedRCs, isOpen]);

    if (!isOpen) return null;

    const loadAvailableCourses = async () => {
        setIsLoadingCourses(true);
        try {
            const summary = await dbService.getAvailableCoursesSummary(activeRC);
            setAvailableCourses(summary);
        } catch (err) {
            console.error('Error loading available courses:', err);
        } finally {
            setIsLoadingCourses(false);
        }
    };

    const loadSnapshots = async () => {
        setIsLoadingSnapshots(true);
        try {
            const list = await dbService.getCoursePurgeSnapshots();
            setSnapshots(list);
        } catch (err) {
            console.error('Error loading purge snapshots:', err);
        } finally {
            setIsLoadingSnapshots(false);
        }
    };

    const fetchImpactSummary = async (rcs: number[]) => {
        if (!rcs || rcs.length === 0) {
            setImpactSummary({
                totalCadets: 0,
                activeCadets: 0,
                paradeRecordsCount: 0,
                attendanceLogsCount: 0,
                disciplinaryLogsCount: 0,
                assignedOfficersCount: 0,
                pushSubscriptionsCount: 0,
                courseBreakdown: []
            });
            return;
        }
        setIsLoadingImpact(true);
        try {
            const impact = await dbService.getCoursesImpactSummary(rcs);
            setImpactSummary(impact);
        } catch (err) {
            console.error('Failed to fetch course impact summary:', err);
        } finally {
            setIsLoadingImpact(false);
        }
    };

    const toggleCourseSelection = (rc: number) => {
        setSelectedRCs(prev =>
            prev.includes(rc) ? prev.filter(item => item !== rc) : [...prev, rc].sort((a, b) => a - b)
        );
    };

    const handleAddCustomRC = (e: React.FormEvent) => {
        e.preventDefault();
        const parsed = parseInt(customRCInput.trim(), 10);
        if (isNaN(parsed) || parsed < 1 || parsed > 50) {
            toast.error('Please enter a valid Regular Course number (1 - 50).');
            return;
        }
        if (!selectedRCs.includes(parsed)) {
            setSelectedRCs(prev => [...prev, parsed].sort((a, b) => a - b));
        }
        if (!availableCourses.some(c => c.courseNumber === parsed)) {
            setAvailableCourses(prev =>
                [...prev, { courseNumber: parsed, totalCadets: 0, activeCadets: 0, squadCount: 0 }].sort(
                    (a, b) => b.courseNumber - a.courseNumber
                )
            );
        }
        setCustomRCInput('');
    };

    const handleExportCSVBackup = async () => {
        if (selectedRCs.length === 0) {
            toast.error('Select at least one Regular Course to export a backup.');
            return;
        }

        setIsExportingBackup(true);
        const toastId = toast.loading(
            `Generating CSV backup for ${selectedRCs.map(rc => `RC ${rc}`).join(', ')}...`
        );
        try {
            const cadets = await dbService.getCadetsByCourses(selectedRCs);
            const filename = downloadCourseBackupCSV(cadets, selectedRCs);
            setHasExportedBackup(true);
            setLastBackupFilename(filename);
            setHazardAckBackup(true);
            toast.success(
                `Backup downloaded (${cadets.length.toLocaleString()} records -> ${filename})`,
                { id: toastId }
            );
        } catch (err: any) {
            toast.error(`Backup export failed: ${err.message || 'Unknown error'}`, { id: toastId });
        } finally {
            setIsExportingBackup(false);
        }
    };

    const handleProceedToConfirmation = () => {
        if (selectedRCs.length === 0) {
            toast.error('Please select at least one Regular Course (RC) to continue.');
            return;
        }
        if (impactSummary.totalCadets > 0 && !hasExportedBackup) {
            toast.error('Mandatory Safety Step: Please download a CSV backup of the targeted course(s) before proceeding to deletion.');
            return;
        }
        setStep('CONFIRM_DESTRUCTIVE');
    };

    const handleExecutePurge = async () => {
        if (!canExecutePurge) return;

        const actorId = currentUser?.id ? String(currentUser.id) : '';
        const actorName = currentUser?.fullName || currentUser?.username || 'COMMANDANT';

        if (!actorId) {
            toast.error('Session verification failed: Missing Commandant security identifier.');
            return;
        }

        setIsExecutingPurge(true);
        const toastId = toast.loading(
            `Executing atomic ${purgeMode === 'SOFT_DELETE' ? 'Soft-Delete & Snapshot Archive' : 'Hard-Delete Purge'} for ${selectedRCs.map(rc => `RC ${rc}`).join(', ')}...`
        );

        try {
            const result = await dbService.executeBulkCoursePurge({
                courseNumbers: selectedRCs,
                actorId,
                actorName,
                purgeMode,
                purgeAttendance,
                confirmationPhrase: requiredPhrase
            });

            setPurgeResult(result);
            toast.success(
                `Successfully purged ${result.purgedCadetCount.toLocaleString()} cadet record(s) across ${selectedRCs.map(rc => `RC ${rc}`).join(', ')}. Ready for immediate re-enrollment.`,
                { id: toastId, duration: 5000 }
            );

            // Refresh background data
            onPurgeAndSeedComplete();
            await loadAvailableCourses();
            await loadSnapshots();

            // Seamless transition to Step 3: Immediate Re-Enrollment / Seeding Workflow
            setStep('RE_ENROLL_SEED');
        } catch (err: any) {
            console.error('Bulk Course Purge Error:', err);
            toast.error(`Course purge aborted (Transaction Rolled Back): ${err.message || 'Database error'}`, {
                id: toastId,
                duration: 6000
            });
        } finally {
            setIsExecutingPurge(false);
        }
    };

    const handleRestoreSnapshot = async (snapshot: CoursePurgeSnapshot) => {
        const actorId = currentUser?.id ? String(currentUser.id) : '';
        const actorName = currentUser?.fullName || currentUser?.username || 'COMMANDANT';

        if (!actorId) {
            toast.error('Missing Commandant credentials for snapshot restoration.');
            return;
        }

        setRestoringSnapshotId(snapshot.id);
        const toastId = toast.loading(
            `Restoring ${snapshot.cadetCount.toLocaleString()} cadets for ${snapshot.courseNumbers.map(rc => `RC ${rc}`).join(', ')}...`
        );

        try {
            const res = await dbService.restoreCoursePurgeSnapshot(snapshot.id, actorId, actorName);
            toast.success(
                `Snapshot restored! ${res.restoredCadetCount.toLocaleString()} cadets returned to ${res.courseNumbers.map(rc => `RC ${rc}`).join(', ')}.`,
                { id: toastId, duration: 5000 }
            );
            onPurgeAndSeedComplete();
            await loadAvailableCourses();
            await loadSnapshots();
            await fetchImpactSummary(selectedRCs);
        } catch (err: any) {
            toast.error(`Snapshot restore failed: ${err.message || 'Unknown error'}`, { id: toastId });
        } finally {
            setRestoringSnapshotId(null);
        }
    };

    // Step 3: Re-Enrollment File Processing Handlers
    const processSeedFile = async (file: File) => {
        setSeedFileName(file.name);
        setIsParsingSeed(true);
        try {
            const res = await parseCadetImportFile(file, {
                activeRC,
                formatMode: selectedFormatMode === 'UNKNOWN' ? 'AUTO' : selectedFormatMode
            });
            setSeedParseResult(res);
            if (res.invalidRows.length > 0 && res.validRows.length === 0) {
                setSeedPreviewTab('INVALID');
            } else {
                setSeedPreviewTab('ALL');
            }
        } catch (err: any) {
            toast.error(`Failed to parse replacement roster: ${err.message || 'Unknown error'}`);
        } finally {
            setIsParsingSeed(false);
        }
    };

    const handleSeedFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await processSeedFile(file);
        e.target.value = '';
    };

    const handleCommitReEnrollment = async () => {
        if (!seedParseResult || seedParseResult.validRows.length === 0) {
            toast.error('No valid cadet rows ready to seed.');
            return;
        }

        setIsCommittingSeed(true);
        const toastId = toast.loading(
            `Seeding ${seedParseResult.validRows.length.toLocaleString()} fresh cadet records into registry...`
        );

        try {
            const payloadMap = new Map<string, {
                name: string;
                squad: string;
                course_number: number;
                year_group: number;
                npa_number?: string;
                admission_year?: number;
                status: string;
            }>();

            for (const row of seedParseResult.validRows) {
                const key = row.npa_number
                    ? `NPA:${row.npa_number.trim().toUpperCase()}`
                    : `LEG:${row.name.trim().toUpperCase()}|${row.course_number}|${row.rowNumber}`;

                payloadMap.set(key, {
                    name: row.name,
                    squad: row.squad,
                    course_number: row.course_number,
                    year_group: row.year_group ?? calculateCurrentLevel(row.course_number, activeRC),
                    npa_number: row.npa_number || undefined,
                    admission_year: row.admission_year || undefined,
                    status: 'ACTIVE'
                });
            }

            const payload = Array.from(payloadMap.values());
            const actorId = currentUser?.id ? String(currentUser.id) : undefined;
            await dbService.bulkAddCadetsToRegistry(payload, actorId);

            toast.success(
                `Course Re-Enrollment Complete! ${payload.length.toLocaleString()} cadets enrolled.`,
                { id: toastId, duration: 5000 }
            );
            onPurgeAndSeedComplete();
            onClose();
        } catch (err: any) {
            console.error('Re-Enrollment Commit Error:', err);
            toast.error(`Re-enrollment failed: ${err.message || 'Check console for details.'}`, { id: toastId });
        } finally {
            setIsCommittingSeed(false);
        }
    };

    const displayedSeedRows = seedParseResult
        ? seedPreviewTab === 'VALID'
            ? seedParseResult.validRows
            : seedPreviewTab === 'INVALID'
            ? seedParseResult.invalidRows
            : seedParseResult.allRows
        : [];

    return (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
                {/* Top Security Header */}
                <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-900 to-rose-950 text-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-inner">
                            <ShieldAlert size={22} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h3 className="font-black text-base md:text-lg tracking-tight">
                                    Bulk Course Purge & Re-Enrollment Console
                                </h3>
                                <span className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest bg-rose-500/20 text-rose-300 rounded-full border border-rose-500/30">
                                    Commandant Guardrail
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Atomic Regular Course (RC) roster purge, mandatory CSV backup, snapshot recovery & dual-format re-seeding
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowSnapshotsDrawer(prev => !prev)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                                showSnapshotsDrawer
                                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                                    : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
                            }`}
                            title="View Emergency Audit Window Snapshots"
                        >
                            <History size={15} />
                            <span className="hidden sm:inline">Recovery Snapshots</span>
                            {snapshots.filter(s => s.isRecoverable && !s.restoredAt).length > 0 && (
                                <span className="px-1.5 py-0.2 bg-amber-400/20 text-amber-200 rounded-full text-[10px] font-black">
                                    {snapshots.filter(s => s.isRecoverable && !s.restoredAt).length}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Step Progress Bar */}
                <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 md:gap-4 text-xs font-black uppercase tracking-wider overflow-x-auto">
                        <button
                            type="button"
                            onClick={() => step !== 'RE_ENROLL_SEED' && setStep('SELECT_AND_AUDIT')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${
                                step === 'SELECT_AND_AUDIT'
                                    ? 'bg-slate-900 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                                1
                            </span>
                            <span>Select RC & Impact Audit</span>
                        </button>

                        <ArrowRight size={14} className="text-slate-300 shrink-0" />

                        <button
                            type="button"
                            disabled={step === 'SELECT_AND_AUDIT' && (!hasExportedBackup && impactSummary.totalCadets > 0)}
                            onClick={() => {
                                if (step === 'CONFIRM_DESTRUCTIVE') return;
                                if (step === 'SELECT_AND_AUDIT') handleProceedToConfirmation();
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${
                                step === 'CONFIRM_DESTRUCTIVE'
                                    ? 'bg-rose-600 text-white shadow-sm'
                                    : 'text-slate-500 disabled:opacity-40'
                            }`}
                        >
                            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                                2
                            </span>
                            <span>Safety Verification Guardrail</span>
                        </button>

                        <ArrowRight size={14} className="text-slate-300 shrink-0" />

                        <div
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${
                                step === 'RE_ENROLL_SEED'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'text-slate-400'
                            }`}
                        >
                            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                                3
                            </span>
                            <span>Immediate Re-Enrollment</span>
                        </div>
                    </div>

                    <div className="hidden lg:flex items-center gap-2 text-[11px] font-bold text-slate-500">
                        <span>Target:</span>
                        <span className="px-2.5 py-0.5 bg-slate-200/80 text-slate-800 rounded-lg font-black">
                            {selectedRCs.length > 0
                                ? selectedRCs.map(rc => `RC ${rc}`).join(', ')
                                : 'None Selected'}
                        </span>
                    </div>
                </div>

                {/* Collapsible Emergency Recovery Snapshots Drawer */}
                {showSnapshotsDrawer && (
                    <div className="bg-amber-50/90 border-b border-amber-200 px-6 py-4 shrink-0 max-h-60 overflow-y-auto animate-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <RotateCcw size={16} className="text-amber-700" />
                                <h4 className="text-xs font-black uppercase tracking-widest text-amber-900">
                                    Emergency Audit Window — Soft-Delete Snapshots
                                </h4>
                            </div>
                            <button
                                type="button"
                                onClick={loadSnapshots}
                                className="text-[11px] font-bold text-amber-800 hover:underline flex items-center gap-1"
                            >
                                <RefreshCw size={12} className={isLoadingSnapshots ? 'animate-spin' : ''} />
                                Refresh
                            </button>
                        </div>

                        {snapshots.length === 0 ? (
                            <p className="text-xs text-amber-800/80 py-2">
                                No course purge snapshots recorded yet. Soft-deleted courses appear here for 1-click transactional restoration.
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                {snapshots.map(snap => (
                                    <div
                                        key={snap.id}
                                        className="bg-white rounded-xl p-3 border border-amber-200/80 shadow-sm flex items-center justify-between gap-3"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-black text-xs text-slate-900">
                                                    {snap.courseNumbers.map(rc => `RC ${rc}`).join(', ')}
                                                </span>
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-100 text-slate-700">
                                                    {snap.cadetCount.toLocaleString()} Cadets
                                                </span>
                                                <span
                                                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                                        snap.restoredAt
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : snap.isRecoverable
                                                            ? 'bg-amber-100 text-amber-800'
                                                            : 'bg-rose-100 text-rose-700'
                                                    }`}
                                                >
                                                    {snap.restoredAt
                                                        ? 'Restored'
                                                        : snap.isRecoverable
                                                        ? 'Soft-Delete Archive'
                                                        : 'Hard-Deleted'}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 mt-1 truncate">
                                                By <span className="font-semibold text-slate-700">{snap.actorName}</span> •{' '}
                                                {new Date(snap.createdAt).toLocaleString()}
                                            </p>
                                        </div>

                                        {snap.isRecoverable && (
                                            <button
                                                type="button"
                                                disabled={restoringSnapshotId === snap.id}
                                                onClick={() => handleRestoreSnapshot(snap)}
                                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 shadow-sm transition-all"
                                            >
                                                {restoringSnapshotId === snap.id ? (
                                                    <RefreshCw size={13} className="animate-spin" />
                                                ) : (
                                                    <RotateCcw size={13} />
                                                )}
                                                <span>{snap.restoredAt ? 'Re-Restore' : 'Restore'}</span>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    {/* =====================================================================
                        STEP 1: COURSE SELECTION & IMPACT PREVIEW DASHBOARD
                       ===================================================================== */}
                    {step === 'SELECT_AND_AUDIT' && (
                        <>
                            {/* 1A. Multi-Select Regular Course Grid */}
                            <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                        <label className="text-xs font-black uppercase tracking-widest text-slate-500 block">
                                            1. Select Target Regular Course(s) for Bulk Purge / Replacement
                                        </label>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Click one or multiple Regular Courses (e.g., RC 9, RC 10, RC 11) to inspect their real-time registry impact.
                                        </p>
                                    </div>

                                    {/* Add Custom RC Number */}
                                    <form onSubmit={handleAddCustomRC} className="flex items-center gap-1.5">
                                        <input
                                            type="number"
                                            min={1}
                                            max={50}
                                            placeholder="Other RC #..."
                                            value={customRCInput}
                                            onChange={e => setCustomRCInput(e.target.value)}
                                            className="w-28 px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                        <button
                                            type="submit"
                                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition-all"
                                        >
                                            + Add RC
                                        </button>
                                    </form>
                                </div>

                                {isLoadingCourses ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                                        {[1, 2, 3, 4, 5, 6].map(n => (
                                            <div
                                                key={n}
                                                className="h-24 rounded-2xl bg-slate-100 animate-pulse border border-slate-200"
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                                        {availableCourses.map(course => {
                                            const isSelected = selectedRCs.includes(course.courseNumber);
                                            const admissionYear = calculateAdmissionYearFromRC(course.courseNumber);
                                            const level = calculateCurrentLevel(course.courseNumber, activeRC);

                                            return (
                                                <button
                                                    key={course.courseNumber}
                                                    type="button"
                                                    onClick={() => toggleCourseSelection(course.courseNumber)}
                                                    className={`p-3.5 rounded-2xl border-2 text-left transition-all relative flex flex-col justify-between ${
                                                        isSelected
                                                            ? 'border-rose-600 bg-rose-50/70 shadow-sm ring-2 ring-rose-500/20'
                                                            : 'border-slate-200 hover:border-slate-300 bg-white'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <span
                                                            className={`px-2 py-0.5 rounded-lg text-xs font-black ${
                                                                isSelected
                                                                    ? 'bg-rose-600 text-white'
                                                                    : 'bg-slate-100 text-slate-800'
                                                            }`}
                                                        >
                                                            RC {course.courseNumber}
                                                        </span>
                                                        {isSelected ? (
                                                            <CheckSquare size={16} className="text-rose-600" />
                                                        ) : (
                                                            <Square size={16} className="text-slate-300" />
                                                        )}
                                                    </div>

                                                    <div className="mt-3">
                                                        <p className="text-lg font-black text-slate-900 leading-none">
                                                            {course.totalCadets.toLocaleString()}
                                                        </p>
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">
                                                            Cadets • {course.squadCount} Squads
                                                        </p>
                                                    </div>

                                                    <div className="mt-2 pt-2 border-t border-slate-200/70 flex items-center justify-between text-[10px] font-bold text-slate-400">
                                                        <span>Yr {level}</span>
                                                        <span>Adm {admissionYear}</span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* 1B. Real-Time Impact Audit Counter Dashboard */}
                            <div className="bg-slate-900 text-white rounded-3xl p-5 md:p-6 border border-slate-800 shadow-lg space-y-5">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                                            <Layers size={18} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black uppercase tracking-wider text-white">
                                                2. Real-Time Impact Audit Counter
                                            </h4>
                                            <p className="text-xs text-slate-400">
                                                Live blast-radius assessment across{' '}
                                                <span className="text-rose-300 font-bold">
                                                    {selectedRCs.length > 0
                                                        ? selectedRCs.map(rc => formatRC(rc)).join(', ')
                                                        : 'No courses selected'}
                                                </span>
                                            </p>
                                        </div>
                                    </div>

                                    {isLoadingImpact && (
                                        <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                                            <RefreshCw size={13} className="animate-spin" />
                                            Auditing database records...
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                                    {/* Total Cadets Card */}
                                    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4">
                                        <div className="flex items-center justify-between text-rose-400 mb-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest">
                                                Targeted Cadets
                                            </span>
                                            <Users size={16} />
                                        </div>
                                        <p className="text-2xl md:text-3xl font-black text-white">
                                            {impactSummary.totalCadets.toLocaleString()}
                                        </p>
                                        <p className="text-[11px] text-slate-400 mt-1">
                                            {impactSummary.activeCadets.toLocaleString()} Active in Nominal Roll
                                        </p>
                                    </div>

                                    {/* Parade Records Card */}
                                    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4">
                                        <div className="flex items-center justify-between text-amber-400 mb-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest">
                                                Parade Submissions
                                            </span>
                                            <ClipboardList size={16} />
                                        </div>
                                        <p className="text-2xl md:text-3xl font-black text-white">
                                            {impactSummary.paradeRecordsCount.toLocaleString()}
                                        </p>
                                        <p className="text-[11px] text-slate-400 mt-1">
                                            Muster, Tattoo & Special Parades
                                        </p>
                                    </div>

                                    {/* Disciplinary & Attendance Logs Card */}
                                    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4">
                                        <div className="flex items-center justify-between text-blue-400 mb-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest">
                                                Disciplinary / Status Logs
                                            </span>
                                            <Database size={16} />
                                        </div>
                                        <p className="text-2xl md:text-3xl font-black text-white">
                                            {impactSummary.disciplinaryLogsCount.toLocaleString()}
                                        </p>
                                        <p className="text-[11px] text-slate-400 mt-1">
                                            Absent, Detention, Sick & Pass entries
                                        </p>
                                    </div>

                                    {/* Assigned Officers & Push Subscriptions Card */}
                                    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4">
                                        <div className="flex items-center justify-between text-emerald-400 mb-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest">
                                                Officers & Webhooks
                                            </span>
                                            <BellRing size={16} />
                                        </div>
                                        <p className="text-2xl md:text-3xl font-black text-white">
                                            {impactSummary.assignedOfficersCount}{' '}
                                            <span className="text-sm font-bold text-slate-400">
                                                / {impactSummary.pushSubscriptionsCount} Push
                                            </span>
                                        </p>
                                        <p className="text-[11px] text-slate-400 mt-1">
                                            Course Officers & Push Subscriptions
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* 1C. Mandatory Export Backup Prompt */}
                            <div
                                className={`rounded-3xl p-5 border-2 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                                    hasExportedBackup
                                        ? 'bg-emerald-50/70 border-emerald-300'
                                        : 'bg-amber-50/80 border-amber-300'
                                }`}
                            >
                                <div className="flex items-start gap-3.5">
                                    <div
                                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                                            hasExportedBackup
                                                ? 'bg-emerald-600 text-white'
                                                : 'bg-amber-500 text-white'
                                        }`}
                                    >
                                        {hasExportedBackup ? <CheckCircle2 size={22} /> : <Download size={22} />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h4 className="text-sm font-black text-slate-900">
                                                3. Mandatory Pre-Purge CSV Roster Backup
                                            </h4>
                                            <span
                                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                    hasExportedBackup
                                                        ? 'bg-emerald-200 text-emerald-900'
                                                        : 'bg-amber-200 text-amber-900'
                                                }`}
                                            >
                                                {hasExportedBackup ? 'Backup Verified ✓' : 'Required Before Deletion'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                            Download a timestamped CSV archive of all{' '}
                                            <span className="font-bold text-slate-900">
                                                {impactSummary.totalCadets.toLocaleString()}
                                            </span>{' '}
                                            cadet records in{' '}
                                            <span className="font-bold text-slate-900">
                                                {selectedRCs.map(rc => `RC ${rc}`).join(', ') || 'selected courses'}
                                            </span>
                                            . The exported CSV is 100% compatible with the Dual-Format Enrollment Engine for instant re-import.
                                        </p>
                                        {lastBackupFilename && (
                                            <p className="text-[11px] font-mono font-bold text-emerald-800 mt-1.5">
                                                Saved: {lastBackupFilename}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    disabled={isExportingBackup || selectedRCs.length === 0}
                                    onClick={handleExportCSVBackup}
                                    className={`px-5 py-3 rounded-2xl text-xs font-black flex items-center gap-2 shrink-0 shadow-md transition-all ${
                                        hasExportedBackup
                                            ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                                            : 'bg-slate-900 hover:bg-slate-800 text-white'
                                    } disabled:opacity-50`}
                                >
                                    {isExportingBackup ? (
                                        <RefreshCw size={15} className="animate-spin" />
                                    ) : (
                                        <Download size={15} />
                                    )}
                                    <span>
                                        {hasExportedBackup
                                            ? 'Download Backup Again (.CSV)'
                                            : `Export ${selectedRCs.map(rc => `RC-${rc}`).join('/')} Backup (.CSV)`}
                                    </span>
                                </button>
                            </div>
                        </>
                    )}

                    {/* =====================================================================
                        STEP 2: MULTI-STEP SAFETY CONFIRMATION GUARDRAIL
                       ===================================================================== */}
                    {step === 'CONFIRM_DESTRUCTIVE' && (
                        <div className="space-y-6 animate-in fade-in duration-200">
                            {/* High-Friction Warning Banner */}
                            <div className="bg-rose-50 border-2 border-rose-200 rounded-3xl p-5 flex items-start gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md">
                                    <AlertTriangle size={24} />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-base font-black text-rose-950">
                                        High-Friction Destructive Action Verification
                                    </h4>
                                    <p className="text-xs text-rose-800 leading-relaxed">
                                        You are preparing to purge{' '}
                                        <span className="font-black underline">
                                            {impactSummary.totalCadets.toLocaleString()} cadet record(s)
                                        </span>{' '}
                                        registered under{' '}
                                        <span className="font-black">
                                            {selectedRCs.map(rc => `Regular Course ${rc} (RC-${rc})`).join(', ')}
                                        </span>
                                        . Complete the transaction mode selection, hazard acknowledgments, and phrase verification below to unlock execution.
                                    </p>
                                </div>
                            </div>

                            {/* Purge Mode & Historical Logs Options */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Soft-Delete vs Hard-Delete */}
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 block">
                                        Transaction Recovery Mode
                                    </label>

                                    <button
                                        type="button"
                                        onClick={() => setPurgeMode('SOFT_DELETE')}
                                        className={`w-full p-3.5 rounded-xl border-2 text-left transition-all flex items-start gap-3 ${
                                            purgeMode === 'SOFT_DELETE'
                                                ? 'border-blue-600 bg-blue-50/60'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        <RotateCcw
                                            size={18}
                                            className={
                                                purgeMode === 'SOFT_DELETE' ? 'text-blue-600 mt-0.5' : 'text-slate-400 mt-0.5'
                                            }
                                        />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-xs text-slate-900">
                                                    Soft-Delete with Snapshot Recovery
                                                </span>
                                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-black">
                                                    Recommended
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-600 mt-1">
                                                Archives full course JSONB snapshot into <code className="font-mono">course_purge_snapshots</code> before clearing the active roster so you can roll back with 1 click.
                                            </p>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setPurgeMode('HARD_DELETE')}
                                        className={`w-full p-3.5 rounded-xl border-2 text-left transition-all flex items-start gap-3 ${
                                            purgeMode === 'HARD_DELETE'
                                                ? 'border-rose-600 bg-rose-50/60'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        <Trash2
                                            size={18}
                                            className={
                                                purgeMode === 'HARD_DELETE' ? 'text-rose-600 mt-0.5' : 'text-slate-400 mt-0.5'
                                            }
                                        />
                                        <div>
                                            <span className="font-black text-xs text-slate-900">
                                                Hard-Delete (Permanent Wipe)
                                            </span>
                                            <p className="text-[11px] text-slate-600 mt-1">
                                                Permanently deletes targeted course records from PostgreSQL without storing a recoverable roster payload. Rely on exported CSV backup only.
                                            </p>
                                        </div>
                                    </button>
                                </div>

                                {/* Attendance History & Hazard Acknowledgments */}
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between space-y-4">
                                    <div className="space-y-2.5">
                                        <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 block">
                                            Associated Parade & Disciplinary History
                                        </label>
                                        <label className="flex items-start gap-3 p-3 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-slate-300">
                                            <input
                                                type="checkbox"
                                                checked={purgeAttendance}
                                                onChange={e => setPurgeAttendance(e.target.checked)}
                                                className="mt-1 rounded text-rose-600 focus:ring-rose-500"
                                            />
                                            <div>
                                                <span className="text-xs font-black text-slate-800 block">
                                                    Also Purge Historical Parade & Disciplinary Logs ({impactSummary.paradeRecordsCount} parades)
                                                </span>
                                                <span className="text-[11px] text-slate-500 block mt-0.5">
                                                    Leave unchecked to preserve historical parade statistics while replacing only the nominal cadet roster.
                                                </span>
                                            </div>
                                        </label>
                                    </div>

                                    <div className="space-y-2.5 pt-2 border-t border-slate-200">
                                        <label className="text-[11px] font-black uppercase tracking-widest text-rose-700 block">
                                            Mandatory Hazard Acknowledgments
                                        </label>

                                        <label className="flex items-start gap-3 p-3 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-rose-300">
                                            <input
                                                type="checkbox"
                                                checked={hazardAckBackup}
                                                onChange={e => setHazardAckBackup(e.target.checked)}
                                                className="mt-0.5 rounded text-rose-600 focus:ring-rose-500"
                                            />
                                            <span className="text-xs font-semibold text-slate-700">
                                                I confirm that I have exported and verified the CSV backup for{' '}
                                                <strong className="text-slate-900">
                                                    {selectedRCs.map(rc => `RC-${rc}`).join(', ')}
                                                </strong>
                                                .
                                            </span>
                                        </label>

                                        <label className="flex items-start gap-3 p-3 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-rose-300">
                                            <input
                                                type="checkbox"
                                                checked={hazardAckDestructive}
                                                onChange={e => setHazardAckDestructive(e.target.checked)}
                                                className="mt-0.5 rounded text-rose-600 focus:ring-rose-500"
                                            />
                                            <span className="text-xs font-semibold text-slate-700">
                                                I authorize purging{' '}
                                                <strong className="text-rose-700">
                                                    {impactSummary.totalCadets.toLocaleString()} cadet records
                                                </strong>{' '}
                                                and logging this operation under{' '}
                                                <strong className="text-slate-900">
                                                    {currentUser?.fullName || 'Commandant'}
                                                </strong>{' '}
                                                in the Forensic Audit Archive.
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Typing Verification Input Box */}
                            <div className="bg-slate-900 text-white rounded-3xl p-5 border border-slate-800 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                                        {isPhraseMatched ? (
                                            <Unlock size={15} className="text-emerald-400" />
                                        ) : (
                                            <Lock size={15} className="text-rose-400" />
                                        )}
                                        <span>Type Confirmation Phrase to Unlock Execution:</span>
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] text-slate-400">Required phrase:</span>
                                        <code className="px-3 py-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-xl font-mono text-xs font-black select-all">
                                            {requiredPhrase}
                                        </code>
                                    </div>
                                </div>

                                <input
                                    type="text"
                                    value={typedPhrase}
                                    onChange={e => setTypedPhrase(e.target.value)}
                                    placeholder={`Type "${requiredPhrase}" exactly to unlock...`}
                                    className={`w-full px-4 py-3.5 rounded-2xl font-mono text-sm font-black tracking-wider bg-slate-950 border-2 outline-none transition-all ${
                                        isPhraseMatched
                                            ? 'border-emerald-500 text-emerald-400 ring-4 ring-emerald-500/10'
                                            : typedPhrase.length > 0
                                            ? 'border-rose-500 text-rose-300'
                                            : 'border-slate-700 text-white'
                                    }`}
                                />
                            </div>
                        </div>
                    )}

                    {/* =====================================================================
                        STEP 3: IMMEDIATE RE-ENROLLMENT / SEEDING WORKFLOW
                       ===================================================================== */}
                    {step === 'RE_ENROLL_SEED' && (
                        <div className="space-y-6 animate-in fade-in duration-200">
                            {/* Purge Success & Snapshot Rollback Banner */}
                            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                <div className="flex items-start gap-3.5">
                                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                                        <Sparkles size={22} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h4 className="text-base font-black text-emerald-950">
                                                Purge Transaction Committed — Ready for Immediate Re-Enrollment
                                            </h4>
                                            {purgeResult?.snapshotId && (
                                                <span className="px-2.5 py-0.5 bg-emerald-200/80 text-emerald-900 rounded-full text-[10px] font-mono font-black">
                                                    Snapshot ID: {String(purgeResult.snapshotId).slice(0, 8)}...
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-emerald-800 mt-1">
                                            Cleared{' '}
                                            <span className="font-black">
                                                {purgeResult?.purgedCadetCount.toLocaleString() || 0} record(s)
                                            </span>{' '}
                                            from{' '}
                                            <span className="font-black">
                                                {(purgeResult?.courseNumbers || selectedRCs)
                                                    .map(rc => `RC ${rc}`)
                                                    .join(', ')}
                                            </span>
                                            . Upload the replacement CSV or Excel roster below using either the{' '}
                                            <strong>New 2-Column NPA Format (`NPA Number, Name`)</strong> or the{' '}
                                            <strong>Legacy Format</strong>.
                                        </p>
                                    </div>
                                </div>

                                {purgeResult?.isRecoverable && purgeResult?.snapshotId && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const snap = snapshots.find(s => s.id === purgeResult.snapshotId);
                                            if (snap) handleRestoreSnapshot(snap);
                                        }}
                                        className="px-3.5 py-2 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 shadow-sm transition-all"
                                    >
                                        <RotateCcw size={14} />
                                        <span>Undo & Restore Snapshot</span>
                                    </button>
                                )}
                            </div>

                            {/* Dual-Format Template Bar */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                                        Ingestion Schema Mode
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedFormatMode('AUTO')}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold border text-left transition-all ${
                                                selectedFormatMode === 'AUTO'
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                            }`}
                                        >
                                            <div className="font-black">Auto-Detect</div>
                                            <div className="text-[10px] opacity-80">Both formats</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedFormatMode('NPA_FORMAT')}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold border text-left transition-all ${
                                                selectedFormatMode === 'NPA_FORMAT'
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                            }`}
                                        >
                                            <div className="font-black">New NPA Format</div>
                                            <div className="text-[10px] opacity-80">NPA Number, Name</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedFormatMode('LEGACY_FORMAT')}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold border text-left transition-all ${
                                                selectedFormatMode === 'LEGACY_FORMAT'
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                            }`}
                                        >
                                            <div className="font-black">Legacy Schema</div>
                                            <div className="text-[10px] opacity-80">Name, Squad, RC</div>
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                                        Download Fresh Replacement Templates
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={downloadNPACSVTemplate}
                                            className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                                        >
                                            <FileText size={14} />
                                            <span>NPA CSV (2-Col)</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={downloadNPAExcelTemplate}
                                            className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                                        >
                                            <FileSpreadsheet size={14} />
                                            <span>NPA Excel (.xlsx)</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={downloadLegacyExcelTemplate}
                                            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all"
                                        >
                                            <Download size={14} />
                                            <span>Legacy (.xlsx)</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Upload Dropzone */}
                            <div
                                onClick={() => seedFileInputRef.current?.click()}
                                onDragOver={e => e.preventDefault()}
                                onDrop={async e => {
                                    e.preventDefault();
                                    const file = e.dataTransfer.files?.[0];
                                    if (file) await processSeedFile(file);
                                }}
                                className="border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/30 hover:bg-blue-50/60 rounded-2xl p-6 text-center cursor-pointer transition-all group"
                            >
                                <input
                                    type="file"
                                    ref={seedFileInputRef}
                                    onChange={handleSeedFileChange}
                                    accept=".csv,.xlsx,.xls"
                                    className="hidden"
                                />
                                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-3 shadow-md group-hover:scale-105 transition-transform">
                                    <Upload size={22} />
                                </div>
                                <p className="text-sm font-black text-slate-800">
                                    {seedFileName
                                        ? `Loaded Replacement Roster: ${seedFileName}`
                                        : `Drop replacement CSV or Excel roster for ${selectedRCs.map(rc => `RC ${rc}`).join(', ')}`}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    Supports <span className="font-bold text-slate-700">.csv, .xlsx, .xls</span> • Deduplicates intra-batch NPA numbers automatically
                                </p>
                            </div>

                            {/* Validation Preview Table for Replacement Roster */}
                            {seedParseResult && (
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 p-3 rounded-2xl">
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setSeedPreviewTab('ALL')}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                                    seedPreviewTab === 'ALL'
                                                        ? 'bg-slate-900 text-white'
                                                        : 'bg-white text-slate-600'
                                                }`}
                                            >
                                                All Rows ({seedParseResult.totalRows})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSeedPreviewTab('VALID')}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                                    seedPreviewTab === 'VALID'
                                                        ? 'bg-emerald-600 text-white'
                                                        : 'bg-white text-emerald-700'
                                                }`}
                                            >
                                                Valid ({seedParseResult.validRows.length})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSeedPreviewTab('INVALID')}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                                    seedPreviewTab === 'INVALID'
                                                        ? 'bg-rose-600 text-white'
                                                        : 'bg-white text-rose-700'
                                                }`}
                                            >
                                                Errors ({seedParseResult.invalidRows.length})
                                            </button>
                                        </div>

                                        <span className="text-xs font-bold text-slate-600">
                                            Schema:{' '}
                                            <strong className="text-slate-900">
                                                {seedParseResult.detectedFormat === 'NPA_FORMAT'
                                                    ? 'New NPA 2-Column'
                                                    : 'Legacy 3-Column'}
                                            </strong>
                                        </span>
                                    </div>

                                    <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                                                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                                    <th className="py-2.5 px-3">Row</th>
                                                    <th className="py-2.5 px-3">Status</th>
                                                    <th className="py-2.5 px-3">NPA Number</th>
                                                    <th className="py-2.5 px-3">Full Name</th>
                                                    <th className="py-2.5 px-3">Squad</th>
                                                    <th className="py-2.5 px-3">Derived RC</th>
                                                    <th className="py-2.5 px-3">Diagnostics</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 text-xs">
                                                {displayedSeedRows.slice(0, 150).map(row => (
                                                    <tr
                                                        key={row.rowNumber}
                                                        className={row.isValid ? 'hover:bg-slate-50/80' : 'bg-rose-50/60'}
                                                    >
                                                        <td className="py-2 px-3 font-mono text-slate-400 font-bold">
                                                            #{row.rowNumber}
                                                        </td>
                                                        <td className="py-2 px-3">
                                                            {row.isValid ? (
                                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700">
                                                                    READY
                                                                </span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700">
                                                                    INVALID
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-3 font-mono font-bold text-slate-700">
                                                            {row.npa_number || '—'}
                                                        </td>
                                                        <td className="py-2 px-3 font-bold text-slate-800">{row.name}</td>
                                                        <td className="py-2 px-3 font-bold text-slate-600">{row.squad}</td>
                                                        <td className="py-2 px-3">
                                                            {row.course_number > 0 ? (
                                                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-black text-[10px]">
                                                                    {formatRC(row.course_number)}
                                                                </span>
                                                            ) : (
                                                                '—'
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-3">
                                                            {row.isValid ? (
                                                                <span className="text-[11px] text-emerald-600 font-semibold">
                                                                    Verified
                                                                </span>
                                                            ) : (
                                                                <span className="text-[11px] text-rose-600 font-bold">
                                                                    {row.errors.join(' ')}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Modal Footer Controls */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
                    {step === 'SELECT_AND_AUDIT' && (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200/70 transition-all text-xs"
                            >
                                Cancel
                            </button>

                            <div className="flex items-center gap-3">
                                {!hasExportedBackup && impactSummary.totalCadets > 0 && (
                                    <span className="hidden sm:inline text-xs font-bold text-amber-700">
                                        Export CSV backup first to unlock deletion
                                    </span>
                                )}
                                <button
                                    type="button"
                                    disabled={
                                        selectedRCs.length === 0 ||
                                        (impactSummary.totalCadets > 0 && !hasExportedBackup)
                                    }
                                    onClick={handleProceedToConfirmation}
                                    className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs shadow-lg shadow-rose-600/20 transition-all flex items-center gap-2"
                                >
                                    <Trash2 size={15} />
                                    <span>
                                        Delete {selectedRCs.map(rc => `RC-${rc}`).join(', ')} Records (
                                        {impactSummary.totalCadets.toLocaleString()})
                                    </span>
                                    <ArrowRight size={14} />
                                </button>
                            </div>
                        </>
                    )}

                    {step === 'CONFIRM_DESTRUCTIVE' && (
                        <>
                            <button
                                type="button"
                                disabled={isExecutingPurge}
                                onClick={() => setStep('SELECT_AND_AUDIT')}
                                className="px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200/70 transition-all text-xs flex items-center gap-1.5"
                            >
                                <ArrowLeft size={14} />
                                <span>Back to Impact Audit</span>
                            </button>

                            <button
                                type="button"
                                disabled={!canExecutePurge}
                                onClick={handleExecutePurge}
                                className="px-6 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs shadow-lg shadow-rose-600/25 transition-all flex items-center gap-2"
                            >
                                {isExecutingPurge ? (
                                    <>
                                        <RefreshCw size={15} className="animate-spin" />
                                        <span>Executing Atomic Course Purge...</span>
                                    </>
                                ) : (
                                    <>
                                        <ShieldAlert size={15} />
                                        <span>
                                            Execute {purgeMode === 'SOFT_DELETE' ? 'Soft-Delete & Archive' : 'Permanent Purge'} ({impactSummary.totalCadets.toLocaleString()} Cadets)
                                        </span>
                                    </>
                                )}
                            </button>
                        </>
                    )}

                    {step === 'RE_ENROLL_SEED' && (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200/70 transition-all text-xs"
                            >
                                Finish Without Seeding Now
                            </button>

                            <button
                                type="button"
                                disabled={
                                    !seedParseResult ||
                                    seedParseResult.validRows.length === 0 ||
                                    isCommittingSeed ||
                                    isParsingSeed
                                }
                                onClick={handleCommitReEnrollment}
                                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs shadow-lg shadow-emerald-600/25 transition-all flex items-center gap-2"
                            >
                                {isCommittingSeed ? (
                                    <>
                                        <RefreshCw size={15} className="animate-spin" />
                                        <span>Seeding Course Roster...</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={15} />
                                        <span>
                                            Commit Fresh Course Roster (
                                            {seedParseResult ? seedParseResult.validRows.length.toLocaleString() : 0}{' '}
                                            Cadets)
                                        </span>
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
