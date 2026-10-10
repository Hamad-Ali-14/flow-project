export const KARACHI_TIME_ZONE = 'Asia/Karachi';

export function getKarachiTodayISO(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KARACHI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function formatKarachiDate(now = new Date(), options = {}) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: KARACHI_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(now);
}

export function getKarachiGreeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: KARACHI_TIME_ZONE, hour: '2-digit', hour12: false }).format(now)) % 24;
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ---- Pakistan Standard Time scheduling -------------------------------------
// Pakistan has no daylight saving: PKT is always UTC+05:00, so a Karachi wall-clock time maps to
// exactly one instant. The database uses the same zone name ('Asia/Karachi'), so both agree.
const PKT_OFFSET = '+05:00';

// "2026-10-03" + "00:00" (Karachi wall clock) -> the exact instant as a Date.
export function karachiToInstant(dateISO, time = '00:00') {
  const d = new Date(`${dateISO}T${time.length === 5 ? `${time}:00` : time}${PKT_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDaysISO(dateISO, days) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The next 12:00 AM PKT strictly after `now`.
export function getNextKarachiMidnight(now = new Date()) {
  return karachiToInstant(addDaysISO(getKarachiTodayISO(now), 1), '00:00');
}

export function msUntilNextKarachiMidnight(now = new Date()) {
  return getNextKarachiMidnight(now).getTime() - now.getTime();
}

// "3 Oct 2026, 12:00 am PKT"
export function formatKarachiDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: KARACHI_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
  return `${formatKarachiDate(d)}, ${time} PKT`;
}

// Monday-start week containing `todayISO`, and the month start.
export function getKarachiWeekStartISO(todayISO = getKarachiTodayISO()) {
  const dow = new Date(`${todayISO}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDaysISO(todayISO, -((dow + 6) % 7));
}
export function getKarachiMonthStartISO(todayISO = getKarachiTodayISO()) {
  return `${todayISO.slice(0, 8)}01`;
}

// ---- 12-hour shift system (Pakistan time) ------------------------------------------------
// Two 12-hour shifts: Shift 1 - Day 07:00-19:00 and Shift 2 - Night 19:00-07:00 (the night shift
// runs past midnight). The running shift is decided by the actual Karachi clock, so it changes by
// itself at 7:00 AM and 7:00 PM.
export const KARACHI_SHIFTS = Object.freeze([
  { id: 'day', name: 'Shift 1 - Day', short: 'Day', startHour: 7, endHour: 19 },
  { id: 'night', name: 'Shift 2 - Night', short: 'Night', startHour: 19, endHour: 7 },
]);

const hour12 = h => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 || h === 24 ? 'AM' : 'PM'}`;

// The shift running at `now`, e.g. { id:'day', name:'Shift 1 - Day', hours:'7:00 AM - 7:00 PM' }.
export function getKarachiShift(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: KARACHI_TIME_ZONE, hour: '2-digit', hour12: false }).format(now)) % 24;
  const shift = hour >= 7 && hour < 19 ? KARACHI_SHIFTS[0] : KARACHI_SHIFTS[1];
  return { ...shift, hours: `${hour12(shift.startHour)} - ${hour12(shift.endHour)}` };
}

export function getKarachiEndedShift(now = new Date()) {
  return getKarachiShift(new Date(now.getTime() - 30 * 60 * 1000));
}

// Ms until the next shift boundary (7 AM or 7 PM PKT) strictly after `now`.
export function msUntilNextShiftEnd(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: KARACHI_TIME_ZONE, hour: '2-digit', hour12: false }).format(now)) % 24;
  const todayISO = getKarachiTodayISO(now);
  const nextBoundary = hour < 7 ? karachiToInstant(todayISO, '07:00')
    : hour < 19 ? karachiToInstant(todayISO, '19:00')
    : karachiToInstant(addDaysISO(todayISO, 1), '07:00');
  return nextBoundary.getTime() - now.getTime();
}
