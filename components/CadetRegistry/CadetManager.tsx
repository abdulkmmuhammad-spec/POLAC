import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Trash2, Users, Search, Download, Upload, FileText, ChevronDown, ShieldAlert } from 'lucide-react';
import { dbService } from '../../services/dbService';
import { useParade } from '../../context/ParadeContext';
import { formatRC, calculateCurrentLevel } from '../../utils/rcHelpers';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';
import { reportService } from '../../services/reportService';
import { CadetRecordModal } from './CadetRecordModal';
import { SubmissionPreview } from '../Common/SubmissionPreview';
import { CadetUploadModal } from './CadetUploadModal';
import { BulkCoursePurgeModal } from './BulkCoursePurgeModal';
import {
    downloadNPACSVTemplate,
    downloadNPAExcelTemplate,
    downloadLegacyExcelTemplate
} from '../../services/cadetImportService';

export const CadetManager: React.FC = () => {
    const location = useLocation();
    const { activeRC } = useParade();
    const [cadets, setCadets] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [hasMore, setHasMore] = useState(true);
    const [selectedCadet, setSelectedCadet] = useState<any | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [previewData, setPreviewData] = useState<any>(null);
    const [courseFilter, setCourseFilter] = useState<number | 'all'>('all');
    const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'RELEGATED' | 'DISMISSED' | 'GRADUATED'>('ACTIVE');
    const [graduatedCohorts, setGraduatedCohorts] = useState<any[]>([]);
    const [selectedGradCohort, setSelectedGradCohort] = useState<number | null>(null);
    const [gradCohortCadets, setGradCohortCadets] = useState<any[]>([]);

    // Upload & Ingress Modals
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isBulkPurgeModalOpen, setIsBulkPurgeModalOpen] = useState(false);
    const [showTemplateMenu, setShowTemplateMenu] = useState(false);
    const templateMenuRef = useRef<HTMLDivElement>(null);

    // Close template menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (templateMenuRef.current && !templateMenuRef.current.contains(event.target as Node)) {
                setShowTemplateMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const PAGE_SIZE = 50;

    // New Cadet Form
    const [newName, setNewName] = useState('');
    const [newSquad, setNewSquad] = useState('');
    const [newCourseNumber, setNewCourseNumber] = useState<number>(activeRC);

    const fetchCadets = async (isInitial = true, search = debouncedSearch, filter = courseFilter, status = statusFilter) => {
        setIsLoading(true);
        try {
            const from = isInitial ? 0 : cadets.length;
            const to = from + PAGE_SIZE - 1;
            const rcFilter = filter === 'all' ? undefined : filter;
            const data = await dbService.getCadetRegistry(from, to, search, rcFilter, status);

            if (isInitial) {
                setCadets(data);
            } else {
                setCadets(prev => [...prev, ...data]);
            }
            setHasMore(data.length === PAGE_SIZE);
        } catch (err) {
            console.error('Failed to fetch cadets', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Handle incoming routing state (e.g., from notifications)
    const [initialPreviewMode, setInitialPreviewMode] = useState(false);
    
    useEffect(() => {
        const state = location.state as any;
        if (state?.searchTerm) {
            setSearchTerm(state.searchTerm);
            if (state.previewMode) {
                setInitialPreviewMode(true);
            }
            // Clear router state to prevent re-triggering
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    // Auto-select cadet for preview
    useEffect(() => {
        if (initialPreviewMode && !isLoading && cadets.length > 0) {
            // Find best match or first result
            const match = cadets.find(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())) || cadets[0];
            setSelectedCadet(match);
        }
    }, [cadets, isLoading, initialPreviewMode, searchTerm]);

    // Re-fetch when debounced search or filter changes
    useEffect(() => {
        if (statusFilter === 'GRADUATED') {
            setIsLoading(true);
            dbService.getGraduatedCohortsSummary()
                .then(data => {
                    setGraduatedCohorts(data);
                    setIsLoading(false);
                })
                .catch(err => {
                    console.error(err);
                    setIsLoading(false);
                });
        } else {
            fetchCadets(true, debouncedSearch, courseFilter, statusFilter);
        }

        const handleUpdate = () => {
            if (statusFilter === 'GRADUATED') {
                dbService.getGraduatedCohortsSummary().then(setGraduatedCohorts);
            } else {
                fetchCadets(true, debouncedSearch, courseFilter, statusFilter);
            }
        };
        window.addEventListener('cadet-registry-updated', handleUpdate);
        return () => window.removeEventListener('cadet-registry-updated', handleUpdate);
    }, [debouncedSearch, courseFilter, statusFilter]);

    const handleExploreCohort = async (courseNum: number) => {
        setSelectedGradCohort(courseNum);
        setIsLoading(true);
        try {
            const rollData = await dbService.getNominalRollData(courseNum, true);
            setGradCohortCadets(rollData);
        } catch (err) {
            console.error('Failed to load graduated nominal roll', err);
            toast.error('Failed to load nominal roll');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateNominalRoll = async () => {
        if (courseFilter === 'all') {
            toast.error('Please select a specific RC to generate a Nominal Roll.');
            return;
        }

        setIsLoading(true);
        const loadingToast = toast.loading(`Generating Nominal Roll for RC ${courseFilter}...`);
        try {
            const rollData = await dbService.getNominalRollData(courseFilter);
            if (rollData.length === 0) {
                toast.error(`No cadets found in RC ${courseFilter}.`);
                return;
            }

            await reportService.generateNominalRoll({
                rc: courseFilter,
                cadets: rollData,
                officerName: 'COMMANDANT'
            });
            toast.success(`Nominal Roll for RC ${courseFilter} generated successfully!`);
        } catch (err) {
            console.error('Failed to generate nominal roll:', err);
            toast.error('Failed to generate official Nominal Roll.');
        } finally {
            setIsLoading(false);
            toast.dismiss(loadingToast);
        }
    };

    // Keep the form default in sync with activeRC once it loads
    useEffect(() => {
        setNewCourseNumber(activeRC);
    }, [activeRC]);

    const handleAddCadet = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName || !newSquad) return;

        const data = {
            fullName: newName,
            squad: newSquad,
            courseNumber: newCourseNumber,
            yearGroup: calculateCurrentLevel(newCourseNumber, activeRC)
        };

        setPreviewData(data);
        setShowPreview(true);
    };

    const commitAddCadet = async () => {
        if (!previewData) return;

        setIsLoading(true);
        try {
            await dbService.addCadetToRegistry({
                name: previewData.fullName,
                squad: previewData.squad,
                course_number: previewData.courseNumber,
                year_group: previewData.yearGroup
            });

            try {
                // Log cadet addition as audit notification
                await dbService.addNotification({
                    type: 'cadet_added',
                    title: 'Cadet Added',
                    content: `${previewData.fullName} (RC${previewData.courseNumber}, ${previewData.squad}) added to registry`,
                    timestamp: new Date().toISOString(),
                    read: false,
                    officerName: 'Commandant',
                    yearGroup: previewData.yearGroup,
                    courseNumber: previewData.courseNumber
                });
            } catch (auditErr) {
                console.error('Failed to log audit notification for adding cadet:', auditErr);
                toast.error('Cadet added, but failed to securely log audit trail.');
            }

            setNewName('');
            setNewSquad('');
            setShowPreview(false);
            setPreviewData(null);
            fetchCadets(true);
            toast.success('Cadet added successfully!');
        } catch (err) {
            toast.error('Failed to add cadet');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteCadet = async (id: string | number, cadetName: string) => {
        if (!window.confirm('Are you sure you want to delete this cadet?')) return;

        setIsLoading(true);
        try {
            await dbService.removeCadetFromRegistry(id);
            fetchCadets(true);
            toast.success('Cadet deleted successfully!');

            try {
                // Log as audit notification
                await dbService.addNotification({
                    type: 'cadet_removed',
                    title: 'Cadet Removed',
                    content: `${cadetName} removed from registry`,
                    timestamp: new Date().toISOString(),
                    read: false,
                    officerName: 'Commandant',
                    yearGroup: 1,
                    courseNumber: 0
                });
            } catch (auditErr) {
                console.error('Failed to log audit notification for removing cadet:', auditErr);
                toast.error('Cadet deleted, but failed to securely log audit trail.');
            }
        } catch (err) {
            toast.error('Failed to delete cadet');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownloadTemplate = () => {
        downloadNPACSVTemplate();
    };


    const displayCadets = cadets.filter(c => {
        if (statusFilter === 'GRADUATED') return c.status === 'GRADUATED';
        if (statusFilter === 'RELEGATED') return c.status !== 'DISMISSED' && c.relegated_from_rc;
        if (statusFilter === 'DISMISSED') return c.status === 'DISMISSED';
        return c.status === 'ACTIVE' && !c.relegated_from_rc;
    });

    return (
        <div className="space-y-8 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b bg-blue-900 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Users size={16} />
                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em]">Cadet Enrollment Port</h3>
                    </div>
                </div>

                <div className="p-8">
                    <div className="flex flex-wrap gap-4 mb-8 p-6 bg-slate-50 rounded-md border border-slate-200">
                        <div className="flex-1 min-w-[200px]">
                            <div className="flex items-center gap-2 mb-1">
                                <p className="text-[9px] font-black text-blue-900 uppercase tracking-widest">Batch Ingress</p>
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    Dual Schema Support
                                </span>
                            </div>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                                High-volume registry synchronization supporting 2-Column NPA format and 3-Column Legacy templates.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* GET TEMPLATE DROPDOWN */}
                            <div className="relative" ref={templateMenuRef}>
                                <button
                                    type="button"
                                    onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded text-[9px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                                >
                                    <Download size={14} className="text-blue-900" />
                                    <span>Get Template</span>
                                    <ChevronDown size={12} className={`text-slate-400 transition-transform ${showTemplateMenu ? 'rotate-180' : ''}`} />
                                </button>

                                {showTemplateMenu && (
                                    <div className="absolute right-0 sm:left-0 sm:right-auto mt-2 w-72 bg-white rounded-lg shadow-xl border border-slate-200 py-2 z-30 animate-in fade-in zoom-in-95 duration-150">
                                        <div className="px-3 py-1.5 border-b border-slate-100">
                                            <p className="text-[8px] font-black uppercase tracking-widest text-blue-900">
                                                Select Enrollment Template
                                            </p>
                                        </div>

                                        {/* Option 1: New NPA Format (CSV) */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                downloadNPACSVTemplate();
                                                setShowTemplateMenu(false);
                                            }}
                                            className="w-full text-left px-3 py-2.5 hover:bg-emerald-50/70 transition-colors flex items-start gap-2.5 group"
                                        >
                                            <div className="w-7 h-7 rounded bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                                                <FileText size={14} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight group-hover:text-emerald-900">
                                                        New NPA Format (CSV)
                                                    </span>
                                                    <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[8px] font-black rounded uppercase">
                                                        Recommended
                                                    </span>
                                                </div>
                                                <p className="text-[9px] text-slate-500 font-medium leading-tight mt-0.5">
                                                    2 columns: <code className="text-slate-700 font-bold">NPA Number, Name</code>. Auto-derives RC & Squad.
                                                </p>
                                            </div>
                                        </button>

                                        {/* Option 2: New NPA Format (XLSX) */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                downloadNPAExcelTemplate();
                                                setShowTemplateMenu(false);
                                            }}
                                            className="w-full text-left px-3 py-2.5 hover:bg-blue-50/70 transition-colors flex items-start gap-2.5 group"
                                        >
                                            <div className="w-7 h-7 rounded bg-blue-100 text-blue-900 flex items-center justify-center shrink-0 mt-0.5">
                                                <FileText size={14} />
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight group-hover:text-blue-900">
                                                    New NPA Format (Excel .xlsx)
                                                </span>
                                                <p className="text-[9px] text-slate-500 font-medium leading-tight mt-0.5">
                                                    2 columns: <code className="text-slate-700 font-bold">NPA Number, Name</code>
                                                </p>
                                            </div>
                                        </button>

                                        {/* Option 3: Legacy Format (XLSX) */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                downloadLegacyExcelTemplate();
                                                setShowTemplateMenu(false);
                                            }}
                                            className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors flex items-start gap-2.5 group border-t border-slate-100"
                                        >
                                            <div className="w-7 h-7 rounded bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                                                <FileText size={14} />
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-black text-slate-700 uppercase tracking-tight group-hover:text-slate-900">
                                                    Legacy Template (Excel .xlsx)
                                                </span>
                                                <p className="text-[9px] text-slate-500 font-medium leading-tight mt-0.5">
                                                    3 columns: <code className="text-slate-700 font-bold">Name, Squad, RC_Number</code>
                                                </p>
                                            </div>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* UPLOAD DATA BUTTON */}
                            <button
                                type="button"
                                onClick={() => setIsUploadModalOpen(true)}
                                className="flex items-center gap-2 px-5 py-2.5 bg-blue-900 text-white rounded text-[9px] font-black uppercase tracking-widest hover:bg-blue-800 transition-all shadow-md active:scale-95"
                            >
                                <Upload size={14} />
                                Upload Data
                            </button>

                            {/* BULK COURSE PURGE & RE-ENROLL BUTTON */}
                            <button
                                type="button"
                                onClick={() => setIsBulkPurgeModalOpen(true)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-rose-700 text-white rounded text-[9px] font-black uppercase tracking-widest hover:bg-rose-800 transition-all shadow-md active:scale-95"
                                title="Purge one or multiple Regular Courses with CSV backup and immediately re-enroll"
                            >
                                <ShieldAlert size={14} />
                                Purge & Re-Seed Course
                            </button>
                        </div>
                    </div>

                    <form onSubmit={handleAddCadet} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50/50 p-6 rounded-md border border-slate-200">
                        <div className="space-y-1.5">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                            <input
                                placeholder="SURNAME, OTHER NAMES"
                                className="w-full px-4 py-2.5 bg-white rounded border border-slate-200 outline-none focus:ring-1 focus:ring-blue-900 font-bold text-xs uppercase"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Assigned Squad</label>
                            <input
                                placeholder="E.G. SQUAD 03"
                                className="w-full px-4 py-2.5 bg-white rounded border border-slate-200 outline-none focus:ring-1 focus:ring-blue-900 font-bold text-xs uppercase"
                                value={newSquad}
                                onChange={(e) => setNewSquad(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Regular Course</label>
                            <div className="flex flex-col gap-1">
                                <input
                                    type="number"
                                    className="w-full px-4 py-2.5 bg-white rounded border border-slate-200 outline-none focus:ring-1 focus:ring-blue-900 font-mono font-black text-sm"
                                    value={newCourseNumber}
                                    min={1}
                                    onChange={(e) => setNewCourseNumber(parseInt(e.target.value) || activeRC)}
                                    required
                                />
                                <span className="text-[8px] font-black text-blue-900 uppercase opacity-60 ml-1">
                                    {newCourseNumber ? `YEAR ${calculateCurrentLevel(newCourseNumber, activeRC)} • RC ${newCourseNumber}` : ''}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-end">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-blue-900 hover:bg-blue-800 text-white font-black text-[10px] uppercase tracking-[0.2em] py-3 rounded shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-20 translate-y-[-1px]"
                            >
                                <Plus size={16} />
                                <span>Commit Entry</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-5 border-b flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-50/50">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            placeholder="FILTER REGISTRY BY NAME OR SQUAD..."
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded outline-none focus:ring-1 focus:ring-blue-900 text-[10px] font-black uppercase tracking-widest"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex bg-slate-100/50 p-1 rounded-md border border-slate-200/60 backdrop-blur-sm">
                            {[
                                { id: 'ACTIVE', label: 'ACTIVE' },
                                { id: 'RELEGATED', label: 'RELEGATED' },
                                { id: 'DISMISSED', label: 'DISMISSED' },
                                { id: 'GRADUATED', label: 'GRADUATED' }
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setStatusFilter(opt.id as any)}
                                    className={`px-4 py-2 rounded text-[10px] font-black uppercase tracking-tight transition-all ${statusFilter === opt.id ? 'bg-white text-blue-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200">
                            {[
                                { id: 'all', label: 'ALL MODULES' },
                                ...[activeRC, activeRC - 1, activeRC - 2, activeRC - 3, activeRC - 4]
                                    .filter(rc => rc > 0)
                                    .map(rc => ({ id: rc, label: `RC ${rc}` }))
                            ].map(rcOpt => (
                                <button
                                    key={rcOpt.id}
                                    onClick={() => setCourseFilter(rcOpt.id as any)}
                                    className={`px-4 py-2 rounded text-[10px] font-black uppercase tracking-tight transition-all ${courseFilter === rcOpt.id ? 'bg-white text-blue-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {rcOpt.label}
                                </button>
                            ))}
                        </div>

                        {courseFilter !== 'all' && (
                            <button
                                onClick={handleGenerateNominalRoll}
                                disabled={isLoading}
                                className="flex items-center gap-3 px-5 py-2.5 bg-blue-900 text-white rounded-md text-[10px] font-black uppercase tracking-widest hover:bg-blue-800 transition-all shadow-md animate-in zoom-in-95 duration-300"
                            >
                                <FileText size={14} />
                                Generate Nominal Roll
                            </button>
                        )}
                    </div>
                </div>

                <div className="overflow-auto max-h-[700px]">
                    {statusFilter === 'GRADUATED' ? (
                        <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-slate-50/50 animate-in fade-in duration-300">
                            {graduatedCohorts.map(cohort => (
                                <div key={cohort.courseNumber} className="bg-blue-50/40 hover:bg-blue-50/80 rounded-xl shadow-md border border-blue-100/80 overflow-hidden group hover:border-blue-900 transition-all flex flex-col justify-between">
                                    <div className="p-6">
                                        <div className="w-12 h-12 rounded-lg bg-white text-blue-900 flex items-center justify-center font-mono font-black text-lg border border-blue-200 group-hover:bg-blue-900 group-hover:text-white transition-all shadow-sm">
                                            RC{cohort.courseNumber}
                                        </div>
                                        <h4 className="mt-4 font-black text-slate-900 uppercase tracking-tight text-sm">
                                            Regular Course {cohort.courseNumber}
                                        </h4>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">
                                            Graduated: {new Date(cohort.graduationDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                        </p>
                                        <div className="mt-4 flex items-center justify-between text-xs border-t border-blue-100/50 pt-3 font-mono">
                                            <span className="text-[9px] font-black text-slate-400 uppercase">Commissioned Officers</span>
                                            <span className="font-black text-slate-900">{cohort.totalCadets} Cadets</span>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-blue-100/20 border-t border-blue-100/40">
                                        <button
                                            onClick={() => handleExploreCohort(cohort.courseNumber)}
                                            className="w-full py-2.5 bg-white border border-blue-200 rounded-lg text-[9px] font-black uppercase tracking-widest text-blue-900 hover:bg-blue-900 hover:text-white transition-all shadow-sm flex items-center justify-center gap-2"
                                        >
                                            Explore Nominal Roll
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {graduatedCohorts.length === 0 && (
                                <div className="col-span-full py-16 text-center">
                                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No Graduated Cohorts Archived</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Desktop Table */}
                            <table className="w-full text-left hidden md:table">
                        <thead className="bg-blue-900 text-white sticky top-0 z-10">
                            <tr>
                                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest">IDENTIFICATION NAME</th>
                                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest">SQD</th>
                                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest">COURSE</th>
                                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest">YEAR</th>
                                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-right">PROTOCOL</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {displayCadets.map((cadet) => {
                                const cn = cadet.course_number;
                                const level = cn ? calculateCurrentLevel(cn, activeRC) : cadet.year_group;
                                return (
                                    <tr key={cadet.id} className={`hover:bg-slate-50/80 transition-all group font-mono ${cadet.status === 'DISMISSED' ? 'opacity-40 grayscale' : ''}`}>
                                        <td className="px-8 py-4">
                                            <div className="flex flex-col">
                                                <button
                                                    onClick={() => setSelectedCadet(cadet)}
                                                    className={`font-black uppercase tracking-tighter text-[11px] text-left ${cadet.status === 'DISMISSED' ? 'text-slate-600' : 'text-blue-900 hover:text-blue-700'}`}
                                                >
                                                    {cadet.name}
                                                </button>
                                                {cadet.npa_number && (
                                                    <span className="text-[9px] font-mono text-slate-400 font-bold tracking-wider mt-0.5">
                                                        {cadet.npa_number}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        {cadet.status === 'DISMISSED' ? (
                                            <td className="px-8 py-4" colSpan={3}>
                                                <span className="px-3 py-1 bg-rose-700 text-white rounded text-[10px] font-black uppercase tracking-widest">DISMISSED</span>
                                            </td>
                                        ) : (
                                            <>
                                                <td className="px-8 py-4 text-[11px] font-bold text-slate-500 uppercase">{cadet.squad}</td>
                                                <td className="px-8 py-4 text-[11px] font-black text-blue-900">RC {cn || '??'}</td>
                                                <td className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase">YEAR {level || '?'}</td>
                                            </>
                                        )}
                                        <td className="px-8 py-4 text-right">
                                            <button
                                                onClick={() => handleDeleteCadet(cadet.id, cadet.name)}
                                                className="text-slate-300 hover:text-rose-600 transition-colors p-2"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {displayCadets.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-8 py-24 text-center">
                                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Zero Records in Filter Range</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    {/* Mobile View */}
                    <div className="md:hidden">
                        {debouncedSearch.length > 0 ? (
                            <div className="divide-y divide-slate-100 bg-white">
                                {displayCadets.map((cadet) => {
                                    const cn = cadet.course_number;
                                    const level = cn ? calculateCurrentLevel(cn, activeRC) : cadet.year_group;
                                    return (
                                        <div key={cadet.id} className={`p-5 font-mono ${cadet.status === 'DISMISSED' ? 'opacity-40 grayscale' : ''}`}>
                                            <div className="flex justify-between items-start mb-3">
                                                <button
                                                    onClick={() => setSelectedCadet(cadet)}
                                                    className={`font-black text-xs uppercase tracking-tighter hover:underline text-left leading-tight ${cadet.status === 'DISMISSED' ? 'text-slate-600' : 'text-blue-900'}`}
                                                >
                                                    {cadet.name}
                                                </button>
                                                {cadet.npa_number && (
                                                    <span className="text-[9px] font-mono text-slate-400 font-bold tracking-wider mt-0.5 block">
                                                        {cadet.npa_number}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => handleDeleteCadet(cadet.id, cadet.name)}
                                                    className="text-slate-300 p-1"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {cadet.status === 'DISMISSED' ? (
                                                    <span className="text-[9px] font-black bg-rose-700 text-white px-2 py-0.5 rounded uppercase">
                                                        DISMISSED
                                                    </span>
                                                ) : (
                                                    <>
                                                        <span className="text-[9px] font-black bg-slate-100 px-2 py-0.5 rounded text-slate-500 uppercase">
                                                            {cadet.squad}
                                                        </span>
                                                        <span className="text-[9px] font-black bg-blue-50 text-blue-900 px-2 py-0.5 rounded uppercase">
                                                            RC {cn} | YEAR {level}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="px-8 py-24 text-center flex flex-col items-center gap-4">
                                <Search className="text-slate-200" size={40} />
                                <div>
                                    <p className="font-black text-slate-300 uppercase text-[10px] tracking-widest">Awaiting Registry Query</p>
                                    <p className="text-[9px] text-slate-200 uppercase mt-1 font-bold">Input name or unit parameter to begin trace</p>
                                </div>
                            </div>
                        )}
                        </div>
                        </>
                    )}
                </div>
                </div>

            {hasMore && statusFilter !== 'GRADUATED' && (
                <div className="flex justify-center pt-2">
                    <button
                        onClick={() => fetchCadets(false)}
                        disabled={isLoading}
                        className="flex items-center gap-3 px-10 py-3.5 bg-blue-900/5 hover:bg-blue-900/10 border border-blue-900/10 rounded-md text-[9px] font-black uppercase tracking-[0.3em] text-blue-900 transition-all disabled:opacity-20"
                    >
                        {isLoading ? (
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" />
                                Synchronizing...
                            </div>
                        ) : (
                            'Expand Buffer Range'
                        )}
                    </button>
                </div>
            )}

            {selectedCadet && (
                <CadetRecordModal
                    cadet={selectedCadet}
                    activeRC={activeRC}
                    onClose={() => {
                        setSelectedCadet(null);
                        setInitialPreviewMode(false);
                    }}
                    initialPreviewMode={initialPreviewMode}
                />
            )}

            <SubmissionPreview
                isOpen={showPreview}
                onClose={() => setShowPreview(false)}
                onConfirm={commitAddCadet}
                title="Review Cadet Enrollment"
                type="cadet"
                data={previewData}
            />

            <CadetUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                activeRC={activeRC}
                onSuccess={() => fetchCadets(true)}
            />

            <BulkCoursePurgeModal
                isOpen={isBulkPurgeModalOpen}
                onClose={() => setIsBulkPurgeModalOpen(false)}
                activeRC={activeRC}
                initialSelectedRC={courseFilter !== 'all' ? courseFilter : undefined}
                onPurgeAndSeedComplete={() => fetchCadets(true)}
            />

            {selectedGradCohort !== null && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in duration-200">
                        <div className="p-6 border-b bg-blue-900 text-white flex items-center justify-between">
                            <div>
                                <p className="text-[8px] font-black text-blue-200 uppercase tracking-[0.2em] mb-1">Archived Nominal Roll</p>
                                <h3 className="font-black text-lg tracking-tight uppercase">Regular Course {selectedGradCohort}</h3>
                            </div>
                            <button
                                onClick={() => setSelectedGradCohort(null)}
                                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white font-bold"
                            >
                                ✕
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="flex justify-between items-center mb-6">
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">
                                    Total Commissioned: <span className="font-mono text-blue-900 font-black">{gradCohortCadets.length} Officers</span>
                                </p>
                                <button
                                    onClick={async () => {
                                        const loadingToast = toast.loading(`Generating PDF Nominal Roll...`);
                                        try {
                                            await reportService.generateNominalRoll({
                                                rc: selectedGradCohort,
                                                cadets: gradCohortCadets,
                                                officerName: 'COMMANDANT'
                                            });
                                            toast.success('Nominal Roll generated!');
                                        } catch (err) {
                                            console.error(err);
                                            toast.error('Failed to generate nominal roll');
                                        } finally {
                                            toast.dismiss(loadingToast);
                                        }
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-700 transition-all border border-slate-200"
                                >
                                    <Download size={12} />
                                    Download Nominal Roll
                                </button>
                            </div>

                            <table className="w-full text-left border-collapse font-mono text-sm">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100">
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">No.</th>
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Name</th>
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Squad</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {gradCohortCadets.map((cadet, idx) => (
                                        <tr key={cadet.id} className="hover:bg-slate-50/50">
                                            <td className="px-4 py-3 text-slate-400 font-bold">{idx + 1}</td>
                                            <td className="px-4 py-3 font-black text-slate-900 uppercase">{cadet.name}</td>
                                            <td className="px-4 py-3 text-slate-500 font-bold uppercase">{cadet.squad}</td>
                                        </tr>
                                    ))}
                                    {gradCohortCadets.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-12 text-center text-slate-400">
                                                No cadets enrolled in this cohort registry.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => setSelectedGradCohort(null)}
                                className="px-6 py-2.5 bg-blue-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-md hover:bg-blue-800 transition-all"
                            >
                                Close Roster
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
