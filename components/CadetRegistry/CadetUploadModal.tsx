import React, { useState, useRef, useEffect } from 'react';
import {
    UploadCloud,
    Download,
    CheckCircle,
    AlertTriangle,
    AlertCircle,
    X,
    FileSpreadsheet,
    FileText,
    RefreshCw,
    ShieldCheck,
    ArrowRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { dbService } from '../../services/dbService';
import {
    parseCadetImportFile,
    downloadNPACSVTemplate,
    downloadNPAExcelTemplate,
    downloadLegacyExcelTemplate
} from '../../services/cadetImportService';
import {
    TemplateImportFormat,
    ParsedCadetRow,
    CadetImportParseResult
} from '../../types';

interface CadetUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeRC: number;
    onSuccess: (count: number) => void;
}

export const CadetUploadModal: React.FC<CadetUploadModalProps> = ({
    isOpen,
    onClose,
    activeRC,
    onSuccess
}) => {
    const { currentUser } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Format selection mode: Auto-detect, forced NPA, or forced Legacy
    const [formatMode, setFormatMode] = useState<'AUTO' | 'NPA_FORMAT' | 'LEGACY_FORMAT'>('AUTO');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [parseResult, setParseResult] = useState<CadetImportParseResult | null>(null);
    const [rowTab, setRowTab] = useState<'all' | 'valid' | 'errors'>('all');
    const [isDragging, setIsDragging] = useState(false);

    // Reset state when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setSelectedFile(null);
            setParseResult(null);
            setIsParsing(false);
            setIsImporting(false);
            setRowTab('all');
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [isOpen]);

    // Handle file parsing when file or format mode changes
    const processFile = async (file: File, mode = formatMode) => {
        setSelectedFile(file);
        setIsParsing(true);
        try {
            const result = await parseCadetImportFile(file, {
                formatMode: mode,
                activeRC
            });
            setParseResult(result);
            if (result.invalidRows.length > 0 && result.validRows.length === 0) {
                setRowTab('errors');
            } else {
                setRowTab('all');
            }
        } catch (err: any) {
            console.error('File parsing failure:', err);
            toast.error(`Error reading file: ${err.message || 'Check file format'}`);
            setParseResult(null);
        } finally {
            setIsParsing(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    const handleFormatModeChange = (newMode: 'AUTO' | 'NPA_FORMAT' | 'LEGACY_FORMAT') => {
        setFormatMode(newMode);
        if (selectedFile) {
            processFile(selectedFile, newMode);
        }
    };

    // Drag and Drop
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            const ext = file.name.split('.').pop()?.toLowerCase();
            if (['csv', 'xlsx', 'xls'].includes(ext || '')) {
                processFile(file);
            } else {
                toast.error('Please upload a valid .csv, .xlsx, or .xls file.');
            }
        }
    };

    // Commit Import to Database
    const handleCommitImport = async () => {
        if (!parseResult || parseResult.validRows.length === 0) return;

        // Map and pre-deduplicate by NPA number to ensure zero intra-batch collisions
        const seenNpas = new Set<string>();
        const cadetsToUpload: {
            name: string;
            squad: string;
            course_number: number;
            year_group?: number;
            npa_number?: string;
            admission_year?: number;
            status: string;
        }[] = [];

        for (const row of parseResult.validRows) {
            if (row.npa_number && row.npa_number.trim() !== '') {
                const norm = row.npa_number.trim().toUpperCase();
                if (seenNpas.has(norm)) continue;
                seenNpas.add(norm);
                cadetsToUpload.push({
                    name: row.name,
                    squad: row.squad,
                    course_number: row.course_number,
                    year_group: row.year_group,
                    npa_number: norm,
                    admission_year: row.admission_year,
                    status: 'ACTIVE'
                });
            } else {
                cadetsToUpload.push({
                    name: row.name,
                    squad: row.squad,
                    course_number: row.course_number,
                    year_group: row.year_group,
                    npa_number: undefined,
                    admission_year: row.admission_year,
                    status: 'ACTIVE'
                });
            }
        }

        setIsImporting(true);
        const toastId = toast.loading(`Ingesting ${cadetsToUpload.length} cadet records...`);

        try {
            await dbService.bulkAddCadetsToRegistry(
                cadetsToUpload,
                currentUser?.id ? String(currentUser.id) : undefined
            );

            toast.dismiss(toastId);
            toast.success(`Successfully enrolled ${cadetsToUpload.length} cadets into the academy registry!`);

            // Audit notification
            try {
                await dbService.addNotification({
                    type: 'cadet_added',
                    title: 'Cadets Bulk Enrolled',
                    content: `${cadetsToUpload.length} cadets enrolled via ${
                        parseResult.detectedFormat === 'NPA_FORMAT' ? 'New NPA Number Template' : 'Legacy Template'
                    }`,
                    timestamp: new Date().toISOString(),
                    read: false,
                    officerName: currentUser?.fullName || 'Commandant',
                    yearGroup: 1,
                    courseNumber: 0
                });
            } catch (auditErr) {
                console.warn('Failed to dispatch audit notification for batch enrollment:', auditErr);
            }

            onSuccess(cadetsToUpload.length);
            onClose();
        } catch (dbErr: any) {
            toast.dismiss(toastId);
            console.error('Database Error during bulk ingress:', dbErr);
            let msg = dbErr.message || dbErr.details || 'Check database permissions and constraints.';
            if (dbErr.code === '21000' || String(msg).includes('ON CONFLICT DO UPDATE')) {
                msg = 'Duplicate cadet records detected in the upload batch. Each NPA Number must be unique within the file.';
            }
            toast.error(`Ingestion Failed: ${msg}`);
        } finally {
            setIsImporting(false);
        }
    };

    if (!isOpen) return null;

    // Rows to display based on active filter tab
    const rowsToDisplay: ParsedCadetRow[] = parseResult
        ? rowTab === 'valid'
            ? parseResult.validRows
            : rowTab === 'errors'
            ? parseResult.invalidRows
            : parseResult.allRows
        : [];

    return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
                {/* MODAL HEADER */}
                <div className="p-5 bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 text-white flex items-center justify-between border-b border-blue-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-800/80 border border-blue-700/80 flex items-center justify-center shadow-inner">
                            <UploadCloud size={20} className="text-blue-200" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-black uppercase tracking-[0.18em]">
                                    Cadet Enrollment Ingress Port
                                </h3>
                                <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    Dual Template Engine
                                </span>
                            </div>
                            <p className="text-[10px] text-blue-200 font-medium">
                                Concurrent ingestion: Supports New NPA Number (2-Column) and Legacy (3-Column) spreadsheets
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isImporting}
                        className="text-blue-300 hover:text-white p-2 rounded-lg hover:bg-blue-800/50 transition-colors disabled:opacity-50"
                        title="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* TEMPLATE DOWNLOAD BAR */}
                <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-slate-600">
                        <FileSpreadsheet size={16} className="text-blue-900 shrink-0" />
                        <span className="font-bold text-[10px] uppercase tracking-wider text-slate-500">
                            Download Official Templates:
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {/* New NPA Format Download (CSV) */}
                        <button
                            type="button"
                            onClick={downloadNPACSVTemplate}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[9px] font-black uppercase tracking-wider shadow-sm transition-all group"
                            title="2 Columns: NPA Number, Name"
                        >
                            <Download size={12} className="group-hover:translate-y-0.5 transition-transform" />
                            <span>New NPA Format (CSV)</span>
                        </button>

                        {/* New NPA Format Download (Excel) */}
                        <button
                            type="button"
                            onClick={downloadNPAExcelTemplate}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-800 border border-blue-200 rounded text-[9px] font-black uppercase tracking-wider shadow-sm transition-all group"
                            title="2 Columns: NPA Number, Name (.xlsx)"
                        >
                            <Download size={12} className="group-hover:translate-y-0.5 transition-transform" />
                            <span>New NPA Format (XLSX)</span>
                        </button>

                        {/* Legacy Format Download (Excel) */}
                        <button
                            type="button"
                            onClick={downloadLegacyExcelTemplate}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-[9px] font-black uppercase tracking-wider shadow-sm transition-all group"
                            title="3 Columns: Name, Squad, RC_Number (.xlsx)"
                        >
                            <Download size={12} className="group-hover:translate-y-0.5 transition-transform" />
                            <span>Legacy Format (XLSX)</span>
                        </button>
                    </div>
                </div>

                {/* MODAL BODY */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    {/* FORMAT MODE SELECTOR */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-100/70 rounded-lg border border-slate-200">
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                Ingestion Mode & Schema Matcher
                            </p>
                            <p className="text-[10px] text-slate-600 font-medium">
                                Auto-detect analyzes headers automatically, or you can force a schema.
                            </p>
                        </div>
                        <div className="flex bg-white p-1 rounded-md border border-slate-200 shadow-sm shrink-0">
                            {[
                                { id: 'AUTO', label: '⚡ Auto-Detect' },
                                { id: 'NPA_FORMAT', label: '📄 NPA Format (2-Col)' },
                                { id: 'LEGACY_FORMAT', label: '📋 Legacy (3-Col)' }
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => handleFormatModeChange(opt.id as any)}
                                    className={`px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-tight transition-all ${
                                        formatMode === opt.id
                                            ? 'bg-blue-900 text-white shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* DROPZONE / FILE SELECTOR */}
                    {!selectedFile ? (
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                                isDragging
                                    ? 'border-blue-700 bg-blue-50/60 scale-[0.99]'
                                    : 'border-slate-300 hover:border-blue-900 bg-slate-50/50 hover:bg-blue-50/30'
                            }`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv, .xlsx, .xls"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                            <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-900 flex items-center justify-center mx-auto mb-3 shadow-inner">
                                <UploadCloud size={28} />
                            </div>
                            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-1">
                                Drop Cadet Enrollment File Here, or Click to Browse
                            </h4>
                            <p className="text-xs text-slate-500 max-w-md mx-auto mb-3">
                                Supports CSV, XLSX, and XLS formats. Accepts either the <span className="font-bold text-slate-700">New NPA Template</span> (NPA Number, Name) or <span className="font-bold text-slate-700">Legacy Template</span> (Name, Squad, RC_Number).
                            </p>
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white border border-slate-200 rounded-full text-[9px] font-black uppercase tracking-widest text-slate-600 shadow-sm">
                                <span>Accepted extensions: .csv, .xlsx, .xls</span>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* ACTIVE FILE BANNER */}
                            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-blue-50/60 rounded-lg border border-blue-200">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-md bg-blue-900 text-white flex items-center justify-center font-bold">
                                        <FileSpreadsheet size={18} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-xs text-slate-900 uppercase">
                                                {selectedFile.name}
                                            </span>
                                            <span className="text-[10px] font-mono text-slate-500 font-bold">
                                                ({(selectedFile.size / 1024).toFixed(1)} KB)
                                            </span>
                                        </div>
                                        {parseResult && (
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                                    parseResult.detectedFormat === 'NPA_FORMAT'
                                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                        : parseResult.detectedFormat === 'LEGACY_FORMAT'
                                                        ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                                                }`}>
                                                    {parseResult.detectedFormat === 'NPA_FORMAT' && '⚡ Detected: New NPA 2-Column Template'}
                                                    {parseResult.detectedFormat === 'LEGACY_FORMAT' && '📋 Detected: Legacy 3-Column Template'}
                                                    {parseResult.detectedFormat === 'UNKNOWN' && '⚠️ Unknown Schema Format'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={isParsing || isImporting}
                                        onClick={() => fileInputRef.current?.click()}
                                        className="px-3 py-1.5 bg-white border border-slate-300 rounded text-[9px] font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                                    >
                                        Change File
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".csv, .xlsx, .xls"
                                        onChange={handleFileChange}
                                        className="hidden"
                                    />
                                </div>
                            </div>

                            {/* PARSING LOADER */}
                            {isParsing && (
                                <div className="p-8 text-center bg-slate-50 rounded-lg border border-slate-200">
                                    <RefreshCw className="animate-spin text-blue-900 mx-auto mb-2" size={24} />
                                    <p className="text-xs font-black text-slate-700 uppercase tracking-widest">
                                        Analyzing Schema & Validating Rows...
                                    </p>
                                </div>
                            )}

                            {/* PARSE RESULTS & PREVIEW TABLE */}
                            {!isParsing && parseResult && (
                                <div className="space-y-4">
                                    {/* METRICS STRIP */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                                Total Rows
                                            </p>
                                            <p className="text-xl font-mono font-black text-slate-800">
                                                {parseResult.totalRows}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-center">
                                            <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">
                                                Ready to Ingest
                                            </p>
                                            <p className="text-xl font-mono font-black text-emerald-700">
                                                {parseResult.validRows.length}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-lg text-center">
                                            <p className="text-[8px] font-black text-rose-600 uppercase tracking-widest">
                                                Issues / Skipped
                                            </p>
                                            <p className="text-xl font-mono font-black text-rose-700">
                                                {parseResult.invalidRows.length}
                                            </p>
                                        </div>
                                    </div>

                                    {/* GLOBAL OR CRITICAL ERRORS */}
                                    {parseResult.globalErrors.length > 0 && (
                                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                                            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-600" />
                                            <div>
                                                <p className="font-bold uppercase tracking-wider text-[10px]">
                                                    File Parsing Problem:
                                                </p>
                                                {parseResult.globalErrors.map((err, i) => (
                                                    <p key={i}>{err}</p>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* FILTER TABS */}
                                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setRowTab('all')}
                                                className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all ${
                                                    rowTab === 'all'
                                                        ? 'bg-blue-900 text-white'
                                                        : 'text-slate-600 hover:bg-slate-100'
                                                }`}
                                            >
                                                All Rows ({parseResult.totalRows})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setRowTab('valid')}
                                                className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all ${
                                                    rowTab === 'valid'
                                                        ? 'bg-emerald-600 text-white'
                                                        : 'text-slate-600 hover:bg-slate-100'
                                                }`}
                                            >
                                                Valid ({parseResult.validRows.length})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setRowTab('errors')}
                                                className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all ${
                                                    rowTab === 'errors'
                                                        ? 'bg-rose-600 text-white'
                                                        : 'text-slate-600 hover:bg-slate-100'
                                                }`}
                                            >
                                                Issues ({parseResult.invalidRows.length})
                                            </button>
                                        </div>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                                            Showing {rowsToDisplay.length} of {parseResult.totalRows} records
                                        </span>
                                    </div>

                                    {/* PREVIEW TABLE */}
                                    <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[340px] overflow-y-auto">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead className="bg-slate-800 text-white font-black uppercase tracking-widest text-[8px] sticky top-0 z-10">
                                                <tr>
                                                    <th className="py-2.5 px-3 w-12 text-center">Row</th>
                                                    <th className="py-2.5 px-3">NPA Number</th>
                                                    <th className="py-2.5 px-3">Cadet Name</th>
                                                    <th className="py-2.5 px-3">Derived Squad</th>
                                                    <th className="py-2.5 px-3">Admission Year</th>
                                                    <th className="py-2.5 px-3">Derived RC</th>
                                                    <th className="py-2.5 px-3">Status / Diagnostics</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {rowsToDisplay.map((row) => (
                                                    <tr
                                                        key={row.rowNumber}
                                                        className={`transition-colors font-mono ${
                                                            !row.isValid
                                                                ? 'bg-rose-50/70 hover:bg-rose-100/70'
                                                                : 'hover:bg-slate-50/80'
                                                        }`}
                                                    >
                                                        <td className="py-2.5 px-3 text-center text-slate-400 text-[10px] font-bold">
                                                            {row.rowNumber}
                                                        </td>
                                                        <td className="py-2.5 px-3 font-mono font-bold text-[10px] text-slate-700">
                                                            {row.npa_number ? (
                                                                <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 border border-slate-200">
                                                                    {row.npa_number}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400 font-normal italic">
                                                                    (Legacy / None)
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-2.5 px-3 font-bold text-slate-900 text-[11px] uppercase">
                                                            {row.name}
                                                        </td>
                                                        <td className="py-2.5 px-3 font-bold text-slate-600 text-[10px] uppercase">
                                                            {row.squad}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-[10px] font-bold text-slate-600">
                                                            {row.admission_year || '—'}
                                                        </td>
                                                        <td className="py-2.5 px-3 font-black text-blue-900 text-[10px]">
                                                            {row.course_number > 0 ? (
                                                                <span>RC {row.course_number}</span>
                                                            ) : (
                                                                <span className="text-rose-500">Unmapped</span>
                                                            )}
                                                        </td>
                                                        <td className="py-2.5 px-3">
                                                            {row.isValid ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                                    <CheckCircle size={10} />
                                                                    Valid
                                                                </span>
                                                            ) : (
                                                                <div className="space-y-1">
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300">
                                                                        <AlertTriangle size={10} />
                                                                        Format Error
                                                                    </span>
                                                                    {row.errors.map((err, errIdx) => (
                                                                        <p
                                                                            key={errIdx}
                                                                            className="text-[9px] font-sans font-bold text-rose-700 leading-tight"
                                                                        >
                                                                            • {err}
                                                                        </p>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {rowsToDisplay.length === 0 && (
                                                    <tr>
                                                        <td colSpan={7} className="py-12 text-center text-slate-400">
                                                            <p className="text-[10px] font-black uppercase tracking-widest">
                                                                No records match current tab filter
                                                            </p>
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* SAFE UPSERT / CONFLICT NOTE */}
                                    <div className="flex items-start gap-2.5 p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-emerald-950 text-xs">
                                        <ShieldCheck size={16} className="text-emerald-700 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-black text-[10px] uppercase tracking-wider text-emerald-900">
                                                Safe Conflict-Free Ingestion Guaranteed
                                            </p>
                                            <p className="text-[10px] text-emerald-800 font-medium">
                                                Cadets with existing NPA numbers are updated in-place without duplicate errors. Records with formatting issues will be safely skipped.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* MODAL FOOTER */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isImporting}
                        className="px-4 py-2 border border-slate-300 rounded text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>

                    <div className="flex items-center gap-3">
                        {parseResult && parseResult.validRows.length > 0 && (
                            <button
                                type="button"
                                onClick={handleCommitImport}
                                disabled={isImporting || parseResult.validRows.length === 0}
                                className="flex items-center gap-2 px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded text-[10px] font-black uppercase tracking-[0.18em] shadow-lg transition-all disabled:opacity-50"
                            >
                                {isImporting ? (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" />
                                        <span>Enrolling Cadets...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Commit Ingress ({parseResult.validRows.length} Cadets)</span>
                                        <ArrowRight size={14} />
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

