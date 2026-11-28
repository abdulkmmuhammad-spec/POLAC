import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getWATDateStr,
  getWATTimeStr,
  getMsUntilNextWATMidnight,
  evaluateDateRollover,
  setServerClockOffsetMs
} from '../utils/dateRollover';
import { dbService } from '../services/dbService';

export { getWATDateStr, getWATTimeStr };

export interface UseWATDateRolloverOptions {
  onRollover?: (newTodayWAT: string, previousDate: string) => void;
}

export interface UseWATDateRolloverResult {
  selectedDate: string;
  setSelectedDate: (nextDate: string) => void;
  todayWAT: string;
  watTimeLabel: string;
  isViewingPastDate: boolean;
  jumpToToday: () => void;
  didRollover: boolean;
}

/**
 * Keeps parade submission screens anchored to Today in Nigeria Time (WAT),
 * synced to the Supabase PostgreSQL clock across overnight PWA/Safari suspension.
 */
export function useWATDateRollover(
  options: UseWATDateRolloverOptions = {}
): UseWATDateRolloverResult {
  const initialToday = getWATDateStr();
  const [todayWAT, setTodayWAT] = useState<string>(initialToday);
  const [selectedDate, setSelectedDateState] = useState<string>(initialToday);
  const [watTimeLabel, setWatTimeLabel] = useState<string>(() => getWATTimeStr());
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

  const applyResolvedToday = useCallback((actualToday: string, resolvedTime?: string) => {
    const prevDate = selectedDateRef.current;
    const result = evaluateDateRollover({
      selectedDate: prevDate,
      lastAutoToday: lastAutoTodayRef.current,
      actualToday
    });

    lastAutoTodayRef.current = result.nextLastAutoToday;
    setTodayWAT(result.nextTodayWAT);
    setWatTimeLabel(resolvedTime || getWATTimeStr());

    if (result.didRollover) {
      selectedDateRef.current = result.nextSelectedDate;
      setSelectedDateState(result.nextSelectedDate);
      setDidRollover(true);
      onRolloverRef.current?.(result.nextTodayWAT, prevDate);
    }
  }, []);

  const checkRollover = useCallback(async () => {
    // 1. Immediate local WAT evaluation
    applyResolvedToday(getWATDateStr(), getWATTimeStr());

    // 2. Authoritative database clock sync (Nigeria WAT)
    const serverClock = await dbService.getNigeriaServerClock();
    if (serverClock) {
      setServerClockOffsetMs(serverClock.utcNowMs - Date.now());
      applyResolvedToday(serverClock.watDate, serverClock.watTime || getWATTimeStr());
    }
  }, [applyResolvedToday]);

  const jumpToToday = useCallback(() => {
    const actualToday = getWATDateStr();
    lastAutoTodayRef.current = actualToday;
    selectedDateRef.current = actualToday;
    setTodayWAT(actualToday);
    setSelectedDateState(actualToday);
    setWatTimeLabel(getWATTimeStr());
    setDidRollover(false);
  }, []);

  useEffect(() => {
    checkRollover();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkRollover();
      }
    };
    const handleFocus = () => {
      void checkRollover();
    };
    const handlePageShow = (_event: PageTransitionEvent) => {
      void checkRollover();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);

    // Keep live WAT minute label fresh
    const minuteInterval = setInterval(() => {
      setWatTimeLabel(getWATTimeStr());
    }, 30_000);

    let timerId: ReturnType<typeof setTimeout> | null = null;
    const scheduleMidnightCheck = () => {
      const ms = getMsUntilNextWATMidnight();
      timerId = setTimeout(() => {
        void checkRollover();
        scheduleMidnightCheck();
      }, ms);
    };
    scheduleMidnightCheck();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      clearInterval(minuteInterval);
      if (timerId !== null) clearTimeout(timerId);
    };
  }, [checkRollover]);

  return {
    selectedDate,
    setSelectedDate,
    todayWAT,
    watTimeLabel,
    isViewingPastDate: selectedDate !== todayWAT,
    jumpToToday,
    didRollover
  };
}
