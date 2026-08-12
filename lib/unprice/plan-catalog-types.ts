import type { BillingPlan } from './billing-profile-types';
import { unpriceCatalog } from './catalog';

export type PlanCatalogSource = {
  id: string;
  title: string;
  description: string;
  latest: boolean | null;
  active: boolean | null;
  status: 'draft' | 'published';
  archived: boolean | null;
  currency: 'USD' | 'EUR';
  flatPrice: string;
  billingConfig: {
    billingInterval: 'month' | 'year' | 'week' | 'day' | 'minute' | 'onetime';
    billingIntervalCount: number;
  };
  plan: {
    slug: string;
    title: string;
    description: string;
    active: boolean | null;
    enterprisePlan: boolean | null;
  };
  planFeatures: Array<{
    displayFeatureText: string;
    order: number;
    metadata: { hidden?: boolean } | null;
  }>;
};

export type BillingPlanCard = {
  planVersionId: string;
  slug: BillingPlan;
  title: string;
  description: string;
  currency: 'USD' | 'EUR';
  flatPrice: string;
  billingInterval: PlanCatalogSource['billingConfig']['billingInterval'];
  billingIntervalCount: number;
  features: string[];
  enterprise: boolean;
};

export type BillingPlanCatalog = {
  plans: BillingPlanCard[];
};

const knownPlanOrder: BillingPlan[] = [
  unpriceCatalog.plans.free,
  unpriceCatalog.plans.pro,
  unpriceCatalog.plans.enterprise,
];

const knownPlanSlugs = new Set<string>(knownPlanOrder);

function isKnownPlanSlug(value: string): value is BillingPlan {
  return knownPlanSlugs.has(value);
}

export function normalizePlanCatalog(
  planVersions: readonly PlanCatalogSource[],
): BillingPlanCard[] {
  return planVersions
    .filter(
      (version) =>
        isKnownPlanSlug(version.plan.slug) &&
        version.status === 'published' &&
        version.latest === true &&
        version.active === true &&
        version.archived !== true &&
        version.plan.active === true,
    )
    .map((version) => ({
      planVersionId: version.id,
      slug: version.plan.slug as BillingPlan,
      title: version.title || version.plan.title,
      description: version.description || version.plan.description,
      currency: version.currency,
      flatPrice: version.flatPrice,
      billingInterval: version.billingConfig.billingInterval,
      billingIntervalCount: version.billingConfig.billingIntervalCount,
      features: version.planFeatures
        .filter(
          (feature) =>
            feature.metadata?.hidden !== true &&
            feature.displayFeatureText.trim().length > 0,
        )
        .sort((left, right) => left.order - right.order)
        .map((feature) => feature.displayFeatureText),
      enterprise: version.plan.enterprisePlan === true,
    }))
    .sort(
      (left, right) =>
        knownPlanOrder.indexOf(left.slug) - knownPlanOrder.indexOf(right.slug),
    );
}
