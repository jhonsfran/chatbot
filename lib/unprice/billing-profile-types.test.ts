import assert from 'node:assert/strict';
import test from 'node:test';
import { getNextWindowBoundary } from './billing-profile-types';

test('returns the next five-minute boundary', () => {
  const now = Date.UTC(2026, 7, 11, 12, 3, 20);

  assert.equal(
    getNextWindowBoundary(now, 5),
    Date.UTC(2026, 7, 11, 12, 5, 0),
  );
});

test('moves an exact boundary to the next window', () => {
  const now = Date.UTC(2026, 7, 11, 12, 5, 0);

  assert.equal(
    getNextWindowBoundary(now, 5),
    Date.UTC(2026, 7, 11, 12, 10, 0),
  );
});

test('aligns a usage window to the subscription cycle', () => {
  const anchor = Date.UTC(2026, 7, 11, 12, 3, 0);
  const now = Date.UTC(2026, 7, 11, 12, 6, 20);

  assert.equal(
    getNextWindowBoundary(now, 5, anchor),
    Date.UTC(2026, 7, 11, 12, 8, 0),
  );
});
