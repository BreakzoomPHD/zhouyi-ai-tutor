import { describe, expect, it } from 'vitest';
import {
  calculateStreak,
  completionCount,
  createProgress,
  dailyLessonId,
  localDate,
  markComplete,
  parseProgress,
  saveNote,
  type Progress,
} from './progress';

const TODAY = '2026-10-12';

function withCompletions(completed: Record<string, string>): Progress {
  return { ...createProgress(TODAY), completed };
}

describe('daily learning', () => {
  it('uses the local calendar date, including late evening', () => {
    expect(localDate(new Date(2026, 9, 12, 23, 59))).toBe(TODAY);
    expect(localDate(new Date(2026, 0, 2, 0, 1))).toBe('2026-01-02');
  });

  it('starts at lesson 1 and locks that lesson after completion for the day', () => {
    const initial = createProgress(TODAY);
    const completed = markComplete(initial, 1, TODAY);
    expect(dailyLessonId(initial, TODAY)).toBe(1);
    expect(dailyLessonId(completed, TODAY)).toBe(1);
    expect(completionCount(completed)).toBe(1);
    expect(markComplete(completed, 1, TODAY)).toBe(completed);
    expect(markComplete(completed, 2, TODAY)).toBe(completed);
    expect(initial.completed).toEqual({});
  });

  it('advances on the next day and still chooses the next lesson after missed days', () => {
    const completed = markComplete(createProgress(TODAY), 1, TODAY);
    expect(dailyLessonId(completed, '2026-10-13')).toBe(2);
    expect(dailyLessonId(completed, '2026-11-20')).toBe(2);
    expect(markComplete(completed, 2, '2026-10-13').completed).toEqual({
      '1': TODAY,
      '2': '2026-10-13',
    });
  });

  it('refuses future previews, reviews, invalid IDs, and invalid completion dates', () => {
    const initial = createProgress(TODAY);
    for (const id of [2, 64, 0, 65, 1.5, NaN]) expect(markComplete(initial, id, TODAY)).toBe(initial);
    expect(markComplete(initial, 1, '2026-02-30')).toBe(initial);
    const completed = markComplete(initial, 1, TODAY);
    expect(markComplete(completed, 1, '2026-10-13')).toBe(completed);
  });

  it('keeps lesson 64 available after all lessons are finished', () => {
    const completed = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [String(i + 1), TODAY]));
    const progress = withCompletions(completed);
    expect(completionCount(progress)).toBe(64);
    expect(dailyLessonId(progress, TODAY)).toBe(64);
    expect(dailyLessonId(progress, '2026-10-13')).toBe(64);
    expect(markComplete(progress, 64, '2026-10-13')).toBe(progress);
  });

  it('recovers missing lessons in sparse state and locks the latest completion recorded today', () => {
    const sparse = withCompletions({ '1': '2026-10-10', '3': '2026-10-11' });
    expect(dailyLessonId(sparse, TODAY)).toBe(2);
    const sameDay = withCompletions({ '1': TODAY, '2': TODAY });
    expect(dailyLessonId(sameDay, TODAY)).toBe(2);
    expect(markComplete(sameDay, 3, TODAY)).toBe(sameDay);
  });

  it('ignores future and invalid dates even when passed an unparsed progress object', () => {
    const progress = withCompletions({ '1': '2026-10-13', '2': '2026-02-30', '65': TODAY });
    expect(dailyLessonId(progress, TODAY)).toBe(1);
    expect(markComplete(progress, 1, TODAY).completed['1']).toBe(TODAY);
    expect(calculateStreak(progress, TODAY)).toBe(0);
  });
});

