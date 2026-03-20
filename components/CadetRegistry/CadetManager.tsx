import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Users, Search, Download, Upload, FileText } from 'lucide-react';
import { dbService } from '../../services/dbService';
import { useParade } from '../../context/ParadeContext';
import { formatRC, calculateCurrentLevel } from '../../utils/rcHelpers';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';
import { reportService } from '../../services/reportService';
import { CadetRecordModal } from './CadetRecordModal';
import { SubmissionPreview } from '../Common/SubmissionPreview';

export const CadetManager: React.FC = () => {
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

    const PAGE_SIZE = 50;

    // New Cadet Form
    const [newName, setNewName] = useState('');
    const [newSquad, setNewSquad] = useState('');
    const [newCourseNumber, setNewCourseNumber] = useState<number>(activeRC);

    const fetchCadets = async (isInitial = true, search = debouncedSearch, filter = courseFilter) => {
        setIsLoading(true);
        try {
            const from = isInitial ? 0 : cadets.length;
            const to = from + PAGE_SIZE - 1;
            const rcFilter = filter === 'all' ? undefined : filter;
            const data = await dbService.getCadetRegistry(from, to, search, rcFilter);

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

    // Re-fetch when debounced search or filter changes
    useEffect(() => {
        fetchCadets(true, debouncedSearch, courseFilter);
    }, [debouncedSearch, courseFilter]);

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
        const template = [
            { Name: 'MANI UMAR DAHIRU', Squad: 'SQUAD 3', RC_Number: 12 },
            { Name: 'ABDULSHAKUR MAI GANDI', Squad: 'SQUAD 8', RC_Number: 11 },
        ];
        const ws = XLSX.utils.json_to_sheet(template);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        XLSX.writeFile(wb, 'Cadet_Registry_Template.xlsx');
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = evt.target?.result;
                if (!data) throw new Error('Could not read file data');

                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(sheet) as any[];

                if (!json || json.length === 0) {
                    toast.error('The selected sheet appears to be empty.');
                    return;
                }

                const cadetsToUpload: any[] = [];
                const errors: string[] = [];

                json.forEach((row, index) => {
                    const name = row.Name || row.name || row.NAME || row['Full Name'] || row['Full_Name'];
                    const squad = row.Squad || row.squad || row.SQUAD || row.unit || row.Unit || row.Company || row.Platoon;

                    // Accept RC_Number, RC, Course, course_number
                    const rcRaw = row.RC_Number ?? row.RC ?? row.Course ?? row.course_number ?? row['Course Number'];
                    // Also support old "Year" column for migration convenience
                    const yearRaw = row.Year || row.year || row.year_group || row.Year_Group || row.YearGroup || row['Year Group'];

                    if (!name || !squad) {
                        if (Object.keys(row).length > 0) {
                            errors.push(`Row ${index + 2}: Missing name or squad`);
                        }
                        return;
                    }

                    let courseNumber: number | null = null;

                    if (rcRaw !== undefined && rcRaw !== null && rcRaw !== '') {
                        const parsed = parseInt(String(rcRaw).trim(), 10);
                        if (!isNaN(parsed)) courseNumber = parsed;
                    }

                    // If no RC_Number provided but Year exists, convert: course_number = active_rc - year + 1
                    if (courseNumber === null && yearRaw !== undefined) {
                        const yearStr = String(yearRaw).trim();
                        const yearMatch = yearStr.match(/(\d+)/);
                        if (yearMatch) {
                            const yearNum = parseInt(yearMatch[1], 10);
                            courseNumber = activeRC - yearNum + 1;
                        }
                    }

                    if (courseNumber === null) {
                        errors.push(`Row ${index + 2}: Missing or invalid RC_Number (e.g., 12)`);
                        return;
                    }

                    cadetsToUpload.push({
                        name: String(name).trim(),
                        squad: String(squad).trim(),
                        course_number: courseNumber,
                        year_group: calculateCurrentLevel(courseNumber, activeRC)
                    });
                });

                if (cadetsToUpload.length === 0) {
                    let msg = 'No valid cadet records found.\n\nRequired columns: Name, Squad, RC_Number\n(RC_Number is the course number, e.g., 12 for RC 12)';
                    if (errors.length > 0) msg += '\n\nIssues found:\n' + errors.slice(0, 5).join('\n') + (errors.length > 5 ? '\n...' : '');
                    toast.error(msg);
                    return;
                }

                setIsLoading(true);
                try {
                    await dbService.bulkAddCadetsToRegistry(cadetsToUpload);
                    toast.success(`Successfully imported ${cadetsToUpload.length} cadets!`);
                    if (errors.length > 0) {
                        console.warn('Some rows were skipped:', errors);
                    }
                    fetchCadets(true);

                    try {
                        // Log as audit notification
                        await dbService.addNotification({
                            type: 'cadet_added',
                            title: 'Cadets Bulk Imported',
                            content: `${cadetsToUpload.length} cadets imported via Excel upload`,
                            timestamp: new Date().toISOString(),
                            read: false,
                            officerName: 'Commandant',
                            yearGroup: 1,
                            courseNumber: 0
                        });
                    } catch (auditErr) {
                        console.error('Failed to log audit notification for bulk import:', auditErr);
                        toast.error('Import successful, but failed to log audit trail.');
                    }
                } catch (dbErr: any) {
                    console.error('Database Error during bulk import:', dbErr);
                    const errorDetails = dbErr.message || dbErr.details || 'Check for duplicate names or database connection issues.';
                    toast.error(`Database Error: ${errorDetails}`);
                }
            } catch (parseErr: any) {
                console.error('Excel Parsing Error:', parseErr);
                toast.error(`Error reading Excel file: ${parseErr.message || 'Please ensure it is a valid .xlsx file'}`);
            } finally {
                setIsLoading(false);
                if (e.target) e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };


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
                            <p className="text-[9px] font-black text-blue-900 uppercase tracking-widest mb-1">Batch Ingress</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                                High-volume registry synchronization via secure Excel uplink.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleDownloadTemplate}
                                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                            >
                                <Download size={14} />
                                Get Template
                            </button>
                            <label className="flex items-center gap-2 px-5 py-2.5 bg-blue-900 text-white rounded text-[9px] font-black uppercase tracking-widest hover:bg-blue-800 transition-all cursor-pointer shadow-md">
                                <Upload size={14} />
                                Upload Data
                                <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} disabled={isLoading} />
                            </label>
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
                            {cadets.map((cadet) => {
                                const cn = cadet.course_number;
                                const level = cn ? calculateCurrentLevel(cn, activeRC) : cadet.year_group;
                                return (
                                    <tr key={cadet.id} className="hover:bg-slate-50/80 transition-all group font-mono">
                                        <td className="px-8 py-4">
                                            <button
                                                onClick={() => setSelectedCadet(cadet)}
                                                className="font-black text-blue-900 hover:text-blue-700 text-[11px] uppercase tracking-tighter"
                                            >
                                                {cadet.name}
                                            </button>
                                        </td>
                                        <td className="px-8 py-4 text-[11px] font-bold text-slate-500 uppercase">{cadet.squad}</td>
                                        <td className="px-8 py-4 text-[11px] font-black text-blue-900">RC {cn || '??'}</td>
                                        <td className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase">YEAR {level || '?'}</td>
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
                            {cadets.length === 0 && (
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
                                {cadets.map((cadet) => {
                                    const cn = cadet.course_number;
                                    const level = cn ? calculateCurrentLevel(cn, activeRC) : cadet.year_group;
                                    return (
                                        <div key={cadet.id} className="p-5 font-mono">
                                            <div className="flex justify-between items-start mb-3">
                                                <button
                                                    onClick={() => setSelectedCadet(cadet)}
                                                    className="font-black text-blue-900 text-xs uppercase tracking-tighter hover:underline text-left leading-tight"
                                                >
                                                    {cadet.name}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteCadet(cadet.id, cadet.name)}
                                                    className="text-slate-300 p-1"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[9px] font-black bg-slate-100 px-2 py-0.5 rounded text-slate-500 uppercase">
                                                    {cadet.squad}
                                                </span>
                                                <span className="text-[9px] font-black bg-blue-50 text-blue-900 px-2 py-0.5 rounded uppercase">
                                                    RC {cn} | YEAR {level}
                                                </span>
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
                </div>
            </div>

            {hasMore && (
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
                    onClose={() => setSelectedCadet(null)}
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
        </div>
    );
};
