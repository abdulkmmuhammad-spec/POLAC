/**
 * Date Filter & Range Selector Utilities for Submission History
 * Supports quick presets, custom ISO 8601 ranges, human-readable badge formatting,
 * and calendar grid generation.
 */

export type DateFilterPreset =
    | 'all'
    | 'today'
    | 'this_week'
    | 'this_month'
    | 'last_30_days'
    | 'custom';

export interface DateRangeBounds {
    /** ISO 8601 timestamp for start of range (e.g. 2026-10-01T00:00:00.000Z) */
    startISO?: string;
    /** ISO 8601 timestamp for end of range (e.g. 2026-10-31T23:59:59.999Z) */
    endISO?: string;
    /** YYYY-MM-DD local date string for start of range */
    startDateStr?: string;
    /** YYYY-MM-DD local date string for end of range */
    endDateStr?: string;
}

export interface PresetOption {
    id: DateFilterPreset;
    label: string;
    shortDescription: string;
}

export const DATE_FILTER_PRESETS: PresetOption[] = [
    { id: 'all', label: 'All Time', shortDescription: 'Complete archival submission history' },
    { id: 'today', label: 'Today', shortDescription: 'Submissions filed today' },
    { id: 'this_week', label: 'This Week', shortDescription: 'Current week (Mon – Sun)' },
    { id: 'this_month', label: 'This Month', shortDescription: 'Current calendar month' },
    { id: 'last_30_days', label: 'Last 30 Days', shortDescription: 'Rolling 30-day window' },
    { id: 'custom', label: 'Custom Range', shortDescription: 'Select specific start & end dates' },
];

/**
 * Formats a Date object as YYYY-MM-DD in local time.
 */
export function toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Parses a YYYY-MM-DD string into a local Date at 00:00:00.000.
 * Returns null if invalid.
 */
export function parseLocalDateString(dateStr: string | null | undefined): Date | null {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
        return null;
    }
    const [y, m, d] = dateStr.trim().split('-').map(Number);
    const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
    if (isNaN(dt.getTime()) || dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
        return null;
    }
    return dt;
}

/**
 * Converts a YYYY-MM-DD string into start-of-day and end-of-day ISO 8601 strings.
 */
export function buildISOBoundsFromDateStrings(
    startDateStr?: string | null,
    endDateStr?: string | null
): DateRangeBounds {
    const result: DateRangeBounds = {};

    const startDt = parseLocalDateString(startDateStr);
    if (startDt) {
        result.startDateStr = toLocalDateString(startDt);
        const startUTC = new Date(Date.UTC(startDt.getFullYear(), startDt.getMonth(), startDt.getDate(), 0, 0, 0, 0));
        result.startISO = startUTC.toISOString();
    }

    const endDt = parseLocalDateString(endDateStr);
    if (endDt) {
        result.endDateStr = toLocalDateString(endDt);
        const endUTC = new Date(Date.UTC(endDt.getFullYear(), endDt.getMonth(), endDt.getDate(), 23, 59, 59, 999));
        result.endISO = endUTC.toISOString();
    }

    // If both exist and start > end, swap them gracefully
    if (result.startISO && result.endISO && result.startISO > result.endISO) {
        const tempStr = result.startDateStr;
        result.startDateStr = result.endDateStr;
        result.endDateStr = tempStr;

        const swappedStart = parseLocalDateString(result.startDateStr)!;
        const swappedEnd = parseLocalDateString(result.endDateStr)!;
        result.startISO = new Date(Date.UTC(swappedStart.getFullYear(), swappedStart.getMonth(), swappedStart.getDate(), 0, 0, 0, 0)).toISOString();
        result.endISO = new Date(Date.UTC(swappedEnd.getFullYear(), swappedEnd.getMonth(), swappedEnd.getDate(), 23, 59, 59, 999)).toISOString();
    }

    return result;
}

/**
 * Computes the ISO 8601 start_date and end_date bounds for any preset or custom range.
 */
