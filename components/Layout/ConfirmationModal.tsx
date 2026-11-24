import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'info';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'danger'
}) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            triggerHaptic(type === 'danger' ? 'warning' : 'light');
            window.addEventListener('keydown', handleKeyDown);
            document.body.classList.add('overflow-hidden');
        } else {
            document.body.classList.remove('overflow-hidden');
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.classList.remove('overflow-hidden');
        };
    }, [isOpen, onClose, type]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div
                    className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-auto"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-title"
                    aria-describedby="modal-desc"
                >
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => {
                            triggerHaptic('light');
                            onClose();
                        }}
                        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
                    />

                    {/* Modal Content / Mobile Sheet */}
                    <motion.div
                        initial={{ y: 80, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 80, opacity: 0, scale: 0.98 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                        className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-slate-100 overflow-hidden"
                    >
                        {/* iOS Sheet Grabber on Mobile */}
                        <div className="sm:hidden pt-3 pb-1 flex justify-center items-center">
                            <div className="w-9 h-1 rounded-full bg-slate-300" />
                        </div>

                        <div className="p-5 sm:p-7 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-7">
                            <div className="flex items-start justify-between mb-4">
                                <div
                                    className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                                        type === 'danger'
                                            ? 'bg-rose-50 text-rose-500'
                                            : 'bg-blue-50 text-blue-600'
                                    }`}
                                >
                                    <AlertTriangle size={22} />
                                </div>
                                <button
                                    onClick={() => {
                                        triggerHaptic('selection');
                                        onClose();
                                    }}
                                    aria-label="Close"
                                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors active:scale-95"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <h3 id="modal-title" className="text-lg sm:text-xl font-bold text-slate-900 mb-1.5 tracking-tight">
                                {title}
                            </h3>
                            <p id="modal-desc" className="text-sm text-slate-500 leading-relaxed">
                                {message}
                            </p>

                            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-6">
                                <button
                                    onClick={() => {
                                        triggerHaptic('light');
                                        onClose();
                                    }}
                                    className="flex-1 py-3 px-5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all active:scale-[0.98] order-2 sm:order-1"
                                >
                                    {cancelText}
                                </button>
                                <button
                                    onClick={() => {
                                        triggerHaptic(type === 'danger' ? 'heavy' : 'medium');
                                        onConfirm();
                                        onClose();
                                    }}
                                    className={`flex-1 py-3 px-5 rounded-xl text-sm font-bold text-white transition-all shadow-md active:scale-[0.98] order-1 sm:order-2 ${
                                        type === 'danger'
                                            ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                                            : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                                    }`}
                                >
                                    {confirmText}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
