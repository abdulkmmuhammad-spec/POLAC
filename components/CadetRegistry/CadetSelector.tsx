import React, { useState, useEffect } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { dbService } from '../../services/dbService';

interface CadetSelectorProps {
    /** The officer's RC course number (e.g., 12 for RC 12). Used to filter registry. */
    courseNumber: number;
    onSelect: (cadet: { name: string, squad: string }) => void;
    onInputChange?: (name: string) => void;
}

export const CadetSelector: React.FC<CadetSelectorProps> = ({ courseNumber, onSelect, onInputChange }) => {
    const [registry, setRegistry] = useState<any[]>([]);
    const [allCadets, setAllCadets] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        const fetchRegistry = async () => {
            try {
                setLoadError(null);
                console.log(`[CadetSelector] Fetching cadets for RC: ${courseNumber}`);
                // Pass courseNumber to the database query for server-side filtering
                const data = await dbService.getCadetRegistry(undefined, undefined, undefined, courseNumber);
                console.log(`[CadetSelector] Found ${data.length} cadets for RC ${courseNumber}`);
                setRegistry(data);

                // Also fetch all cadets as fallback
                const allData = await dbService.getCadetRegistry();
                console.log(`[CadetSelector] Total cadets in registry: ${allData.length}`);
                setAllCadets(allData);
            } catch (err) {
                console.error('Error fetching cadets:', err);
                setLoadError('Failed to load cadet registry');
            }
        };
        fetchRegistry();
    }, [courseNumber]);

    const filtered = registry.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.squad.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Use allCadets as fallback when registry is empty
    const displayCadets = filtered.length > 0 ? filtered :
        (searchTerm.length > 0 && allCadets.length > 0 ?
            allCadets.filter(c =>
                c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.squad.toLowerCase().includes(searchTerm.toLowerCase())
            ) : []);

    const hasRegistryData = registry.length > 0 || allCadets.length > 0;

    return (
        <div className="relative">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                    placeholder="Search registry or type new name..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsOpen(true);
                        if (onInputChange) onInputChange(e.target.value);
                    }}
                    onFocus={() => setIsOpen(true)}
                />
            </div>

            {isOpen && (searchTerm.length > 0 || hasRegistryData) && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-64 overflow-y-auto">
                    {displayCadets.length > 0 ? (
                        displayCadets.map((cadet) => (
                            <button
                                key={cadet.id}
                                className="w-full text-left px-6 py-3 hover:bg-blue-50 transition-colors border-b last:border-0 border-slate-100 flex items-center justify-between"
                                onClick={() => {
                                    onSelect({ name: cadet.name, squad: cadet.squad });
                                    setSearchTerm('');
                                    setIsOpen(false);
                                }}
                            >
                                <div>
                                    <p className="font-bold text-slate-800">{cadet.name}</p>
                                    <p className="text-xs text-slate-500">{cadet.squad} {cadet.course_number && <span className="text-blue-400">• RC {cadet.course_number}</span>}</p>
                                </div>
                                <UserPlus size={16} className="text-blue-500" />
                            </button>
                        ))
                    ) : (
                        <div className="px-6 py-8 text-center">
                            {loadError ? (
                                <p className="text-sm text-red-500 font-medium">{loadError}</p>
                            ) : (
                                <>
                                    <p className="text-sm text-slate-500 font-medium mb-1">
                                        {searchTerm ? `No cadets matching "${searchTerm}"` : `No cadets in Regular Course ${courseNumber} Registry`}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                        {registry.length === 0 && allCadets.length > 0
                                            ? `Found ${allCadets.length} cadets in other courses. Your profile may need course update.`
                                            : `Ensure the cadet is added to the Master Registry for Regular Course ${courseNumber}.`
                                        }
                                    </p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {isOpen && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </div>
    );
};