export function computeDateRangeForPreset(
    preset: DateFilterPreset,
    customStartStr?: string,
    customEndStr?: string,
    referenceDate: Date = new Date()
): DateRangeBounds {
    if (preset === 'all') {
        return {};
    }

    if (preset === 'custom') {
        return buildISOBoundsFromDateStrings(customStartStr, customEndStr);
    }

    const refYear = referenceDate.getFullYear();
    const refMonth = referenceDate.getMonth();
    const refDay = referenceDate.getDate();

    const todayDate = new Date(refYear, refMonth, refDay);
    const todayStr = toLocalDateString(todayDate);

    if (preset === 'today') {
        return buildISOBoundsFromDateStrings(todayStr, todayStr);
    }

    if (preset === 'this_week') {
        // Monday as start of week (ISO week standard)
        const dayOfWeek = todayDate.getDay(); // 0 = Sun, 1 = Mon, ...
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(refYear, refMonth, refDay + diffToMonday);
        const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
        return buildISOBoundsFromDateStrings(toLocalDateString(monday), toLocalDateString(sunday));
    }

    if (preset === 'this_month') {
        const firstDay = new Date(refYear, refMonth, 1);
        const lastDay = new Date(refYear, refMonth + 1, 0);
        return buildISOBoundsFromDateStrings(toLocalDateString(firstDay), toLocalDateString(lastDay));
    }

    if (preset === 'last_30_days') {
        const thirtyDaysAgo = new Date(refYear, refMonth, refDay - 29);
        return buildISOBoundsFromDateStrings(toLocalDateString(thirtyDaysAgo), todayStr);
    }

    return {};
}

/**
 * Formats a YYYY-MM-DD string into a human-friendly display date (e.g., "Oct 1, 2026").
 */
export function formatDisplayDate(dateStr?: string | null): string {
    const dt = parseLocalDateString(dateStr);
    if (!dt) return '';
    return dt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

/**
 * Generates the active filter badge text (e.g., "Filtered: Oct 1, 2026 – Oct 31, 2026").
 */
export function formatActiveFilterBadge(
    preset: DateFilterPreset,
    bounds: DateRangeBounds
): string | null {
    if (preset === 'all') return null;

    const startFormatted = formatDisplayDate(bounds.startDateStr);
    const endFormatted = formatDisplayDate(bounds.endDateStr);

    if (preset === 'today' && startFormatted) {
        return `Filtered: Today (${startFormatted})`;
    }

    if (startFormatted && endFormatted) {
        if (startFormatted === endFormatted) {
            return `Filtered: ${startFormatted}`;
        }
        return `Filtered: ${startFormatted} – ${endFormatted}`;
    }

    if (startFormatted) {
        return `Filtered: From ${startFormatted}`;
    }

    if (endFormatted) {
        return `Filtered: Until ${endFormatted}`;
    }

    return null;
}

/**
 * Evaluates whether a parade record falls within the given DateRangeBounds.
 * Checks both the record's `date` (YYYY-MM-DD) and `createdAt` (ISO timestamp) fields.
 */
export function doesRecordMatchDateBounds(
    record: { date?: string; createdAt?: string },
    bounds: DateRangeBounds
): boolean {
    if (!bounds.startDateStr && !bounds.endDateStr && !bounds.startISO && !bounds.endISO) {
        return true;
    }

    // Prefer YYYY-MM-DD comparison if record.date is in YYYY-MM-DD format
    const rawDate = record.date ? record.date.slice(0, 10) : null;
    if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        if (bounds.startDateStr && rawDate < bounds.startDateStr) return false;
        if (bounds.endDateStr && rawDate > bounds.endDateStr) return false;
        return true;
    }

    // Fallback to createdAt ISO timestamp comparison
    if (record.createdAt) {
        const recordTime = new Date(record.createdAt).getTime();
        if (!isNaN(recordTime)) {
            if (bounds.startISO && recordTime < new Date(bounds.startISO).getTime()) return false;
            if (bounds.endISO && recordTime > new Date(bounds.endISO).getTime()) return false;
            return true;
        }
    }

    return true;
}

