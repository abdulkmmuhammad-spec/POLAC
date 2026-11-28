import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getWATDateStr,
  getMsUntilNextWATMidnight,
  evaluateDateRollover
} from '../utils/dateRollover';

export { getWATDateStr };

export interface UseWATDateRolloverOptions {
  onRollover?: (newTodayWAT: string, previousDate: string) => void;
}

export interface UseWATDateRolloverResult {
  selectedDate: string;
  setSelectedDate: (nextDate: string) => void;
  todayWAT: string;
  isViewingPastDate: boolean;
  jumpToToday: () => void;
  didRollover: boolean;
}

/**
 * Keeps parade submission screens anchored to Today (WAT) across overnight PWA/Safari suspension.
 * Listens to visibilitychange, focus, pageshow (iOS bfcache), and schedules a midnight WAT timer.
 */
export function useWATDateRollover(
  options: UseWATDateRolloverOptions = {}
): UseWATDateRolloverResult {
  const initialToday = getWATDateStr();
  const [todayWAT, setTodayWAT] = useState<string>(initialToday);
  const [selectedDate, setSelectedDateState] = useState<string>(initialToday);
  const [didRollover, setDidRollover] = useState<boolean>(false);

  const lastAutoTodayRef = useRef<string>(initialToday);
  const selectedDateRef = useRef<string>(initialToday);
  const onRolloverRef = useRef(options.onRollover);

  useEffect(() => {
    onRolloverRef.current = options.onRollover;
  }, [options.onRollover]);

  const setSelectedDate = useCallback((nextDate: string) => {
    selectedDateRef.current = nextDate;
    setSelectedDateState(nextDate);
    if (nextDate === lastAutoTodayRef.current) {
      setDidRollover(false);
    }
  }, []);

  const checkRollover = useCallback(() => {
    const actualToday = getWATDateStr();
    const prevDate = selectedDateRef.current;
    const result = evaluateDateRollover({
      selectedDate: prevDate,
      lastAutoToday: lastAutoTodayRef.current,
      actualToday
    });

    lastAutoTodayRef.current = result.nextLastAutoToday;
    setTodayWAT(result.nextTodayWAT);

    if (result.didRollover) {
      selectedDateRef.current = result.nextSelectedDate;
      setSelectedDateState(result.nextSelectedDate);
      setDidRollover(true);
      onRolloverRef.current?.(result.nextTodayWAT, prevDate);
    }
  }, []);

  const jumpToToday = useCallback(() => {
    const actualToday = getWATDateStr();
    lastAutoTodayRef.current = actualToday;
    selectedDateRef.current = actualToday;
    setTodayWAT(actualToday);
    setSelectedDateState(actualToday);
    setDidRollover(false);
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkRollover();
      }
    };
    const handleFocus = () => checkRollover();
    const handlePageShow = (_event: PageTransitionEvent) => {
      checkRollover();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);

    let timerId: ReturnType<typeof setTimeout> | null = null;
    const scheduleMidnightCheck = () => {
      const ms = getMsUntilNextWATMidnight();
      timerId = setTimeout(() => {
        checkRollover();
        scheduleMidnightCheck();
      }, ms);
    };
    scheduleMidnightCheck();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      if (timerId !== null) clearTimeout(timerId);
    };
  }, [checkRollover]);

  return {
    selectedDate,
    setSelectedDate,
    todayWAT,
    isViewingPastDate: selectedDate !== todayWAT,
    jumpToToday,
    didRollover
  };
}
