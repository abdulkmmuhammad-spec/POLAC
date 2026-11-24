import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { X } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

export interface BottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
    children: React.ReactNode;
    headerRight?: React.ReactNode;
    maxHeightClass?: string; // defaults to 'max-h-[88vh]'
    showCloseButton?: boolean;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
    isOpen,
    onClose,
    title,
    subtitle,
    children,
    headerRight,
    maxHeightClass = 'max-h-[88vh]',
    showCloseButton = true
}) => {
    const isMounted = useRef(false);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (isOpen) {
            triggerHaptic('light');
            // Prevent background touch scrolling while sheet is open
            document.body.classList.add('overflow-hidden');
        } else {
            document.body.classList.remove('overflow-hidden');
        }
        return () => {
            document.body.classList.remove('overflow-hidden');
        };
    }, [isOpen]);

    const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        // Dismiss if dragged down by > 100px or dragged downwards with high velocity
        if (info.offset.y > 100 || info.velocity.y > 400) {
            triggerHaptic('selection');
            onClose();
        }
    };

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div
                    className="fixed inset-0 z-[150] flex flex-col justify-end pointer-events-auto"
                    role="dialog"
                    aria-modal="true"
                    data-drawer-open="true"
                >
                    {/* Dimmed backdrop with Apple HIG subtle blur */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => {
                            triggerHaptic('light');
                            onClose();
                        }}
                        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-0"
                    />

                    {/* Sheet Container with iOS spring physics and swipe-to-dismiss */}
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 350 }}
                        drag="y"
                        dragConstraints={{ top: 0 }}
                        dragElastic={{ top: 0, bottom: 0.6 }}
                        onDragEnd={handleDragEnd}
                        className={`relative z-10 w-full max-w-2xl mx-auto bg-white rounded-t-3xl shadow-2xl flex flex-col ${maxHeightClass} border-t border-slate-200/80`}
                    >
                        {/* iOS Drag Grabber Bar */}
                        <div className="pt-3 pb-1.5 flex justify-center items-center shrink-0 cursor-grab active:cursor-grabbing select-none">
                            <div className="w-10 h-1.5 rounded-full bg-slate-300 transition-colors" />
                        </div>

                        {/* Sheet Header */}
                        {(title || headerRight || showCloseButton) && (
                            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                                <div className="min-w-0 pr-3">
                                    {title && (
                                        <h3 className="text-base font-bold text-slate-900 tracking-tight leading-tight truncate">
                                            {title}
                                        </h3>
                                    )}
                                    {subtitle && (
                                        <p className="text-xs text-slate-500 font-medium leading-none mt-1 truncate">
                                            {subtitle}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {headerRight}
                                    {showCloseButton && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                triggerHaptic('selection');
                                                onClose();
                                            }}
                                            aria-label="Close sheet"
                                            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors active:scale-95"
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Sheet Scrollable Body with Momentum Scrolling */}
                        <div className="flex-1 overflow-y-auto overscroll-contain mobile-scroll-container p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                            {children}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
};
