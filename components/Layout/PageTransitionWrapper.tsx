import React, { useMemo, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';

interface PageTransitionWrapperProps {
    children: React.ReactNode;
}

const getTabOrderForRole = (role?: UserRole): string[] => {
    if (role === UserRole.COMMANDANT) {
        return ['/commandant', '/commandant/remarks', '/commandant/audit'];
    }
    if (role === UserRole.ADMIN) {
        return [
            '/admin',
            '/admin/remarks',
            '/admin/audit',
            '/admin/cadet_registry',
            '/admin/analytics',
            '/admin/settings'
        ];
    }
    if (role === UserRole.MEDICAL_OFFICER) {
        return ['/medical', '/medical/remarks'];
    }
    if (role === UserRole.COURSE_OFFICER) {
        return ['/officer', '/officer/submit', '/officer/remarks', '/officer/history'];
    }
    return [];
};

/**
 * PageTransitionWrapper — Fast, non-blocking, GPU-only directional tab transition.
 * Avoids `AnimatePresence mode="popLayout"` DOM measurement / dual-tree mounting lag
 * by animating only the entering view with a crisp 180ms exponential ease-out curve.
 */
export const PageTransitionWrapper: React.FC<PageTransitionWrapperProps> = ({ children }) => {
    const location = useLocation();
    const { currentUser } = useAuth();
    const shouldReduceMotion = useReducedMotion();

    const tabOrder = useMemo(() => getTabOrderForRole(currentUser?.role), [currentUser?.role]);

    const currentIndex = useMemo(() => {
        const cleanPath = location.pathname.replace(/\/+$/, '') || '/';
        const exact = tabOrder.indexOf(cleanPath);
        if (exact !== -1) return exact;
        const prefixIdx = tabOrder.findIndex(
            (p, idx) => idx > 0 && cleanPath.startsWith(p)
        );
        return prefixIdx !== -1 ? prefixIdx : 0;
    }, [location.pathname, tabOrder]);

    const prevIndexRef = useRef<number>(currentIndex);
    const prevPathRef = useRef<string>(location.pathname);

    const hasOpenModal =
        typeof document !== 'undefined' &&
        Boolean(document.querySelector('[data-drawer-open="true"], [role="dialog"]'));

    let direction = 0;
    if (!shouldReduceMotion && !hasOpenModal && prevPathRef.current !== location.pathname) {
        if (currentIndex > prevIndexRef.current) {
            direction = 1;
        } else if (currentIndex < prevIndexRef.current) {
            direction = -1;
        }
    }

    useEffect(() => {
        prevIndexRef.current = currentIndex;
        prevPathRef.current = location.pathname;
    }, [currentIndex, location.pathname]);

    return (
        <div className="w-full overflow-x-hidden">
            <motion.div
                key={location.pathname}
                initial={
                    shouldReduceMotion || direction === 0
                        ? { opacity: 0.92 }
                        : { x: direction > 0 ? 22 : -22, opacity: 0 }
                }
                animate={{ x: 0, opacity: 1 }}
                transition={
                    shouldReduceMotion
                        ? { duration: 0.1 }
                        : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
                }
                className="w-full"
            >
                {children}
            </motion.div>
        </div>
    );
};
