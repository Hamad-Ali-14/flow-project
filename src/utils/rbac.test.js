import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessPage, filterNavForRole } from './rbac.js';

const nav = ['overview', 'shifts', 'station', 'expenses', 'people', 'income', 'reports'].map((id) => ({ id }));

test('owner and admin can open every page', () => {
  for (const role of ['owner', 'admin']) {
    for (const n of nav) assert.equal(canAccessPage(role, n.id), true);
  }
});

test('manager can open expenses, people and income but not reports', () => {
  for (const id of ['expenses', 'people', 'income', 'overview', 'shifts', 'station', 'settings']) {
    assert.equal(canAccessPage('manager', id), true, id);
  }
  assert.equal(canAccessPage('manager', 'reports'), false);
});

test('supervisor and attendant stay locked out of ledgers', () => {
  for (const role of ['supervisor', 'attendant']) {
    for (const id of ['expenses', 'people', 'income', 'reports']) assert.equal(canAccessPage(role, id), false);
  }
});

test('manager nav keeps the owner order', () => {
  assert.deepEqual(
    filterNavForRole('manager', nav).map((n) => n.id),
    ['overview', 'shifts', 'station', 'expenses', 'people', 'income'],
  );
});
