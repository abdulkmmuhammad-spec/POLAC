import { Notification } from '../types';

export const inferSeverity = (n: Notification): 'critical' | 'info' | 'system' => {
    const type = n.type?.toLowerCase() || '';
    const content = n.content?.toLowerCase() || '';

    if (type === 'settings_change' || type === 'profile_update') return 'system';

    // Actionable Intel Elevation
    if (content.includes('absent') && content.includes('high')) return 'critical';
    if (content.includes('nil') || content.includes('detention') || content.includes('critical')) return 'critical';

    return 'info';
};

export const getSeverityStyles = (severity: 'critical' | 'info' | 'system') => {
    switch (severity) {
        case 'critical':
            return {
                bg: 'bg-rose-50',
                text: 'text-rose-500',
                border: 'border-rose-200',
                badge: 'bg-rose-100 text-rose-600 border-rose-200',
                label: 'Critical'
            };
        case 'system':
            return {
                bg: 'bg-indigo-50',
                text: 'text-indigo-500',
                border: 'border-indigo-200',
                badge: 'bg-indigo-100 text-indigo-600 border-indigo-200',
                label: 'System'
            };
        case 'info':
        default:
            return {
                bg: 'bg-emerald-50',
                text: 'text-emerald-500',
                border: 'border-emerald-200',
                badge: 'bg-emerald-100 text-emerald-600 border-emerald-200',
                label: 'Routine'
            };
    }
};

export interface NotificationTarget {
    category: 'parade' | 'cadet' | 'settings' | 'general';
    route: string;
    courseNumber?: number;
    paradeType?: string;
    cadetName?: string;
    actionLabel: string;
    counts?: {
        present?: number;
        absent?: number;
        sick?: number;
        detention?: number;
        pass?: number;
        suspension?: number;
        yetToReport?: number;
        grandTotal?: number;
    };
}

export const parseNotificationTarget = (n: Notification): NotificationTarget => {
    const type = n.type?.toLowerCase() || '';
    const title = n.title?.toLowerCase() || '';
    const content = n.content?.toLowerCase() || '';
    const courseNumber = n.courseNumber || n.metadata?.courseNumber || (n.yearGroup && n.yearGroup > 0 ? n.yearGroup : undefined);

    // 1. Parade Submissions & State Audit
    if (type.includes('parade') || title.includes('parade') || content.includes('parade')) {
        let paradeType: string | undefined = n.metadata?.paradeType;
        if (!paradeType) {
            if (content.includes('muster') || title.includes('muster')) paradeType = 'muster';
            else if (content.includes('tattoo') || title.includes('tattoo')) paradeType = 'tattoo';
            else if (content.includes('special') || title.includes('special')) paradeType = 'special';
        }

        return {
            category: 'parade',
            route: '/commandant/audit',
            courseNumber,
            paradeType,
            actionLabel: 'Inspect in Attendance Audit',
            counts: n.metadata?.counts
        };
    }

    // 2. Cadet Registry (Added, Modified, Status Override)
    if (type.includes('cadet') || title.includes('cadet') || content.includes('cadet') || title.includes('status override')) {
        // Try extracting cadet name if present in metadata or pattern
        let cadetName = n.metadata?.cadetName;
        return {
            category: 'cadet',
            route: '/commandant/cadet_registry',
            courseNumber,
            cadetName,
            actionLabel: 'View in Cadet Registry'
        };
    }

    // 3. System & Forensics Settings
    if (type.includes('settings') || type.includes('system') || title.includes('settings') || title.includes('rc changed') || title.includes('time changed')) {
        return {
            category: 'settings',
            route: '/commandant/settings',
            courseNumber,
            actionLabel: 'Open System Forensics'
        };
    }

    // 4. Default / General Activity
    return {
        category: 'general',
        route: '/commandant',
        courseNumber,
        actionLabel: 'View Command Overview'
    };
};

