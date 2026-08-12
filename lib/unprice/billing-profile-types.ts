export type BillingPlan = 'free' | 'pro' | 'enterprise';

export type BillingProfile = {
  status: 'pending' | 'ready' | 'failed';
  serverNow: number;
  plan: BillingPlan | null;
  usage: number;
  allowance: number | null;
  hardLimit: boolean;
  usageResetsAt: number | null;
  cycleEndsAt: number | null;
  canUseReasoning: boolean;
  canUseArtifacts: boolean;
  canSharePublicChats: boolean;
  canSelfUpgrade: boolean;
  message?: string;
};

export function getNextWindowBoundary(
  now: number,
  minutes: number,
  anchor = 0,
): number {
  const windowMs = minutes * 60 * 1000;
  const elapsed = Math.max(0, now - anchor);
  return anchor + (Math.floor(elapsed / windowMs) + 1) * windowMs;
}
