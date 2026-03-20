import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, X, ShieldCheck } from 'lucide-react';

interface SubmissionPreviewProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    type: 'parade' | 'cadet';
    data: any;
}

export const SubmissionPreview: React.FC<SubmissionPreviewProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    type,
    data
}) => {
    const [declared, setDeclared] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);
    const previousFocus = useRef<HTMLElement | null>(null);

    const titleId = `preview-title-${title.replace(/\s+/g, '-').toLowerCase()}`;

    // Accessibility: Focus Handling & ESC Key
    useEffect(() => {
        if (isOpen) {
            previousFocus.current = document.activeElement as HTMLElement;
            modalRef.current?.focus();

            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') onClose();

                if (e.key === 'Tab') {
                    const focusableElements = modalRef.current?.querySelectorAll(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    );
                    if (!focusableElements || focusableElements.length === 0) return;

                    const firstElement = focusableElements[0] as HTMLElement;
                    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

                    if (e.shiftKey) { // Shift + Tab
                        if (document.activeElement === firstElement) {
                            lastElement.focus();
                            e.preventDefault();
                        }
                    } else { // Tab
                        if (document.activeElement === lastElement) {
                            firstElement.focus();
                            e.preventDefault();
                        }
                    }
                }
            };

            window.addEventListener('keydown', handleKeyDown);
            return () => {
                window.removeEventListener('keydown', handleKeyDown);
                previousFocus.current?.focus();
            };
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
        >
            <div
                ref={modalRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300 focus:outline-none"
            >
                {/* Header */}
                <div className="bg-blue-900 p-6 flex items-center justify-between text-white">
                    <div className="flex items-center gap-3">
                        <ShieldCheck size={24} className="text-blue-400" />
                        <div>
                            <h3 id={titleId} className="text-lg font-black uppercase tracking-widest">{title}</h3>
                            <p className="text-[10px] text-blue-300 font-bold uppercase tracking-widest">Administrative Verification Gate</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-blue-800 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                    {/* Content based on type */}
                    {type === 'parade' ? (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Cadets Present</p>
                                    <p className="text-3xl font-black text-emerald-700 font-mono">{data.presentCount}</p>
                                </div>
                                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Total Strength</p>
                                    <p className="text-3xl font-black text-blue-700 font-mono">{data.grandTotal}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Absences</p>
                                    <p className="text-xl font-black text-slate-700">{data.absentCount || 'NIL'}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Medical</p>
                                    <p className="text-xl font-black text-slate-700">{data.sickCount || 'NIL'}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Detention</p>
                                    <p className="text-xl font-black text-slate-700">{data.detentionCount || 'NIL'}</p>
                                </div>
                            </div>

                            {data.cadets && data.cadets.length > 0 && (
                                <div className="space-y-3">
                                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2">Nominal Roll Exceptions</p>
                                    <div className="space-y-2">
                                        {data.cadets.map((c: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-xl border border-dotted border-slate-200">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-black text-blue-700">
                                                        {c.name ? c.name.charAt(0).toUpperCase() : '?'}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-800">{c.name}</p>
                                                        <p className="text-[10px] text-slate-500 font-medium">{c.squad}</p>
                                                    </div>
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-tighter bg-slate-200 px-2 py-0.5 rounded text-slate-700">
                                                    {c.status}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex items-center gap-6 p-6 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                                <div className="w-20 h-20 bg-blue-900 rounded-full flex items-center justify-center text-white text-3xl font-black shadow-lg">
                                    {data.fullName ? data.fullName.charAt(0).toUpperCase() : '?'}
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs font-black text-blue-600 uppercase tracking-[0.2em]">Cadet Candidate</p>
                                    <h4 className="text-2xl font-black text-slate-900 tracking-tight">{data.fullName}</h4>
                                    <div className="flex gap-2">
                                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest">RC {data.courseNumber}</span>
                                        <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest">{data.squad}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Institutional Level</p>
                                    <p className="text-base font-bold text-slate-800">YEAR {data.yearGroup}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entry Date</p>
                                    <p className="text-base font-bold text-slate-800">
                                        {data.entryDate ? new Date(data.entryDate).toLocaleDateString() : '—'}
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
                                <CheckCircle size={18} className="text-emerald-600" />
                                <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">All mandatory credentials verified</p>
                            </div>
                        </div>
                    )}

                    {/* Declaration */}
                    <label className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100 cursor-pointer group hover:bg-amber-100/50 transition-colors">
                        <input
                            type="checkbox"
                            className="mt-1 w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                            checked={declared}
                            onChange={(e) => setDeclared(e.target.checked)}
                        />
                        <span className="text-xs font-bold text-amber-800 leading-relaxed uppercase tracking-tight">
                            I certify that the information provided is accurate and reflects the current standing of the formation under my command.
                        </span>
                    </label>
                </div>

                {/* Actions */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-4 rounded-xl border border-slate-200 bg-white text-slate-600 font-black uppercase text-xs tracking-[0.2em] hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                    >
                        Return to Edit
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={!declared}
                        className={`flex-1 py-4 rounded-xl font-black uppercase text-xs tracking-[0.2em] transition-all shadow-lg active:scale-95 ${declared ? 'bg-blue-900 text-white hover:bg-blue-800 shadow-blue-900/10' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                    >
                        Confirm Submission
                    </button>
                </div>
            </div>
        </div>
    );
};
