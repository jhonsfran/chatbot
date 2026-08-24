export type BillingPlan = 'free' | 'pro' | 'enterprise';

export type BillingBlockReason =
  | 'LIMIT_EXCEEDED'
  | 'RUN_BUDGET_EXCEEDED'
  | 'WALLET_EMPTY';

type BillingProfileBase = {
  serverNow: number;
};

export type PendingBillingProfile = BillingProfileBase & {
  status: 'pending';
};

export type FailedBillingProfile = BillingProfileBase & {
  status: 'failed';
  message: string;
};

export type ReadyBillingProfile = BillingProfileBase & {
  status: 'ready';
  plan: BillingPlan | null;
  usage: number;
  allowance: number | null;
  hardLimit: boolean;
  usageResetsAt: number | null;
  cycleEndsAt: number | null;
  blockingReason: BillingBlockReason | null;
  canUseReasoning: boolean;
  canUseArtifacts: boolean;
  canSharePublicChats: boolean;
  canSelfUpgrade: boolean;
};

export type BillingProfile =
  | PendingBillingProfile
  | FailedBillingProfile
  | ReadyBillingProfile;

type BillingUsageSource = {
  allowed: boolean;
  rejectionReason?: string | null;
  usage?: number;
  limit?: number | null;
  quotaWindow?: {
    startAt: number;
    endAt: number | null;
  } | null;
};

const billingBlockReasons = new Set<BillingBlockReason>([
  'LIMIT_EXCEEDED',
  'RUN_BUDGET_EXCEEDED',
  'WALLET_EMPTY',
]);

export function isBillingBlockReason(
  reason: unknown,
): reason is BillingBlockReason {
  return (
    typeof reason === 'string' &&
    billingBlockReasons.has(reason as BillingBlockReason)
  );
}

export function normalizeBillingUsage(source: BillingUsageSource) {
  const allowance = typeof source.limit === 'number' ? source.limit : null;
  const usage = source.usage ?? 0;
  const limitReached = allowance !== null && usage >= allowance;
  const rejectionReason = isBillingBlockReason(source.rejectionReason)
    ? source.rejectionReason
    : null;

  return {
    usage,
    allowance,
    hardLimit: allowance !== null,
    usageResetsAt: source.quotaWindow?.endAt ?? null,
    blockingReason: rejectionReason ?? (limitReached ? 'LIMIT_EXCEEDED' : null),
  } satisfies Pick<
    ReadyBillingProfile,
    'usage' | 'allowance' | 'hardLimit' | 'usageResetsAt' | 'blockingReason'
  >;
}

export function hasReachedUsageLimit(
  profile: BillingProfile | null | undefined,
): boolean {
  return (
    profile?.status === 'ready' &&
    (profile.blockingReason !== null ||
      (profile.hardLimit &&
        profile.allowance !== null &&
        profile.usage >= profile.allowance))
  );
}

export function getBillingProfileRefreshInterval(
  profile: BillingProfile | undefined,
): number {
  if (profile?.status === 'pending') {
    return 1_000;
  }

  return profile?.status === 'ready' ? 15_000 : 0;
}
