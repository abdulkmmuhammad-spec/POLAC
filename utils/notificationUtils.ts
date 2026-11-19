import { Notification } from '../types';

export interface ParsedMisconductRemark {
    isMisconduct: boolean;
    alertLevel: 'CRITICAL' | 'FLAGRANT' | null;
    cadetName: string | null;
    squad: string | null;
    absences: number | null;
    alertId: string | null;
    cleanText: string;
}

export const parseMisconductRemark = (text?: string | null): ParsedMisconductRemark => {
    const raw = (text || '').trim();
    const match = raw.match(
        /^\[MISCONDUCT:([^|]+)\|CADET:([^|]+)\|SQUAD:([^|]+)\|ABSENCES:([^|]+)\|ALERT_ID:([^\]]+)\]\s*([\s\S]*)$/i
    );
    if (!match) {
        return {
            isMisconduct: false,
            alertLevel: null,
            cadetName: null,
            squad: null,
            absences: null,
            alertId: null,
            cleanText: raw
        };
    }

    const levelRaw = match[1].trim().toUpperCase();
    const alertLevel: 'CRITICAL' | 'FLAGRANT' = levelRaw === 'FLAGRANT' ? 'FLAGRANT' : 'CRITICAL';
    const absencesNum = parseInt(match[4].trim(), 10);

    return {
        isMisconduct: true,
        alertLevel,
        cadetName: match[2].trim(),
        squad: match[3].trim(),
        absences: Number.isNaN(absencesNum) ? null : absencesNum,
        alertId: match[5].trim(),
        cleanText: (match[6] || '').trim()
    };
};

export const inferSeverity = (n: Notification): 'critical' | 'info' | 'system' => {
    const type = n.type?.toLowerCase() || '';
    const title = n.title?.toLowerCase() || '';
    const content = n.content?.toLowerCase() || '';

    if (type === 'settings_change' || type === 'profile_update') return 'system';
    if (type === 'remark_resolved' || title.includes('parade inquiry resolved')) return 'info';
    if (type === 'commandant_remark' || type === 'remark_response') return 'critical';

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
    previewMode?: boolean;
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

export const parseNotificationTarget = (n: Notification, viewerRole?: string): NotificationTarget => {
    const type = n.type?.toLowerCase() || '';
    const title = n.title?.toLowerCase() || '';
    const content = n.content?.toLowerCase() || '';
    const courseNumber = n.courseNumber || n.metadata?.courseNumber || (n.yearGroup && n.yearGroup > 0 ? n.yearGroup : undefined);
    const basePrefix = viewerRole === 'admin' ? '/admin' : '/commandant';

    // 0. Commandant Parade Remarks & Officer Responses
    if (type === 'commandant_remark' || type === 'remark_resolved' || title.includes("commandant's parade remark") || title.includes('parade inquiry resolved')) {
        return {
            category: 'parade',
            route: '/officer/history',
            courseNumber,
            actionLabel: type === 'commandant_remark' ? 'Respond in Submission History' : 'View in Submission History'
        };
    }

    if (type === 'remark_response' || title.includes('officer justification filed')) {
        return {
            category: 'parade',
            route: basePrefix,
            courseNumber,
            actionLabel: 'Review Officer Response'
        };
    }

    // 1. Parade Submissions & State Audit
    if (type.includes('parade') || title.includes('parade') || content.includes('parade')) {
        let paradeType: string | undefined = undefined;
        if (content.includes('muster') || title.includes('muster')) paradeType = 'muster';
        else if (content.includes('tattoo') || title.includes('tattoo')) paradeType = 'tattoo';
        else if (content.includes('special') || title.includes('special')) paradeType = 'special';

        // Extract counts from content string since DB metadata is missing
        // e.g. "Officer xyz submitted TATTOO parade state (Present: 140, Absent: 0, Sick: 0)"
        let parsedCounts = n.metadata?.counts;
        const presentMatch = content.match(/present:\s*(\d+)/i);
        const absentMatch = content.match(/absent:\s*(\d+)/i);
        const sickMatch = content.match(/sick:\s*(\d+)/i);
        
        let isPerfectAttendance = false;

        if (presentMatch || absentMatch || sickMatch) {
            const absent = absentMatch ? parseInt(absentMatch[1], 10) : 0;
            const sick = sickMatch ? parseInt(sickMatch[1], 10) : 0;
            
            parsedCounts = {
                present: presentMatch ? parseInt(presentMatch[1], 10) : 0,
                absent,
                sick
            };
            isPerfectAttendance = (absent === 0 && sick === 0);
        } else if (parsedCounts) {
            isPerfectAttendance = (parsedCounts.absent ?? 0) === 0 && (parsedCounts.sick ?? 0) === 0;
        }

        return {
            category: 'parade',
            route: isPerfectAttendance ? basePrefix : `${basePrefix}/audit`,
            courseNumber,
            paradeType,
            actionLabel: isPerfectAttendance ? 'View in Tactical Summary' : 'Inspect in Attendance Audit',
            counts: parsedCounts
        };
    }

    // 2. Document Previews (MUST BE BEFORE CADET REGISTRY TO PREVENT INTERCEPTION)
    if (title.includes('ledger printed') || title.includes('audit ledger') || title.includes('report produced')) {
        return {
            category: 'general',
            route: `${basePrefix}/audit`,
            courseNumber,
            actionLabel: 'Preview Audit Ledger',
            previewMode: true
        };
    }
    
    if (title.includes('dossier generated') || title.includes('performance dossier') || title.includes('official dossier')) {
        let cadetName = n.metadata?.cadetName;
        if (!cadetName && content.includes('cadet ')) {
            const match = content.match(/cadet\s+([^()]+)/i);
            if (match) cadetName = match[1].trim();
        }
        return {
            category: 'cadet',
            route: viewerRole === 'admin' ? '/admin/cadet_registry' : `${basePrefix}/audit`,
            courseNumber,
            cadetName: cadetName,
            actionLabel: viewerRole === 'admin' ? 'Preview Performance Dossier' : 'View in Attendance Audit',
            previewMode: viewerRole === 'admin'
        };
    }

    // 3. Cadet Registry (Added, Modified, Status Override)
    if (type.includes('cadet') || title.includes('cadet') || content.includes('cadet') || title.includes('status override')) {
        // Try extracting cadet name if present in metadata or pattern
        let cadetName = n.metadata?.cadetName;
        return {
            category: 'cadet',
            route: viewerRole === 'admin' ? '/admin/cadet_registry' : `${basePrefix}/audit`,
            courseNumber,
            cadetName,
            actionLabel: viewerRole === 'admin' ? 'View in Cadet Registry' : 'View in Attendance Audit'
        };
    }

    // 3. System & Forensics Settings
    if (type.includes('settings') || type.includes('system') || title.includes('settings') || title.includes('rc changed') || title.includes('time changed')) {
        return {
            category: 'settings',
            route: viewerRole === 'admin' ? '/admin/settings' : basePrefix,
            courseNumber,
            actionLabel: viewerRole === 'admin' ? 'Open System Forensics' : 'View Overview'
        };
    }

    // 4. Default / General Activity
    return {
        category: 'general',
        route: basePrefix,
        courseNumber,
        actionLabel: 'View Command Overview'
    };
};

