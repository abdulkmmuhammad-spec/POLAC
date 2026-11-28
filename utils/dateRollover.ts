const WAT_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Lagos',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const WAT_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

/**
 * Returns YYYY-MM-DD in West Africa Time (Africa/Lagos) using en-CA formatting.
 */
export function getWATDateStr(date: Date = new Date(), offsetDays = 0): string {
  const target =
    offsetDays === 0 ? date : new Date(date.getTime() + offsetDays * 86400000);
  return WAT_FORMATTER.format(target);
}

/**
 * Computes milliseconds until 00:00:05 WAT the next calendar day.
 */
export function getMsUntilNextWATMidnight(now: Date = new Date()): number {
  const parts = WAT_TIME_FORMATTER.formatToParts(now);
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
  const second = Number(parts.find(p => p.type === 'second')?.value ?? '0');

  const elapsedSeconds = hour * 3600 + minute * 60 + second;
  const secondsUntilMidnight = 86400 - elapsedSeconds + 5; // +5s buffer past 00:00:00
  return Math.max(5000, secondsUntilMidnight * 1000);
}

export interface RolloverEvaluationInput {
  selectedDate: string;
  lastAutoToday: string;
  actualToday: string;
}

export interface RolloverEvaluationResult {
  nextSelectedDate: string;
  nextLastAutoToday: string;
  nextTodayWAT: string;
  didRollover: boolean;
}

/**
 * Pure state-transition evaluator for WAT daily rollover.
 * - If the user was viewing "Today" (selectedDate === lastAutoToday), advances selectedDate to actualToday.
 * - If the user intentionally browsed a historical date, preserves selectedDate while updating todayWAT.
 */
export function evaluateDateRollover({
  selectedDate,
  lastAutoToday,
  actualToday
}: RolloverEvaluationInput): RolloverEvaluationResult {
  if (actualToday === lastAutoToday) {
    return {
      nextSelectedDate: selectedDate,
      nextLastAutoToday: lastAutoToday,
      nextTodayWAT: actualToday,
      didRollover: false
    };
  }

  const wasOnToday = selectedDate === lastAutoToday;
  return {
    nextSelectedDate: wasOnToday ? actualToday : selectedDate,
    nextLastAutoToday: actualToday,
    nextTodayWAT: actualToday,
    didRollover: wasOnToday
  };
}

export interface StaleFetchGuard {
  nextRequestId: () => number;
  isLatest: (requestId: number) => boolean;
}

/**
 * Request-counter guard preventing late-resolving async responses from overwriting newer date state.
 */
export function createStaleFetchGuard(): StaleFetchGuard {
  let latestId = 0;
  return {
    nextRequestId: () => {
      latestId += 1;
      return latestId;
    },
    isLatest: (requestId: number) => requestId === latestId
  };
}
