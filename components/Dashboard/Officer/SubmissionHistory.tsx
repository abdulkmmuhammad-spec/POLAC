import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
    History,
    FileText,
    Eye,
    Calendar as CalendarIcon,
    Search,
    ArrowUpDown,
    X,
    RotateCcw,
    Filter,
    ChevronDown
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useParade } from '../../../context/ParadeContext';
import { dbService } from '../../../services/dbService';
import { SubmissionPreviewModal } from './SubmissionPreviewModal';
import { CustomDateRangePopover } from './CustomDateRangePopover';
import { ParadeRecordMetadata } from '../../../types';
import {
    DateFilterPreset,
    DATE_FILTER_PRESETS,
    computeDateRangeForPreset,
    formatActiveFilterBadge,
    doesRecordMatchDateBounds,
    formatDisplayDate
} from '../../../utils/dateFilterHelpers';

const VALID_PRESETS: DateFilterPreset[] = [
    'all',
    'today',
    'this_week',
    'this_month',
    'last_30_days',
    'custom'
];

export const SubmissionHistory: React.FC = () => {
    const { currentUser } = useAuth();
    const {
        records: contextRecords,
        loadMoreRecords: loadMoreContextRecords,
        hasMoreRecords: hasMoreContextRecords,
        isDataLoading: isContextLoading,
        currentPage,
        totalPages
    } = useParade();

    const [searchParams, setSearchParams] = useSearchParams();

    // Read initial filter states from URL search parameters for bookmarkable/shareable views
    const urlPreset = searchParams.get('preset') as DateFilterPreset | null;
    const activePreset: DateFilterPreset =
        urlPreset && VALID_PRESETS.includes(urlPreset) ? urlPreset : 'all';
    const customStartDate = searchParams.get('start') || '';
    const customEndDate = searchParams.get('end') || '';
    const paradeTypeFilter = searchParams.get('type') || 'all';
    const sortOrder = (searchParams.get('sort') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
    const urlQuery = searchParams.get('q') || '';

    // Local search input with debouncing to prevent excessive re-renders / URL updates
    const [searchInput, setSearchInput] = useState<string>(urlQuery);
    const [debouncedSearch, setDebouncedSearch] = useState<string>(urlQuery);
    const [isCustomPopoverOpen, setIsCustomPopoverOpen] = useState<boolean>(false);
    const [selectedRecord, setSelectedRecord] = useState<ParadeRecordMetadata | null>(null);

    // Sync local search input if URL param changes externally
    useEffect(() => {
        setSearchInput(urlQuery);
        setDebouncedSearch(urlQuery);
    }, [urlQuery]);

    // Debounce search input (250ms) and sync to URL search params
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchInput.trim());
            setSearchParams(
                prev => {
                    const next = new URLSearchParams(prev);
                    if (searchInput.trim()) {
                        next.set('q', searchInput.trim());
                    } else {
                        next.delete('q');
                    }
                    return next;
                },
                { replace: true }
            );
        }, 250);
        return () => clearTimeout(timer);
    }, [searchInput, setSearchParams]);

    // Compute ISO 8601 start_date and end_date bounds for the active preset/custom range
    const dateBounds = useMemo(
        () => computeDateRangeForPreset(activePreset, customStartDate, customEndDate),
        [activePreset, customStartDate, customEndDate]
    );

    const activeFilterBadgeText = useMemo(
        () => formatActiveFilterBadge(activePreset, dateBounds),
        [activePreset, dateBounds]
    );

    const hasServerFilterActive =
        activePreset !== 'all' || (paradeTypeFilter !== 'all' && paradeTypeFilter !== '');

    const hasAnyFilterActive =
        activePreset !== 'all' ||
        paradeTypeFilter !== 'all' ||
        debouncedSearch.length > 0 ||
        sortOrder !== 'desc';

    // Dedicated Server-Side Indexed Query when date range or parade type filter is active
    const {
        data: filteredQueryData,
        fetchNextPage: fetchNextFilteredPage,
        hasNextPage: hasMoreFilteredPages,
        isLoading: isFilteredLoading,
        isFetchingNextPage: isFetchingNextFiltered
    } = useInfiniteQuery({
        queryKey: [
            'officerSubmissionHistoryFiltered',
            currentUser?.id,
            currentUser?.courseNumber,
            dateBounds.startISO,
            dateBounds.endISO,
            paradeTypeFilter
        ],
        queryFn: ({ pageParam }) =>
            dbService.getRecords({
                viewerId: currentUser?.id,
                role: currentUser?.role,
                courseNumber: currentUser?.courseNumber,
                officerId: currentUser?.id,
                start_date: dateBounds.startISO,
                end_date: dateBounds.endISO,
                paradeType: paradeTypeFilter !== 'all' ? paradeTypeFilter : undefined,
                cursor: pageParam as string | undefined,
                limit: 20
            }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
        staleTime: 1000 * 30,
        enabled: !!currentUser && hasServerFilterActive
    });

    // Combine server-filtered records (or fallback to context records for instantaneous feedback)
    const rawSourceRecords = useMemo(() => {
        if (hasServerFilterActive && filteredQueryData) {
            return filteredQueryData.pages.flatMap(page => page.data);
        }
        return contextRecords.filter(r => String(r.officerId) === String(currentUser?.id));
    }, [hasServerFilterActive, filteredQueryData, contextRecords, currentUser?.id]);

    // Apply client-side date range verification, parade type filter, search query, and sorting
    const displayedRecords = useMemo(() => {
        const queryLower = debouncedSearch.toLowerCase();

        const filtered = rawSourceRecords.filter(r => {
            // Ensure officer scoping
            if (currentUser?.id && String(r.officerId) !== String(currentUser.id)) {
                return false;
            }

            // Verify date bounds
            if (!doesRecordMatchDateBounds(r, dateBounds)) {
                return false;
            }

            // Verify parade type filter
            if (
                paradeTypeFilter !== 'all' &&
                String(r.paradeType).toLowerCase() !== paradeTypeFilter.toLowerCase()
            ) {
                return false;
            }

            // Verify search term (matches parade type, formatted date, ISO date, or course name)
            if (queryLower) {
                const formattedDate = new Date(r.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                }).toLowerCase();
                const matchesType = String(r.paradeType || '').toLowerCase().includes(queryLower);
                const matchesRawDate = String(r.date || '').toLowerCase().includes(queryLower);
                const matchesFormattedDate = formattedDate.includes(queryLower);
                const matchesCourse = String(r.courseName || '').toLowerCase().includes(queryLower);
                if (!matchesType && !matchesRawDate && !matchesFormattedDate && !matchesCourse) {
                    return false;
                }
            }

            return true;
        });

        // Sort records by date / createdAt
        return [...filtered].sort((a, b) => {
            const timeA = new Date(a.createdAt || a.date).getTime();
            const timeB = new Date(b.createdAt || b.date).getTime();
            return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
        });
    }, [rawSourceRecords, currentUser?.id, dateBounds, paradeTypeFilter, debouncedSearch, sortOrder]);

    // Handlers for updating URL-backed filter states
    const handleSelectPreset = useCallback(
        (preset: DateFilterPreset) => {
            if (preset === 'custom') {
                setIsCustomPopoverOpen(true);
                return;
            }
            setIsCustomPopoverOpen(false);
            setSearchParams(
                prev => {
                    const next = new URLSearchParams(prev);
                    if (preset === 'all') {
                        next.delete('preset');
                    } else {
                        next.set('preset', preset);
                    }
                    next.delete('start');
                    next.delete('end');
                    return next;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const handleApplyCustomRange = useCallback(
        (startStr: string, endStr: string) => {
            setSearchParams(
                prev => {
                    const next = new URLSearchParams(prev);
                    next.set('preset', 'custom');
                    if (startStr) next.set('start', startStr);
                    else next.delete('start');
                    if (endStr) next.set('end', endStr);
                    else next.delete('end');
                    return next;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const handleClearDateFilter = useCallback(() => {
        setIsCustomPopoverOpen(false);
        setSearchParams(
            prev => {
                const next = new URLSearchParams(prev);
                next.delete('preset');
                next.delete('start');
                next.delete('end');
                return next;
            },
            { replace: true }
        );
    }, [setSearchParams]);

    const handleResetAllFilters = useCallback(() => {
        setIsCustomPopoverOpen(false);
        setSearchInput('');
        setDebouncedSearch('');
        setSearchParams({}, { replace: true });
    }, [setSearchParams]);

    const handleParadeTypeChange = useCallback(
        (newType: string) => {
            setSearchParams(
                prev => {
                    const next = new URLSearchParams(prev);
                    if (newType === 'all') next.delete('type');
                    else next.set('type', newType);
                    return next;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const handleToggleSortOrder = useCallback(() => {
        setSearchParams(
            prev => {
                const next = new URLSearchParams(prev);
                const nextSort = sortOrder === 'desc' ? 'asc' : 'desc';
                if (nextSort === 'desc') next.delete('sort');
                else next.set('sort', nextSort);
                return next;
            },
            { replace: true }
        );
    }, [sortOrder, setSearchParams]);

    const isLoading = hasServerFilterActive
        ? isFilteredLoading || isFetchingNextFiltered
        : isContextLoading;

    const hasMore = hasServerFilterActive ? !!hasMoreFilteredPages : hasMoreContextRecords;

    const handleLoadMore = async () => {
        if (hasServerFilterActive) {
            await fetchNextFilteredPage();
        } else {
            await loadMoreContextRecords();
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-visible">
                {/* ── Header & Filter Toolbar ─────────────────────────────────────── */}
                <div className="p-5 md:p-8 border-b border-slate-100 space-y-5">
                    {/* Top Row: Title & Record Counter */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
                                <History size={24} className="text-blue-600" />
                                <span>Submission History</span>
                            </h3>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">
                                Filter and inspect parade state returns by date presets, custom calendar ranges, or parade type
                            </p>
                        </div>

                        <div className="flex items-center gap-3 self-start md:self-auto">
                            {!hasServerFilterActive && totalPages > 0 && (
                                <div className="px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-xl">
                                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                </div>
                            )}
                            <div className="px-3 py-1.5 bg-slate-100 rounded-xl">
                                <span className="text-xs font-bold text-slate-600">
                                    {displayedRecords.length}{' '}
                                    {displayedRecords.length === 1 ? 'record' : 'records'} shown
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Second Row: Quick-Filter Pills + Search & Sort Controls */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-1">
                        {/* Quick-Filter Date Pills (Chips) */}
                        <div className="relative flex items-center flex-wrap gap-1.5 bg-slate-50 p-1.5 rounded-2xl border border-slate-200/80">
                            {DATE_FILTER_PRESETS.map(preset => {
                                const isSelected = activePreset === preset.id;
                                const isCustom = preset.id === 'custom';

                                return (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => handleSelectPreset(preset.id)}
                                        title={preset.shortDescription}
                                        className={`px-3.5 py-2 rounded-xl text-xs font-black tracking-tight transition-all flex items-center gap-1.5 ${
                                            isSelected
                                                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                                                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                                        }`}
                                    >
                                        {isCustom && <CalendarIcon size={13} />}
                                        <span>
                                            {isCustom &&
                                            activePreset === 'custom' &&
                                            (customStartDate || customEndDate)
                                                ? `${formatDisplayDate(customStartDate || customEndDate)} – ${formatDisplayDate(customEndDate || customStartDate)}`
                                                : preset.label}
                                        </span>
                                        {isCustom && (
                                            <ChevronDown
                                                size={12}
                                                className={`transition-transform ${
                                                    isCustomPopoverOpen ? 'rotate-180' : ''
                                                }`}
                                            />
                                        )}
                                    </button>
                                );
                            })}

                            {/* Custom Date Range Calendar Popover */}
                            <CustomDateRangePopover
                                isOpen={isCustomPopoverOpen}
                                onClose={() => setIsCustomPopoverOpen(false)}
                                initialStartDate={customStartDate}
                                initialEndDate={customEndDate}
                                onApplyRange={handleApplyCustomRange}
                                onClearRange={handleClearDateFilter}
                            />
                        </div>

                        {/* Search, Parade Type & Sort Controls */}
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
                            {/* Search Input */}
                            <div className="relative flex-1 sm:w-56">
                                <Search
                                    size={15}
                                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                                />
                                <input
                                    type="text"
                                    value={searchInput}
                                    onChange={e => setSearchInput(e.target.value)}
                                    placeholder="Search type or date..."
                                    className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                />
                                {searchInput && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchInput('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                        title="Clear search"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            {/* Parade Type Filter */}
                            <div className="relative">
                                <Filter
                                    size={13}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                                />
                                <select
                                    value={paradeTypeFilter}
                                    onChange={e => handleParadeTypeChange(e.target.value)}
                                    className="pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider text-slate-700 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                                >
                                    <option value="all">All Parades</option>
                                    <option value="muster">Muster</option>
                                    <option value="tattoo">Tattoo</option>
                                    <option value="special">Special</option>
                                </select>
                            </div>

                            {/* Sort Order Toggle */}
                            <button
                                type="button"
                                onClick={handleToggleSortOrder}
                                className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-black text-slate-700 flex items-center gap-1.5 transition-colors shrink-0"
                                title="Toggle chronological sort order"
                            >
                                <ArrowUpDown size={13} className="text-blue-600" />
                                <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Third Row: Active Filter Badge & One-Click Clear Button */}
                    {(activeFilterBadgeText || paradeTypeFilter !== 'all' || debouncedSearch) && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 animate-in fade-in duration-150">
                            <div className="flex flex-wrap items-center gap-2">
                                {activeFilterBadgeText && (
                                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200/80 text-blue-800 text-xs font-bold shadow-xs">
                                        <CalendarIcon size={13} className="text-blue-600 shrink-0" />
                                        <span>{activeFilterBadgeText}</span>
                                        <button
                                            type="button"
                                            onClick={handleClearDateFilter}
                                            className="ml-0.5 p-0.5 rounded-md hover:bg-blue-200/70 text-blue-700 transition-colors"
                                            title="Clear date filter"
                                            aria-label="Clear date filter"
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                )}

                                {paradeTypeFilter !== 'all' && (
                                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200/80 text-indigo-800 text-xs font-bold">
                                        <span className="uppercase">Parade: {paradeTypeFilter}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleParadeTypeChange('all')}
                                            className="p-0.5 rounded-md hover:bg-indigo-200/70 text-indigo-700 transition-colors"
                                            title="Clear parade type filter"
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                )}

                                {debouncedSearch && (
                                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold">
                                        <span>Search: "{debouncedSearch}"</span>
                                        <button
                                            type="button"
                                            onClick={() => setSearchInput('')}
                                            className="p-0.5 rounded-md hover:bg-slate-200 text-slate-600 transition-colors"
                                            title="Clear search query"
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={handleResetAllFilters}
                                className="text-xs font-black text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1"
                            >
                                <RotateCcw size={12} />
                                <span>Clear All Filters</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Data Table & Mobile Feed ────────────────────────────────────── */}
                <div className="overflow-x-auto">
                    {/* Desktop Table View */}
                    <table className="w-full text-left hidden md:table">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Date</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Parade Type</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Present</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Absent</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Detention</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Pass</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Susp.</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">YTR</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase">Total</th>
                                <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase text-center w-24">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {displayedRecords.map(r => (
                                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-8 py-5 font-bold text-slate-800">
                                        {new Date(r.date).toLocaleDateString()}
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className="flex items-center gap-2 text-slate-600 font-medium capitalize">
                                            <FileText size={16} /> {r.paradeType}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-emerald-600 font-bold">{r.presentCount}</td>
                                    <td className="px-8 py-5 text-rose-600 font-bold">{r.absentCount}</td>
                                    <td className="px-8 py-5 text-indigo-600 font-bold">{r.detentionCount}</td>
                                    <td className="px-8 py-5 text-purple-600 font-bold">{r.passCount || 0}</td>
                                    <td className="px-8 py-5 text-slate-500 font-bold">{r.suspensionCount || 0}</td>
                                    <td className="px-8 py-5 text-cyan-600 font-bold">{r.yetToReportCount || 0}</td>
                                    <td className="px-8 py-5 font-bold">{r.grandTotal}</td>
                                    <td className="px-8 py-5 text-center">
                                        <button
                                            onClick={() => setSelectedRecord(r)}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                                            title="View Details"
                                        >
                                            <Eye size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Mobile Card View */}
                    <div className="md:hidden divide-y divide-slate-100 border-t border-slate-100">
                        {displayedRecords.map(r => (
                            <div key={r.id} className="p-4 space-y-4 hover:bg-slate-50 transition-colors">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-slate-800 font-bold text-sm capitalize">
                                        <FileText size={16} className="text-blue-600" />
                                        <span>{r.paradeType}</span>
                                    </div>
                                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                                        {new Date(r.date).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <div className="flex justify-between items-center bg-white p-2 rounded-lg shadow-sm border border-slate-100">
                                        <span className="text-[10px] font-black uppercase text-slate-400">Present</span>
                                        <span className="text-sm font-bold text-emerald-600">{r.presentCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-white p-2 rounded-lg shadow-sm border border-slate-100">
                                        <span className="text-[10px] font-black uppercase text-slate-400">Absent</span>
                                        <span className="text-sm font-bold text-rose-600">{r.absentCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-white p-2 rounded-lg shadow-sm border border-slate-100">
                                        <span className="text-[10px] font-black uppercase text-slate-400">Detention</span>
                                        <span className="text-sm font-bold text-indigo-600">{r.detentionCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-white p-2 rounded-lg shadow-sm border border-slate-100">
                                        <span className="text-[10px] font-black uppercase text-slate-400">P/S/Y</span>
                                        <span className="text-xs font-bold text-slate-600 tracking-wider">
                                            {r.passCount || 0}/{r.suspensionCount || 0}/{r.yetToReportCount || 0}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between pt-1">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        Grand Total
                                    </span>
                                    <span className="text-sm font-black text-slate-800">{r.grandTotal}</span>
                                </div>
                                <button
                                    onClick={() => setSelectedRecord(r)}
                                    className="w-full mt-2 py-3 bg-white border-2 border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:border-slate-300 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                                >
                                    <Eye size={16} /> Look at Details
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Polished Empty State Card */}
                    {displayedRecords.length === 0 && !isLoading && (
                        <div className="p-10 md:p-16 text-center max-w-md mx-auto space-y-4">
                            <div className="w-16 h-16 rounded-3xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mx-auto shadow-inner">
                                <CalendarIcon size={28} />
                            </div>
                            <div className="space-y-1.5">
                                <h4 className="text-base font-black text-slate-800">
                                    {hasAnyFilterActive
                                        ? 'No Submissions Match Selected Filter'
                                        : 'No Parade Submissions Recorded Yet'}
                                </h4>
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    {activeFilterBadgeText
                                        ? `No parade state returns were found for the selected timeframe (${activeFilterBadgeText.replace('Filtered: ', '')}). Try expanding your date range or resetting the filter.`
                                        : hasAnyFilterActive
                                        ? 'No records matched your current search or parade type criteria.'
                                        : "You haven't submitted any parade states yet. Once filed, your returns will appear here."}
                                </p>
                            </div>
                            {hasAnyFilterActive && (
                                <div className="pt-2">
                                    <button
                                        type="button"
                                        onClick={handleResetAllFilters}
                                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md shadow-blue-600/20 transition-all"
                                    >
                                        <RotateCcw size={14} />
                                        <span>Reset Date Filter</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {hasMore && (
                <div className="flex justify-center pt-4">
                    <button
                        onClick={handleLoadMore}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-8 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 hover:border-blue-200 hover:text-blue-600 transition-all shadow-sm disabled:opacity-50"
                    >
                        {isLoading ? (
                            <span className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                Loading...
                            </span>
                        ) : (
                            'Load More Submissions if any'
                        )}
                    </button>
                </div>
            )}

            <SubmissionPreviewModal
                record={selectedRecord}
                onClose={() => setSelectedRecord(null)}
            />
        </div>
    );
};
