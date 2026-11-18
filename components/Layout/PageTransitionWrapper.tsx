import React, { useMemo, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
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

const slideVariants = {
    enter: (direction: number) => {
        if (direction === 0) {
            return { x: 0, opacity: 1 };
        }
        return {
            x: direction > 0 ? '100%' : '-100%',
            opacity: 0.9
        };
    },
    center: {
        x: 0,
        opacity: 1
    },
    exit: (direction: number) => {
        if (direction === 0) {
            return { x: 0, opacity: 0 };
        }
        return {
            x: direction > 0 ? '-30%' : '30%',
            opacity: 0.8
        };
    }
};

/**
 * PageTransitionWrapper — WhatsApp / Instagram-style horizontal sliding page transitions.
 * Computes deterministic direction by comparing previous & current tab indices.
 */
export const PageTransitionWrapper: React.FC<PageTransitionWrapperProps> = ({ children }) => {
    const location = useLocation();
    const { currentUser } = useAuth();

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

    // Pause horizontal slides when a modal/drawer is currently open
    const hasOpenModal =
        typeof document !== 'undefined' &&
        Boolean(document.querySelector('[data-drawer-open="true"], [role="dialog"]'));

    let direction = 0;
    if (!hasOpenModal && prevPathRef.current !== location.pathname) {
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
        <div className="w-full overflow-x-hidden relative">
            <AnimatePresence mode="popLayout" custom={direction} initial={false}>
                <motion.div
                    key={location.pathname}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                    className="w-full will-change-transform"
                >
                    {children}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

