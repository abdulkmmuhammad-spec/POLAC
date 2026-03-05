import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Users, Search, Download, Upload } from 'lucide-react';
import { dbService } from '../../services/dbService';
import { useParade } from '../../context/ParadeContext';
import { formatRC, calculateCurrentLevel } from '../../utils/rcHelpers';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';
import { CadetRecordModal } from './CadetRecordModal';

export const CadetManager: React.FC = () => {
    const { activeRC } = useParade();
    const [cadets, setCadets] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [hasMore, setHasMore] = useState(true);
    const [selectedCadet, setSelectedCadet] = useState<any | null>(null);

    const PAGE_SIZE = 50;

    // New Cadet Form
    const [newName, setNewName] = useState('');
    const [newSquad, setNewSquad] = useState('');
    const [newCourseNumber, setNewCourseNumber] = useState<number>(activeRC);

    const fetchCadets = async (isInitial = true, search = debouncedSearch) => {
        setIsLoading(true);
        try {
            const from = isInitial ? 0 : cadets.length;
            const to = from + PAGE_SIZE - 1;
            const data = await dbService.getCadetRegistry(from, to, search);

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

    // Re-fetch when debounced search changes
    useEffect(() => {
        fetchCadets(true, debouncedSearch);
    }, [debouncedSearch]);

    // Keep the form default in sync with activeRC once it loads
    useEffect(() => {
        setNewCourseNumber(activeRC);
    }, [activeRC]);

    const handleAddCadet = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName || !newSquad) return;

        setIsLoading(true);
        try {
            await dbService.addCadetToRegistry({
                name: newName,
                squad: newSquad,
                course_number: newCourseNumber,
                // also write year_group for backward compat
                year_group: calculateCurrentLevel(newCourseNumber, activeRC)
            });
            setNewName('');
            setNewSquad('');
            fetchCadets(true);
            toast.success('Cadet added successfully!');
        } catch (err) {
            toast.error('Failed to add cadet');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteCadet = async (id: string | number) => {
        if (!window.confirm('Are you sure you want to delete this cadet?')) return;

        setIsLoading(true);
        try {
            await dbService.removeCadetFromRegistry(id);
            fetchCadets(true);
            toast.success('Cadet deleted successfully!');
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
        <div className="space-y-8 max-w-5xl mx-auto">
            <div className="bg-white p-4 md:p-8 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-6">
                    <Users className="text-blue-600" />
                    Master Cadet Registry
                </h3>

                <div className="flex flex-wrap gap-4 mb-8 p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <div className="flex-1 min-w-[200px]">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Bulk Actions</h4>
                        <p className="text-[10px] text-slate-500">
                            Upload an Excel file with columns: <strong>Name</strong>, <strong>Squad</strong>, <strong>RC_Number</strong> (e.g., 12)
                        </p>
                    </div>
                    <button
                        onClick={handleDownloadTemplate}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                    >
                        <Download size={14} />
                        Download Template
                    </button>
                    <label className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs font-bold text-blue-600 hover:bg-blue-100 transition-all cursor-pointer shadow-sm">
                        <Upload size={14} />
                        Upload Excel
                        <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} disabled={isLoading} />
                    </label>
                </div>

                <form onSubmit={handleAddCadet} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <input
                        placeholder="Cadet Full Name"
                        className="px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        required
                    />
                    <input
                        placeholder="Squad / Unit"
                        className="px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                        value={newSquad}
                        onChange={(e) => setNewSquad(e.target.value)}
                        required
                    />
                    <div className="space-y-1">
                        <input
                            type="number"
                            placeholder={`Regular Course No. (e.g. ${activeRC})`}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                            value={newCourseNumber}
                            min={1}
                            onChange={(e) => setNewCourseNumber(parseInt(e.target.value) || activeRC)}
                            required
                        />
                        <p className="text-[10px] text-slate-400 pl-1">
                            {newCourseNumber ? `= ${formatRC(newCourseNumber)} • Year ${calculateCurrentLevel(newCourseNumber, activeRC)}` : ''}
                        </p>
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                    >
                        <Plus size={20} />
                        <span>Add Cadet</span>
                    </button>
                </form>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 md:p-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            placeholder="Search cadets..."
                            className="w-full pl-10 pr-4 py-3 md:py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <p className="text-xs md:text-sm text-slate-500 font-medium">{cadets.length} Cadets Listed {debouncedSearch ? '(Filtered)' : ''}</p>
                </div>

                <div className="overflow-auto max-h-[600px]">
                    {/* Desktop Table */}
                    <table className="w-full text-left hidden md:table">
                        <thead className="bg-slate-50 border-b sticky top-0 z-10">
                            <tr>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Name</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Squad</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Regular Course</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Current Year</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {cadets.map((cadet) => {
                                const cn = cadet.course_number;
                                const level = cn ? calculateCurrentLevel(cn, activeRC) : cadet.year_group;
                                return (
                                    <tr key={cadet.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-8 py-4">
                                            <button
                                                onClick={() => setSelectedCadet(cadet)}
                                                className="font-bold text-blue-600 hover:text-blue-800 hover:underline text-left"
                                            >
                                                {cadet.name}
                                            </button>
                                        </td>
                                        <td className="px-8 py-4 text-slate-600 font-medium">{cadet.squad}</td>
                                        <td className="px-8 py-4">
                                            {cn ? (
                                                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">
                                                    {formatRC(cn)}
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 italic text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="px-8 py-4 text-slate-600 font-medium">
                                            {level ? `Year ${level}` : '—'}
                                        </td>
                                        <td className="px-8 py-4 text-right">
                                            <button
                                                onClick={() => handleDeleteCadet(cadet.id)}
                                                className="text-slate-300 hover:text-rose-600 transition-colors p-2"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {cadets.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-8 py-20 text-center italic text-slate-400">
                                        No cadets found matching your search.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    {/* Mobile View: Cards (Only shown when searching) */}
                    <div className="md:hidden">
                        {debouncedSearch.length > 0 ? (
                            <div className="divide-y divide-slate-100">
                                {cadets.map((cadet) => {
                                    const cn = cadet.course_number;
                                    const level = cn ? calculateCurrentLevel(cn, activeRC) : cadet.year_group;
                                    return (
                                        <div key={cadet.id} className="p-4 active:bg-slate-50">
                                            <div className="flex justify-between items-start mb-1">
                                                <button
                                                    onClick={() => setSelectedCadet(cadet)}
                                                    className="font-bold text-blue-600 text-lg hover:underline text-left"
                                                >
                                                    {cadet.name}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteCadet(cadet.id)}
                                                    className="text-slate-300 p-2"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                                <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                                                    {cadet.squad}
                                                </span>
                                                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                                    RC {cn} • Yr {level}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                                {cadets.length === 0 && (
                                    <div className="px-8 py-20 text-center italic text-slate-400">
                                        No cadets found matching "{debouncedSearch}".
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="px-8 py-20 text-center flex flex-col items-center gap-3">
                                <Search className="text-slate-200" size={48} />
                                <div>
                                    <p className="font-bold text-slate-400">Ready to search</p>
                                    <p className="text-xs text-slate-300">Start typing a name or squad to see results</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {hasMore && (
                <div className="flex justify-center pt-4">
                    <button
                        onClick={() => fetchCadets(false)}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-8 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 hover:border-blue-200 hover:text-blue-600 transition-all shadow-sm disabled:opacity-50"
                    >
                        {isLoading ? (
                            <span className="flex items-center gap-2">
                                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                Loading...
                            </span>
                        ) : (
                            'Load More Cadets'
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
        </div>
    );
};
