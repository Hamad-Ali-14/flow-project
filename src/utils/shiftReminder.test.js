import test from 'node:test';
import assert from 'node:assert/strict';
import { getKarachiShift, getKarachiEndedShift } from '../dateUtils.js';

// Karachi = UTC+5 (no DST)
const at = iso => new Date(iso);

test('7:00 PM PKT: Day shift has ended (not Night)', () => {
  const s = getKarachiEndedShift(at('2026-10-09T14:00:00Z'));
  assert.equal(s.id, 'day');
  assert.equal(s.hours.split(' - ')[1], '7:00 PM');
});

test('7:00 AM PKT: Night shift has ended (not Day)', () => {
  const s = getKarachiEndedShift(at('2026-10-09T02:00:00Z'));
  assert.equal(s.id, 'night');
  assert.equal(s.hours.split(' - ')[1], '7:00 AM');
});

test('timer firing a few seconds early/late still gives the right shift', () => {
  assert.equal(getKarachiEndedShift(at('2026-10-09T13:59:58Z')).id, 'day');
  assert.equal(getKarachiEndedShift(at('2026-10-09T14:00:03Z')).id, 'day');
  assert.equal(getKarachiEndedShift(at('2026-10-09T01:59:58Z')).id, 'night');
  assert.equal(getKarachiEndedShift(at('2026-10-09T02:00:03Z')).id, 'night');
});

test('getKarachiShift (running shift) is unchanged', () => {
  assert.equal(getKarachiShift(at('2026-10-09T14:00:00Z')).id, 'night');
  assert.equal(getKarachiShift(at('2026-10-09T02:00:00Z')).id, 'day');
});