describe('persisted progress recovery', () => {
  it('resets missing, malformed, unsupported, and non-object JSON safely', () => {
    for (const raw of [null, '{', 'null', '[]', 'true', '{}', '{"version":2}']) {
      expect(parseProgress(raw, TODAY)).toEqual(createProgress(TODAY));
    }
  });

  it('filters malformed entries, noncanonical IDs, impossible dates, and future dates', () => {
    const progress = parseProgress(JSON.stringify({
      version: 1,
      startedOn: '2026-12-01',
      completed: {
        '1': '2026-10-10', '2': TODAY, '3': '2026-10-13', '4': '2026-02-30',
        '5': null, '6': '2026-1-01', '0': TODAY, '65': TODAY, '01': TODAY,
        '1.5': TODAY, '__proto__': TODAY,
      },
      notes: { '1': '初九，潜龙勿用。', '2': 123, '3': null, '4': ['笔记'], '65': 'invalid', '01': 'invalid' },
    }), TODAY);
    expect(progress).toEqual({
      version: 1,
      startedOn: TODAY,
      completed: { '1': '2026-10-10', '2': TODAY },
      notes: { '1': '初九，潜龙勿用。' },
    });
  });

  it('retains valid state and isolates malformed completed and notes collections', () => {
    expect(parseProgress(JSON.stringify({
      version: 1, startedOn: '2026-10-01', completed: [], notes: { '8': '观察而后行动' },
    }), TODAY)).toEqual({
      version: 1, startedOn: '2026-10-01', completed: {}, notes: { '8': '观察而后行动' },
    });
    expect(parseProgress(JSON.stringify({
      version: 1, startedOn: false, completed: { '1': TODAY }, notes: 'bad',
    }), TODAY).completed).toEqual({ '1': TODAY });
  });

  it('validates Gregorian leap years and month lengths without date rollover', () => {
    const progress = parseProgress(JSON.stringify({
      version: 1, startedOn: '2024-02-29', notes: {}, completed: {
        '1': '2000-02-29', '2': '1900-02-29', '3': '2024-02-29', '4': '2025-02-29',
        '5': '2026-04-31', '6': '2026-04-30', '7': '0000-01-01', '8': '2026-13-01',
      },
    }), TODAY);
    expect(progress.startedOn).toBe('2024-02-29');
    expect(progress.completed).toEqual({ '1': '2000-02-29', '3': '2024-02-29', '6': '2026-04-30' });
  });

  it('bounds persisted notes and round trips normal state', () => {
    const progress = markComplete(saveNote(createProgress(TODAY), 1, '思考记录'), 1, TODAY);
    expect(parseProgress(JSON.stringify(progress), TODAY)).toEqual(progress);
    const oversized = parseProgress(JSON.stringify({ ...progress, notes: { '1': 'x'.repeat(10_001) } }), TODAY);
    expect(oversized.notes['1']).toHaveLength(10_000);
  });
});

describe('notes', () => {
  it('updates immutably, bounds length, preserves other notes, and removes cleared notes', () => {
    const initial = saveNote(createProgress(TODAY), 2, '已有笔记');
    const updated = saveNote(initial, 1, 'x'.repeat(10_010));
    expect(updated.notes['1']).toHaveLength(10_000);
    expect(updated.notes['2']).toBe('已有笔记');
    expect(initial.notes).toEqual({ '2': '已有笔记' });
    expect(updated.completed).toBe(initial.completed);
    expect(saveNote(updated, 1, '').notes).toEqual({ '2': '已有笔记' });
    expect(saveNote(initial, 2, '已有笔记')).toBe(initial);
    expect(saveNote(initial, 0, 'invalid')).toBe(initial);
    expect(saveNote(initial, 65, 'invalid')).toBe(initial);
  });
});

describe('learning streak', () => {
  it('counts consecutive distinct dates through today and retains a streak through yesterday', () => {
    const progress = withCompletions({
      '1': '2026-10-09', '2': '2026-10-10', '3': '2026-10-11', '4': '2026-10-11',
    });
    expect(calculateStreak(progress, '2026-10-11')).toBe(3);
    expect(calculateStreak(progress, TODAY)).toBe(3);
    expect(calculateStreak(progress, '2026-10-13')).toBe(0);
    expect(calculateStreak(createProgress(TODAY), TODAY)).toBe(0);
  });

  it('stops at a missed day and ignores future entries', () => {
    const progress = withCompletions({
      '1': '2026-10-08', '2': '2026-10-10', '3': '2026-10-11', '4': TODAY, '5': '2026-10-13',
    });
    expect(calculateStreak(progress, TODAY)).toBe(3);
  });

  it('crosses year, leap-day, and daylight-saving date boundaries', () => {
    expect(calculateStreak(withCompletions({ '1': '2025-12-31', '2': '2026-01-01' }), '2026-01-02')).toBe(2);
    expect(calculateStreak(withCompletions({ '1': '2024-02-28', '2': '2024-02-29', '3': '2024-03-01' }), '2024-03-01')).toBe(3);
    expect(calculateStreak(withCompletions({ '1': '2026-03-07', '2': '2026-03-08', '3': '2026-03-09' }), '2026-03-09')).toBe(3);
    expect(calculateStreak(withCompletions({ '1': '2026-10-31', '2': '2026-11-01', '3': '2026-11-02' }), '2026-11-02')).toBe(3);
    expect(calculateStreak(withCompletions({ '1': TODAY }), 'invalid')).toBe(0);
  });
});
