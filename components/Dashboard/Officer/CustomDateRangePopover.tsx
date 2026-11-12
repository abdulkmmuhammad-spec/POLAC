import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Check,
    RotateCcw,
    X,
    ArrowRight
} from 'lucide-react';
import {
    toLocalDateString,
    parseLocalDateString,
    formatDisplayDate
} from '../../../utils/dateFilterHelpers';

interface CustomDateRangePopoverProps {
    isOpen: boolean;
    onClose: () => void;
    initialStartDate?: string;
    initialEndDate?: string;
    onApplyRange: (startDateStr: string, endDateStr: string) => void;
    onClearRange: () => void;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

interface CalendarDayCell {
    dateStr: string;
    dayNumber: number;
    isCurrentMonth: boolean;
    isToday: boolean;
}

function buildMonthCalendarGrid(year: number, month: number, todayStr: string): CalendarDayCell[] {
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Convert Sunday=0..Saturday=6 into Monday=0..Sunday=6
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const cells: CalendarDayCell[] = [];

    // Previous month trailing days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
        const dt = new Date(year, month - 1, prevMonthLastDay - i);
        const dateStr = toLocalDateString(dt);
        cells.push({
            dateStr,
            dayNumber: dt.getDate(),
            isCurrentMonth: false,
            isToday: dateStr === todayStr
        });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(year, month, d);
        const dateStr = toLocalDateString(dt);
        cells.push({
            dateStr,
            dayNumber: d,
            isCurrentMonth: true,
            isToday: dateStr === todayStr
        });
    }

    // Next month leading days to fill 42 cells (6 rows x 7 cols)
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
        const dt = new Date(year, month + 1, d);
        const dateStr = toLocalDateString(dt);
        cells.push({
            dateStr,
            dayNumber: d,
            isCurrentMonth: false,
            isToday: dateStr === todayStr
        });
    }

    return cells;
}

