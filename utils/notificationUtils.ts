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
