import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface TabRoute {
    path: string;
    label: string;
}

interface ActiveDragIndicator {
    direction: 'left' | 'right';
    targetTab: TabRoute | null;
    progress: number; // 0 to 1
    isCommitted: boolean;
    isBoundary: boolean;
    dragOffset: number;
}

export const SwipePageNavigator: React.FC = () => {
    const { currentUser } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // Active real-time finger-tracked drag state
    const [dragIndicator, setDragIndicator] = useState<ActiveDragIndicator | null>(null);

    // List of sequential tabs for the active user role
    const tabs = useMemo<TabRoute[]>(() => {
        if (!currentUser) return [];

        if (currentUser.role === UserRole.COMMANDANT) {
            return [
                { path: '/commandant', label: 'Parades' },
                { path: '/commandant/remarks', label: 'Remarks' },
                { path: '/commandant/audit', label: 'Audit' }
            ];
        }

        if (currentUser.role === UserRole.ADMIN) {
            return [
                { path: '/admin', label: 'Overview' },
                { path: '/admin/remarks', label: 'Remarks' },
                { path: '/admin/audit', label: 'Audit' },
                { path: '/admin/cadet_registry', label: 'Cadets' },
                { path: '/admin/analytics', label: 'Analytics' }
            ];
        }

        if (currentUser.role === UserRole.MEDICAL_OFFICER) {
            return [
                { path: '/medical', label: 'Sickbay' },
                { path: '/medical/remarks', label: 'Remarks' }
            ];
        }

        if (currentUser.role === UserRole.COURSE_OFFICER) {
            return [
                { path: '/officer', label: 'Dashboard' },
                { path: '/officer/submit', label: 'Submit' },
                { path: '/officer/remarks', label: 'Remarks' },
                { path: '/officer/history', label: 'History' }
            ];
        }

        return [];
    }, [currentUser]);

    // Current active tab index based on route
    const currentTabIndex = useMemo(() => {
        const path = location.pathname.toLowerCase();
        if (tabs.length === 0) return -1;

        for (let i = 0; i < tabs.length; i++) {
            const tabPath = tabs[i].path.toLowerCase();
            if (tabPath === '/commandant' || tabPath === '/admin' || tabPath === '/officer') {
                if (path === tabPath || path === `${tabPath}/`) return i;
            } else if (path.startsWith(tabPath)) {
                return i;
            }
        }
        return -1;
    }, [location.pathname, tabs]);

    // Gesture tracking mutable references
    const gestureRef = useRef<{
        startX: number;
        startY: number;
        startTime: number;
        isLockedVertical: boolean;
        isEligible: boolean;
        isEdgeSwipe: boolean;
        hasTriggeredCommitHaptic: boolean;
    }>({
        startX: 0,
        startY: 0,
        startTime: 0,
        isLockedVertical: false,
        isEligible: false,
        isEdgeSwipe: false,
        hasTriggeredCommitHaptic: false
    });

    useEffect(() => {
        if (!currentUser || tabs.length <= 1 || currentTabIndex === -1) return;

        // Check if an interactive input or horizontal scroll container was tapped
        const isElementSuppressed = (target: HTMLElement | null): boolean => {
            if (!target) return false;

            // 1. Text inputs, selects, textareas, contenteditable
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.isContentEditable ||
                target.closest('input, textarea, select, [contenteditable="true"]')
            ) {
                return true;
            }

            // 2. Explicitly marked elements
            if (target.closest('[data-no-page-swipe="true"]')) {
                return true;
            }

            // 3. Horizontally scrollable containers (tables, chip bars, quick-prompt strips)
            let curr: HTMLElement | null = target;
            while (curr && curr !== document.body && curr !== document.documentElement) {
                const style = window.getComputedStyle(curr);
                const overflowX = style.overflowX;
                if (
                    (overflowX === 'auto' || overflowX === 'scroll') &&
                    curr.scrollWidth > curr.clientWidth
                ) {
                    return true;
                }
                curr = curr.parentElement;
            }

            return false;
        };

        const handleTouchStart = (e: TouchEvent) => {
            // Mobile-only activation (< 768px)
            if (window.innerWidth >= 768) {
                gestureRef.current.isEligible = false;
                return;
            }

            if (e.touches.length !== 1) {
                gestureRef.current.isEligible = false;
                return;
            }

            // Conflict check 1: Overlays, modals, or drawers open
            const isOverlayOpen =
                Boolean(document.querySelector('[data-drawer-open="true"], [role="dialog"]')) ||
                document.body.classList.contains('overflow-hidden');

            if (isOverlayOpen) {
                gestureRef.current.isEligible = false;
                return;
            }

            const target = e.target as HTMLElement | null;
            if (isElementSuppressed(target)) {
                gestureRef.current.isEligible = false;
                return;
            }

            const touch = e.touches[0];
            const startX = touch.clientX;
            const startY = touch.clientY;
            const screenWidth = window.innerWidth;

            // Dual-trigger detection: Edge Swipe starts within 28px of left or right edge
            const isLeftEdge = startX <= 28;
            const isRightEdge = startX >= screenWidth - 28;
            const isEdge = isLeftEdge || isRightEdge;

            gestureRef.current = {
                startX,
                startY,
                startTime: Date.now(),
                isLockedVertical: false,
                isEligible: true,
                isEdgeSwipe: isEdge,
                hasTriggeredCommitHaptic: false
            };
        };

        const handleTouchMove = (e: TouchEvent) => {
            const g = gestureRef.current;
            if (!g.isEligible || g.isLockedVertical || e.touches.length !== 1) return;

            const touch = e.touches[0];
            const dx = touch.clientX - g.startX;
            const dy = touch.clientY - g.startY;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);

            // Early vertical scroll intent detection (dy > 12 && dy >= dx locks to vertical)
            if (!g.isLockedVertical && absDy > 12 && absDy >= absDx) {
                g.isLockedVertical = true;
                g.isEligible = false;
                setDragIndicator(null);
                return;
            }

            // Wait until movement passes subtle 6px threshold
            if (absDx < 6) return;

            const direction: 'left' | 'right' = dx < 0 ? 'left' : 'right';

            // Determine target tab & boundary state
            let targetTab: TabRoute | null = null;
            let isBoundary = false;

            if (direction === 'left') {
                // Dragging finger left -> target is Next Tab
                if (currentTabIndex < tabs.length - 1) {
                    targetTab = tabs[currentTabIndex + 1];
                } else {
                    isBoundary = true;
                }
            } else {
                // Dragging finger right -> target is Previous Tab
                if (currentTabIndex > 0) {
                    targetTab = tabs[currentTabIndex - 1];
                } else {
                    isBoundary = true;
                }
            }

            // Rubber-band resistance (dx * 0.25) if at boundary
            const effectiveDx = isBoundary ? dx * 0.25 : dx;
            const progress = Math.min(Math.abs(effectiveDx) / 90, 1.25);
            const isCommitted = progress >= 1.0;

            // Subtle haptic pulse the exact moment commit threshold is crossed (once per gesture)
            if (isCommitted && !isBoundary && !g.hasTriggeredCommitHaptic) {
                g.hasTriggeredCommitHaptic = true;
                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    try { navigator.vibrate(10); } catch { /* ignore */ }
                }
            } else if (!isCommitted && g.hasTriggeredCommitHaptic) {
                g.hasTriggeredCommitHaptic = false;
            }

            setDragIndicator({
                direction,
                targetTab,
                progress: Math.min(progress, 1),
                isCommitted,
                isBoundary,
                dragOffset: effectiveDx
            });
        };

        const handleTouchEnd = (e: TouchEvent) => {
            const g = gestureRef.current;
            if (!g.isEligible || g.isLockedVertical || e.changedTouches.length !== 1) {
                setDragIndicator(null);
                return;
            }

            const touch = e.changedTouches[0];
            const dx = touch.clientX - g.startX;
            const dy = touch.clientY - g.startY;
            const dt = Math.max(1, Date.now() - g.startTime);
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            const velocityX = absDx / dt;

            // Strict horizontal angle lock
            const isStrictHorizontal = absDx > absDy * 1.6;

            // Dual-trigger criteria:
            // 1. Edge swipe: started within 28px and dragged inward >= 56px
            const meetsEdgeCriteria = g.isEdgeSwipe && absDx >= 56 && isStrictHorizontal;
            // 2. Hard flick swipe: velocity >= 0.65 px/ms with absDx >= 72px and strict horizontal
            const meetsFlickCriteria = velocityX >= 0.65 && absDx >= 72 && isStrictHorizontal;
            // 3. 1:1 Committed drag (>= 90px drag distance)
            const meetsDragCommit = absDx >= 90 && isStrictHorizontal;

            const shouldSwitch = meetsEdgeCriteria || meetsFlickCriteria || meetsDragCommit;

            if (shouldSwitch) {
                if (dx < 0 && currentTabIndex < tabs.length - 1) {
                    // Navigate to Next Tab
                    const nextTab = tabs[currentTabIndex + 1];
                    if (!g.hasTriggeredCommitHaptic && typeof navigator !== 'undefined' && navigator.vibrate) {
                        try { navigator.vibrate(10); } catch { /* ignore */ }
                    }
                    navigate(nextTab.path);
                } else if (dx > 0 && currentTabIndex > 0) {
                    // Navigate to Previous Tab
                    const prevTab = tabs[currentTabIndex - 1];
                    if (!g.hasTriggeredCommitHaptic && typeof navigator !== 'undefined' && navigator.vibrate) {
                        try { navigator.vibrate(10); } catch { /* ignore */ }
                    }
                    navigate(prevTab.path);
                }
            }

            setDragIndicator(null);
            g.isEligible = false;
        };

        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        window.addEventListener('touchend', handleTouchEnd, { passive: true });
        window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

        return () => {
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
            window.removeEventListener('touchcancel', handleTouchEnd);
        };
    }, [currentUser, tabs, currentTabIndex, navigate]);

    return (
        <AnimatePresence>
            {dragIndicator && (
                <div className="fixed inset-y-0 inset-x-0 pointer-events-none z-[110] flex items-center justify-between px-3 md:hidden">
                    {/* Left Screen Edge Indicator (Swiping Right -> Going to Previous Tab) */}
                    {dragIndicator.direction === 'right' ? (
                        <motion.div
                            initial={{ opacity: 0, x: -24, scale: 0.85 }}
                            animate={{
                                opacity: Math.max(0.2, dragIndicator.progress),
                                x: Math.min(24, dragIndicator.dragOffset * 0.2),
                                scale: 0.85 + 0.15 * dragIndicator.progress
                            }}
                            exit={{ opacity: 0, x: -20, scale: 0.85 }}
                            transition={{ duration: 0.12, ease: 'easeOut' }}
                            className={`backdrop-blur-md rounded-full shadow-2xl border px-3.5 py-2 flex items-center gap-1.5 text-xs font-bold transition-colors ${
                                dragIndicator.isBoundary
                                    ? 'bg-slate-900/60 text-slate-400 border-white/10'
                                    : dragIndicator.isCommitted
                                    ? 'bg-blue-950/90 text-white border-blue-400/50 shadow-blue-500/20'
                                    : 'bg-slate-900/85 text-white/90 border-white/15'
                            }`}
                        >
                            <ChevronLeft
                                size={16}
                                className={`transition-colors shrink-0 ${
                                    dragIndicator.isCommitted
                                        ? 'text-blue-400 stroke-[2.75]'
                                        : 'text-white/60 stroke-[2]'
                                }`}
                            />
                            <span>
                                {dragIndicator.isBoundary
                                    ? 'First Tab'
                                    : dragIndicator.targetTab?.label || ''}
                            </span>
                        </motion.div>
                    ) : (
                        <div />
                    )}

                    {/* Right Screen Edge Indicator (Swiping Left -> Going to Next Tab) */}
                    {dragIndicator.direction === 'left' ? (
                        <motion.div
                            initial={{ opacity: 0, x: 24, scale: 0.85 }}
                            animate={{
                                opacity: Math.max(0.2, dragIndicator.progress),
                                x: Math.max(-24, dragIndicator.dragOffset * 0.2),
                                scale: 0.85 + 0.15 * dragIndicator.progress
                            }}
                            exit={{ opacity: 0, x: 20, scale: 0.85 }}
                            transition={{ duration: 0.12, ease: 'easeOut' }}
                            className={`backdrop-blur-md rounded-full shadow-2xl border px-3.5 py-2 flex items-center gap-1.5 text-xs font-bold ml-auto transition-colors ${
                                dragIndicator.isBoundary
                                    ? 'bg-slate-900/60 text-slate-400 border-white/10'
                                    : dragIndicator.isCommitted
                                    ? 'bg-blue-950/90 text-white border-blue-400/50 shadow-blue-500/20'
                                    : 'bg-slate-900/85 text-white/90 border-white/15'
                            }`}
                        >
                            <span>
                                {dragIndicator.isBoundary
                                    ? 'Last Tab'
                                    : dragIndicator.targetTab?.label || ''}
                            </span>
                            <ChevronRight
                                size={16}
                                className={`transition-colors shrink-0 ${
                                    dragIndicator.isCommitted
                                        ? 'text-blue-400 stroke-[2.75]'
                                        : 'text-white/60 stroke-[2]'
                                }`}
                            />
                        </motion.div>
                    ) : (
                        <div />
                    )}
                </div>
            )}
        </AnimatePresence>
    );
};