export const CustomDateRangePopover: React.FC<CustomDateRangePopoverProps> = ({
    isOpen,
    onClose,
    initialStartDate = '',
    initialEndDate = '',
    onApplyRange,
    onClearRange
}) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const todayStr = useMemo(() => toLocalDateString(new Date()), []);

    const [draftStart, setDraftStart] = useState<string>(initialStartDate);
    const [draftEnd, setDraftEnd] = useState<string>(initialEndDate);
    const [hoverDate, setHoverDate] = useState<string | null>(null);
    const [selectionPhase, setSelectionPhase] = useState<'START' | 'END'>('START');

    // Base month shown on the left calendar (right calendar shows baseMonth + 1)
    const [viewYear, setViewYear] = useState<number>(() => {
        const parsed = parseLocalDateString(initialStartDate) || new Date();
        return parsed.getFullYear();
    });
    const [viewMonth, setViewMonth] = useState<number>(() => {
        const parsed = parseLocalDateString(initialStartDate);
        if (parsed) return parsed.getMonth();
        const now = new Date();
        // Show previous month + current month on dual calendar so recent history is immediately visible
        return now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    });

    useEffect(() => {
        if (isOpen) {
            setDraftStart(initialStartDate);
            setDraftEnd(initialEndDate);
            setSelectionPhase('START');
            const parsedStart = parseLocalDateString(initialStartDate);
            if (parsedStart) {
                setViewYear(parsedStart.getFullYear());
                setViewMonth(parsedStart.getMonth());
            } else {
                const now = new Date();
                if (now.getMonth() === 0) {
                    setViewYear(now.getFullYear() - 1);
                    setViewMonth(11);
                } else {
                    setViewYear(now.getFullYear());
                    setViewMonth(now.getMonth() - 1);
                }
            }
        }
    }, [isOpen, initialStartDate, initialEndDate]);

    // Close on outside click or Escape key
    useEffect(() => {
        if (!isOpen) return;

        const handleOutsideClick = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    const secondCalendarYearMonth = useMemo(() => {
        if (viewMonth === 11) {
            return { year: viewYear + 1, month: 0 };
        }
        return { year: viewYear, month: viewMonth + 1 };
    }, [viewYear, viewMonth]);

    const leftMonthCells = useMemo(
        () => buildMonthCalendarGrid(viewYear, viewMonth, todayStr),
        [viewYear, viewMonth, todayStr]
    );

    const rightMonthCells = useMemo(
        () => buildMonthCalendarGrid(secondCalendarYearMonth.year, secondCalendarYearMonth.month, todayStr),
        [secondCalendarYearMonth, todayStr]
    );

    if (!isOpen) return null;

    const handlePrevMonth = () => {
        if (viewMonth === 0) {
            setViewYear(y => y - 1);
            setViewMonth(11);
        } else {
            setViewMonth(m => m - 1);
        }
    };

    const handleNextMonth = () => {
        if (viewMonth === 11) {
            setViewYear(y => y + 1);
            setViewMonth(0);
        } else {
            setViewMonth(m => m + 1);
        }
    };

    const handleDayClick = (dateStr: string) => {
        if (selectionPhase === 'START' || !draftStart || (draftStart && draftEnd)) {
            setDraftStart(dateStr);
            setDraftEnd('');
            setSelectionPhase('END');
        } else {
            if (dateStr < draftStart) {
                setDraftEnd(draftStart);
                setDraftStart(dateStr);
            } else {
                setDraftEnd(dateStr);
            }
            setSelectionPhase('START');
        }
    };

    const handleApply = () => {
        if (!draftStart && !draftEnd) return;
        const start = draftStart || draftEnd;
        const end = draftEnd || draftStart;
        if (start > end) {
            onApplyRange(end, start);
        } else {
            onApplyRange(start, end);
        }
        onClose();
    };

    const isDateInRange = (dateStr: string): boolean => {
        if (!draftStart) return false;
        const effectiveEnd = draftEnd || hoverDate;
        if (!effectiveEnd) return false;
        const min = draftStart < effectiveEnd ? draftStart : effectiveEnd;
        const max = draftStart < effectiveEnd ? effectiveEnd : draftStart;
        return dateStr > min && dateStr < max;
    };

    const isRangeEndpoint = (dateStr: string): boolean => {
        return dateStr === draftStart || dateStr === draftEnd;
    };

    const renderMonthGrid = (year: number, month: number, cells: CalendarDayCell[]) => (
        <div className="space-y-2.5">
            <div className="text-center font-black text-xs uppercase tracking-wider text-slate-800 py-1">
                {MONTHS[month]} {year}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS.map(day => (
                    <div key={day} className="text-[10px] font-black uppercase text-slate-400 py-1">
                        {day}
                    </div>
                ))}
                {cells.map((cell, idx) => {
                    const selected = isRangeEndpoint(cell.dateStr);
                    const inRange = isDateInRange(cell.dateStr);

                    return (
                        <button
                            key={`${cell.dateStr}-${idx}`}
                            type="button"
                            onClick={() => handleDayClick(cell.dateStr)}
                            onMouseEnter={() => selectionPhase === 'END' && setHoverDate(cell.dateStr)}
                            onMouseLeave={() => setHoverDate(null)}
                            className={`h-8 w-full rounded-lg text-xs font-bold transition-all relative flex items-center justify-center ${
                                selected
                                    ? 'bg-blue-600 text-white font-black shadow-sm ring-2 ring-blue-600/20 z-10'
                                    : inRange
                                    ? 'bg-blue-50 text-blue-800 font-bold rounded-none'
                                    : cell.isCurrentMonth
                                    ? 'text-slate-700 hover:bg-slate-100'
                                    : 'text-slate-300 hover:bg-slate-50'
                            } ${cell.isToday && !selected ? 'border border-blue-400 text-blue-700' : ''}`}
                        >
                            {cell.dayNumber}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    return (
        <div
            ref={popoverRef}
            className="fixed inset-x-3 top-20 sm:absolute sm:inset-x-auto sm:right-auto sm:left-0 sm:top-full sm:mt-2 z-50 w-auto sm:w-[580px] max-h-[82vh] sm:max-h-none overflow-y-auto bg-white rounded-3xl shadow-2xl border border-slate-200 p-4 sm:p-5 animate-in fade-in zoom-in-95 duration-150"
        >
            {/* Popover Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                        <CalendarIcon size={16} />
                    </div>
                    <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                            Select Custom Date Range
                        </h4>
                        <p className="text-[11px] text-slate-400 font-medium">
                            Click start & end dates on the calendar or enter exact dates below
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Direct Date Inputs Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                        Start Date
                    </label>
                    <input
                        type="date"
                        value={draftStart}
                        max={draftEnd || todayStr}
                        onChange={e => setDraftStart(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                        End Date
                    </label>
                    <input
                        type="date"
                        value={draftEnd}
                        min={draftStart || undefined}
                        max={todayStr}
                        onChange={e => setDraftEnd(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
            </div>

            {/* Dual Calendar Navigation & Grids */}
            <div className="relative">
                <div className="flex items-center justify-between mb-2">
                    <button
                        type="button"
                        onClick={handlePrevMonth}
                        className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                        title="Previous Month"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                        {selectionPhase === 'START' ? 'Click Start Date' : 'Click End Date'}
                    </span>
                    <button
                        type="button"
                        onClick={handleNextMonth}
                        className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                        title="Next Month"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>{renderMonthGrid(viewYear, viewMonth, leftMonthCells)}</div>
                    <div className="hidden sm:block border-l border-slate-100 pl-5">
                        {renderMonthGrid(
                            secondCalendarYearMonth.year,
                            secondCalendarYearMonth.month,
                            rightMonthCells
                        )}
                    </div>
                </div>
            </div>

            {/* Footer Summary & Actions */}
            <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-600 flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-slate-400">Range:</span>
                    {draftStart ? (
                        <span className="font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg">
                            {formatDisplayDate(draftStart)}
                        </span>
                    ) : (
                        <span className="italic text-slate-400">Not selected</span>
                    )}
                    <ArrowRight size={12} className="text-slate-400" />
                    {draftEnd ? (
                        <span className="font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg">
                            {formatDisplayDate(draftEnd)}
                        </span>
                    ) : (
                        <span className="italic text-slate-400">
                            {draftStart ? formatDisplayDate(draftStart) : 'Not selected'}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                        type="button"
                        onClick={() => {
                            setDraftStart('');
                            setDraftEnd('');
                            onClearRange();
                            onClose();
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-1 transition-colors"
                    >
                        <RotateCcw size={13} />
                        <span>Reset</span>
                    </button>
                    <button
                        type="button"
                        disabled={!draftStart && !draftEnd}
                        onClick={handleApply}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-blue-600/20 transition-all"
                    >
                        <Check size={14} />
                        <span>Apply Range</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

