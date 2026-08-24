import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getBillingProfileRefreshInterval,
  hasReachedUsageLimit,
  normalizeBillingUsage,
  type ReadyBillingProfile,
} from './billing-profile-types';

function billingProfile(
  overrides: Partial<ReadyBillingProfile> = {},
): ReadyBillingProfile {
  return {
    status: 'ready',
    serverNow: Date.UTC(2026, 7, 11, 12, 3, 20),
    plan: 'free',
    usage: 80,
    allowance: 100,
    hardLimit: true,
    blockingReason: null,
    usageResetsAt: Date.UTC(2026, 7, 11, 12, 5, 0),
    cycleEndsAt: Date.UTC(2026, 8, 11, 12, 0, 0),
    canUseReasoning: false,
    canUseArtifacts: false,
    canSharePublicChats: false,
    canSelfUpgrade: true,
    ...overrides,
  };
}

test('reports a reached hard usage limit', () => {
  assert.equal(
    hasReachedUsageLimit(billingProfile({ usage: 100, allowance: 100 })),
    true,
  );
  assert.equal(
    hasReachedUsageLimit(billingProfile({ usage: 101, allowance: 100 })),
    true,
  );
});

test('does not report a usage limit while capacity remains', () => {
  assert.equal(
    hasReachedUsageLimit(billingProfile({ usage: 99, allowance: 100 })),
    false,
  );
});

test('does not report soft, unlimited, or unready profiles as limited', () => {
  assert.equal(
    hasReachedUsageLimit(billingProfile({ hardLimit: false })),
    false,
  );
  assert.equal(
    hasReachedUsageLimit(billingProfile({ allowance: null })),
    false,
  );
  assert.equal(
    hasReachedUsageLimit({ status: 'pending', serverNow: 0 }),
    false,
  );
  assert.equal(hasReachedUsageLimit(undefined), false);
});

test('uses the quota window returned by the billing service', () => {
  assert.deepEqual(
    normalizeBillingUsage({
      allowed: true,
      usage: 42,
      limit: 100,
      quotaWindow: { startAt: 1_000, endAt: 2_000 },
    }),
    {
      usage: 42,
      allowance: 100,
      hardLimit: true,
      usageResetsAt: 2_000,
      blockingReason: null,
    },
  );
});

test('does not invent an allowance or reset window', () => {
  assert.deepEqual(
    normalizeBillingUsage({ allowed: true, usage: 42, limit: null }),
    {
      usage: 42,
      allowance: null,
      hardLimit: false,
      usageResetsAt: null,
      blockingReason: null,
    },
  );
});

test('normalizes quota and wallet blocking reasons', () => {
  assert.equal(
    normalizeBillingUsage({
      allowed: true,
      usage: 100,
      limit: 100,
    }).blockingReason,
    'LIMIT_EXCEEDED',
  );
  assert.equal(
    normalizeBillingUsage({
      allowed: false,
      rejectionReason: 'WALLET_EMPTY',
    }).blockingReason,
    'WALLET_EMPTY',
  );
});

test('polls pending provisioning and stops polling failed provisioning', () => {
  assert.equal(
    getBillingProfileRefreshInterval({ status: 'pending', serverNow: 0 }),
    1_000,
  );
  assert.equal(
    getBillingProfileRefreshInterval({
      status: 'failed',
      serverNow: 0,
      message: 'failed',
    }),
    0,
  );
});
