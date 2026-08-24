import 'server-only';

import type { User } from '@/lib/db/schema';
import { unpriceCatalog } from '@/lib/unprice/catalog';
import {
  checkArtifactToolsAccess,
  checkPublicChatSharingAccess,
  checkReasoningModelAccess,
  checkTotalTokenAccess,
  getCustomerSubscription,
} from '@/lib/unprice/runtime';
import {
  type BillingPlan,
  type BillingProfile,
  normalizeBillingUsage,
} from './billing-profile-types';

const ENTITLEMENT_CACHE_TTL_MS = 15_000;
const ENTITLEMENT_CACHE_MAX_ENTRIES = 500;

export type FlatEntitlements = {
  canUseReasoning: boolean;
  canUseArtifacts: boolean;
  canSharePublicChats: boolean;
};

const entitlementCache = new Map<
  string,
  { expiresAt: number; value: FlatEntitlements }
>();

export function invalidateEntitlementCache(customerId: string) {
  entitlementCache.delete(customerId);
}

export async function getFlatEntitlements(
  customerId: string,
): Promise<FlatEntitlements> {
  const cached = entitlementCache.get(customerId);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const [reasoning, artifacts, sharing] = await Promise.all([
    checkReasoningModelAccess(customerId),
    checkArtifactToolsAccess(customerId),
    checkPublicChatSharingAccess(customerId),
  ]);
  const value = {
    canUseReasoning: reasoning.allowed,
    canUseArtifacts: artifacts.allowed,
    canSharePublicChats: sharing.allowed,
  };

  if (entitlementCache.size >= ENTITLEMENT_CACHE_MAX_ENTRIES) {
    const oldestKey = entitlementCache.keys().next().value;

    if (oldestKey) {
      entitlementCache.delete(oldestKey);
    }
  }

  entitlementCache.set(customerId, {
    expiresAt: Date.now() + ENTITLEMENT_CACHE_TTL_MS,
    value,
  });

  return value;
}

function asBillingPlan(value: string): BillingPlan | null {
  if (
    value === unpriceCatalog.plans.free ||
    value === unpriceCatalog.plans.pro ||
    value === unpriceCatalog.plans.enterprise
  ) {
    return value;
  }

  return null;
}

export async function getBillingProfile(
  user: User,
  now = Date.now(),
): Promise<BillingProfile> {
  if (!user.unpriceCustomerId) {
    const failed = user.unpriceProvisioningStatus === 'failed';

    if (failed) {
      return {
        status: 'failed',
        serverNow: now,
        message:
          user.unpriceProvisioningError ??
          'Billing setup did not finish. Retry from the usage card.',
      };
    }

    return { status: 'pending', serverNow: now };
  }

  const [subscription, tokenAccess, entitlements] = await Promise.all([
    getCustomerSubscription(user.unpriceCustomerId),
    checkTotalTokenAccess(user.unpriceCustomerId),
    getFlatEntitlements(user.unpriceCustomerId),
  ]);
  const plan = asBillingPlan(subscription.planSlug);

  return {
    status: 'ready',
    serverNow: now,
    plan,
    ...normalizeBillingUsage(tokenAccess),
    cycleEndsAt: subscription.currentCycleEndAt,
    ...entitlements,
    canSelfUpgrade: plan === 'free',
  };
}
