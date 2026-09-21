import React, { useState, useEffect } from 'react';
import { ShieldAlert, X, Lock, Unlock } from 'lucide-react';

interface SecurityOverrideModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAuthorize: (password: string) => Promise<void>;
    targetName: string;
}

export const SecurityOverrideModal: React.FC<SecurityOverrideModalProps> = ({ 
    isOpen, 
    onClose, 
    onAuthorize,
    targetName 
}) => {
    const [password, setPassword] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const traceId = React.useMemo(() => Math.random().toString(36).substring(2, 10).toUpperCase(), []);

    useEffect(() => {
        if (!isOpen) {
            setPassword('');
            setIsThinking(false);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!password || isThinking) return;
        setIsThinking(true);
        try {
            await onAuthorize(password);
            setPassword('');
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="bg-[#0a0a0a] w-full max-w-lg rounded-2xl border border-red-500/30 shadow-[0_0_50px_-12px_rgba(239,68,68,0.3)] overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Alert Header */}
                <div className="bg-red-950/20 p-6 border-b border-red-500/10 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
                            <ShieldAlert size={24} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-red-500 uppercase tracking-[0.2em]">Restricted Action</h2>
                            <p className="text-[10px] text-red-500/60 font-bold uppercase tracking-widest">Credential Modification Protocol</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="space-y-4">
                        <p className="text-slate-400 text-xs leading-relaxed font-medium">
                            You are about to alter access protocols for <span className="text-white font-black underline decoration-red-500/50">{targetName}</span>. 
                            To verify authorization, enter your current administration password.
                        </p>

                        <div className="relative">
                            <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="password"
                                placeholder="ENTER COMMANDANT PASSWORD"
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-12 py-4 text-xs text-white focus:border-red-500/50 outline-none transition-all font-mono tracking-[0.4em]"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 text-red-400">
                            <Lock size={12} className="shrink-0" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Warning Level: Critical</span>
                        </div>
                        <p className="text-[10px] text-red-400/80 font-bold leading-tight">
                            SYSTEM LOGS WILL RECORD THIS OVERRIDE IN THE FORENSIC ARCHIVE. UNVERIFIED ATTEMPTS ARE REPORTED.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3">
                        <button
                            type="submit"
                            disabled={!password || isThinking}
                            className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-red-900/20 flex items-center justify-center gap-3 group disabled:opacity-50 disabled:grayscale"
                        >
                            <Unlock size={18} className="group-hover:scale-110 transition-transform" />
                            <span className="text-xs uppercase tracking-[0.2em]">{isThinking ? 'VERIFYING...' : 'Authorize Modification'}</span>
                        </button>
                        
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full bg-transparent hover:bg-white/5 text-slate-500 hover:text-white font-black py-4 rounded-xl transition-all border border-white/10 flex items-center justify-center gap-2"
                        >
                            <X size={16} />
                            <span className="text-xs uppercase tracking-[0.2em]">Abort Command</span>
                        </button>
                    </div>
                </form>

                {/* Footer Traceability */}
                <div className="p-4 bg-black border-t border-white/5 text-center">
                    <p className="text-[8px] font-black text-slate-700 uppercase tracking-[0.3em]">
                        Authenticated Session: PROVISIONAL • TRACE ID: {traceId}
                    </p>
                </div>
            </div>
        </div>
    );
};
