import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getWATDateStr,
  getMsUntilNextWATMidnight,
  evaluateDateRollover,
  createStaleFetchGuard
} from '../utils/dateRollover.ts';

describe('dateRollover utilities', () => {
  it('formats WAT dates consistently in YYYY-MM-DD (Africa/Lagos en-CA)', () => {
    // 2026-11-27 23:30:00 UTC === 2026-11-28 00:30:00 WAT (next day in Lagos)
    const utcLateNight = new Date('2026-11-27T23:30:00.000Z');
    assert.equal(getWATDateStr(utcLateNight), '2026-11-28');
    assert.equal(getWATDateStr(utcLateNight, -1), '2026-11-27');
  });

  it('computes positive milliseconds until 00:00:05 WAT', () => {
    const sample = new Date('2026-11-28T22:59:55.000Z'); // 23:59:55 WAT
    const ms = getMsUntilNextWATMidnight(sample);
    assert.equal(ms, 10_000); // 10 seconds until 00:00:05 WAT
  });

  it('auto-advances selectedDate when user was on Today and midnight crosses into Day 2', () => {
    const res = evaluateDateRollover({
      selectedDate: '2026-11-27',
      lastAutoToday: '2026-11-27',
      actualToday: '2026-11-28'
    });

    assert.equal(res.nextSelectedDate, '2026-11-28');
    assert.equal(res.nextLastAutoToday, '2026-11-28');
    assert.equal(res.nextTodayWAT, '2026-11-28');
    assert.equal(res.didRollover, true);
  });

  it('preserves historical selectedDate on Day 1 -> Day 2 rollover while updating todayWAT for Jump to Today', () => {
    // User was browsing 2026-11-25 while today was 2026-11-27; midnight crosses to 2026-11-28
    const res = evaluateDateRollover({
      selectedDate: '2026-11-25',
      lastAutoToday: '2026-11-27',
      actualToday: '2026-11-28'
    });

    assert.equal(res.nextSelectedDate, '2026-11-25');
    assert.equal(res.nextLastAutoToday, '2026-11-28');
    assert.equal(res.nextTodayWAT, '2026-11-28');
    assert.equal(res.didRollover, false);
    assert.notEqual(res.nextSelectedDate, res.nextTodayWAT); // isViewingPastDate === true, Jump to Today targets 2026-11-28
  });

  it('blocks late-resolving async fetch from yesterday after rollover to today', async () => {
    const guard = createStaleFetchGuard();
    let activeDate = '2026-11-27';
    let appliedDataFromDate: string | null = null;

    // Start Day 1 fetch (slow)
    const day1ReqId = guard.nextRequestId();
    const slowDay1Fetch = new Promise<string>(resolve =>
      setTimeout(() => resolve('2026-11-27'), 25)
    );

    // Midnight rollover happens -> Day 2 fetch starts and finishes first
    activeDate = '2026-11-28';
    const day2ReqId = guard.nextRequestId();
    const fastDay2Fetch = Promise.resolve('2026-11-28');

    const day2Result = await fastDay2Fetch;
    if (guard.isLatest(day2ReqId)) {
      appliedDataFromDate = day2Result;
    }

    // Late Day 1 response arrives
    const day1Result = await slowDay1Fetch;
    if (guard.isLatest(day1ReqId)) {
      appliedDataFromDate = day1Result;
    }

    assert.equal(activeDate, '2026-11-28');
    assert.equal(appliedDataFromDate, '2026-11-28');
  });

  it('triggers rollover check on iOS pageshow when event.persisted === true', () => {
    const listeners: Record<string, Array<(ev: any) => void>> = {};
    const addListener = (type: string, fn: (ev: any) => void) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    };

    let selectedDate = '2026-11-27';
    let lastAutoToday = '2026-11-27';
    let actualToday = '2026-11-27';

    const onPageShow = (_event: { persisted: boolean }) => {
      const res = evaluateDateRollover({
        selectedDate,
        lastAutoToday,
        actualToday
      });
      selectedDate = res.nextSelectedDate;
      lastAutoToday = res.nextLastAutoToday;
    };

    addListener('pageshow', onPageShow);

    // Simulate overnight iOS Safari bfcache restore on Day 2
    actualToday = '2026-11-28';
    listeners['pageshow'].forEach(fn => fn({ persisted: true }));

    assert.equal(selectedDate, '2026-11-28');
    assert.equal(lastAutoToday, '2026-11-28');
  });
});
