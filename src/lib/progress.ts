export interface Progress {
  version: 1;
  startedOn: string;
  completed: Record<string, string>;
  notes: Record<string, string>;
}

const LESSON_COUNT = 64;
const NOTE_LIMIT = 10_000;
const DAY_MS = 86_400_000;

function validId(id: number): boolean {
  return Number.isInteger(id) && id >= 1 && id <= LESSON_COUNT;
}

function idFromKey(key: string): number | null {
  const id = Number(key);
  return validId(id) && String(id) === key ? id : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate a calendar date without JavaScript's rollover of impossible dates. */
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function safeToday(today: string): string {
  return validDate(today) ? today : localDate();
}

function completedIds(progress: Progress, today?: string): number[] {
  return Object.entries(progress.completed)
    .filter(([key, date]) => idFromKey(key) !== null && validDate(date) && (!today || date <= today))
    .map(([key]) => Number(key));
}

/** Use the learner's calendar day rather than an ISO date in UTC. */
export function localDate(date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createProgress(today: string): Progress {
  return { version: 1, startedOn: safeToday(today), completed: {}, notes: {} };
}

/** Recover each usable entry independently; never trust a localStorage payload. */
export function parseProgress(raw: string | null, today: string): Progress {
  const date = safeToday(today);
  const fallback = createProgress(date);
  if (raw === null) return fallback;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (!isRecord(value) || value.version !== 1) return fallback;

  const progress: Progress = {
    ...fallback,
    startedOn: validDate(value.startedOn) && value.startedOn <= date ? value.startedOn : date,
  };
  if (isRecord(value.completed)) {
    for (const [key, completedOn] of Object.entries(value.completed)) {
      if (idFromKey(key) !== null && validDate(completedOn) && completedOn <= date) {
        progress.completed[key] = completedOn;
      }
    }
  }
  if (isRecord(value.notes)) {
    for (const [key, note] of Object.entries(value.notes)) {
      if (idFromKey(key) !== null && typeof note === 'string') {
        progress.notes[key] = note.slice(0, NOTE_LIMIT);
      }
    }
  }
  return progress;
}

/** A completed lesson stays today's lesson; skipped days never skip lessons. */
export function dailyLessonId(progress: Progress, today: string): number {
  const date = safeToday(today);
  const ids = completedIds(progress, date);
  const doneToday = ids.filter((id) => progress.completed[String(id)] === date);
  if (doneToday.length > 0) return Math.max(...doneToday);

  const done = new Set(ids);
  for (let id = 1; id <= LESSON_COUNT; id += 1) {
    if (!done.has(id)) return id;
  }
  return LESSON_COUNT;
}

export function markComplete(progress: Progress, id: number, today: string): Progress {
  if (!validId(id) || !validDate(today)) return progress;
  const previous = progress.completed[String(id)];
  if (validDate(previous) && previous <= today) return progress;
  if (dailyLessonId(progress, today) !== id) return progress;
  if (completedIds(progress, today).some((doneId) => progress.completed[String(doneId)] === today)) {
    return progress;
  }
  return { ...progress, completed: { ...progress.completed, [String(id)]: today } };
}

export function saveNote(progress: Progress, id: number, note: string): Progress {
  if (!validId(id) || typeof note !== 'string') return progress;
  const key = String(id);
  const value = note.slice(0, NOTE_LIMIT);
  if (progress.notes[key] === value || (value === '' && !(key in progress.notes))) return progress;
  const notes = { ...progress.notes };
  if (value === '') delete notes[key];
  else notes[key] = value;
  return { ...progress, notes };
}

export function completionCount(progress: Progress): number {
  return completedIds(progress).length;
}

/** UTC day numbers avoid 23/25-hour local days at daylight-saving boundaries. */
export function calculateStreak(progress: Progress, today: string): number {
  if (!validDate(today)) return 0;
  const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
  const days = new Set(completedIds(progress, today).map((id) => dayNumber(progress.completed[String(id)])));
  const current = dayNumber(today);
  let cursor = days.has(current) ? current : current - 1;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}
