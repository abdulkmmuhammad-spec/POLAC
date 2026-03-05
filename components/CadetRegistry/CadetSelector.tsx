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
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const fetchRegistry = async () => {
            const data = await dbService.getCadetRegistry();
            // Filter by the officer's course number (RC) — the stable identifier
            setRegistry(data.filter(c => c.course_number === courseNumber));
        };
        fetchRegistry();
    }, [courseNumber]);

    const filtered = registry.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.squad.toLowerCase().includes(searchTerm.toLowerCase())
    );

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

            {isOpen && (searchTerm.length > 0 || registry.length > 0) && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-64 overflow-y-auto">
                    {filtered.length > 0 ? (
                        filtered.map((cadet) => (
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
                                    <p className="text-xs text-slate-500">{cadet.squad}</p>
                                </div>
                                <UserPlus size={16} className="text-blue-500" />
                            </button>
                        ))
                    ) : (
                        <div className="px-6 py-8 text-center">
                            <p className="text-sm text-slate-500 font-medium mb-1">
                                No matching cadets in Regular Course {courseNumber} Registry
                            </p>
                            <p className="text-[10px] text-slate-400">
                                Ensure the cadet is added to the Master Registry for Regular Course {courseNumber}.
                            </p>
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
