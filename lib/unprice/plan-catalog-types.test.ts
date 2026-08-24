import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizePlanCatalog,
  type PlanCatalogSource,
} from './plan-catalog-types';

function plan(
  slug: string,
  overrides: Partial<PlanCatalogSource> = {},
): PlanCatalogSource {
  return {
    id: `pv_${slug}`,
    title: `${slug} version`,
    description: `${slug} description`,
    latest: true,
    active: true,
    status: 'published',
    archived: false,
    currency: 'USD',
    flatPrice: slug === 'free' ? '0' : '10',
    billingConfig: {
      billingInterval: 'minute',
      billingIntervalCount: 15,
    },
    plan: {
      slug,
      title: slug,
      description: `${slug} plan`,
      active: true,
      enterprisePlan: slug === 'enterprise',
    },
    planFeatures: [
      {
        displayFeatureText: `${slug} visible`,
        order: 1,
        metadata: null,
      },
      {
        displayFeatureText: `${slug} hidden`,
        order: 0,
        metadata: { hidden: true },
      },
    ],
    ...overrides,
  };
}

test('normalizes only active latest published known plans in product order', () => {
  const catalog = normalizePlanCatalog([
    plan('enterprise'),
    plan('unknown'),
    plan('free'),
    plan('pro'),
    plan('pro', { id: 'pv_inactive', active: false }),
    plan('free', { id: 'pv_archived', archived: true }),
    plan('enterprise', { id: 'pv_old', latest: false }),
    plan('free', { id: 'pv_draft', status: 'draft' }),
  ]);

  assert.deepEqual(
    catalog.map(({ slug }) => slug),
    ['free', 'pro', 'enterprise'],
  );
  assert.deepEqual(catalog[0]?.features, ['free visible']);
  assert.equal(catalog[2]?.enterprise, true);
});

test('uses exact Unprice commercial fields', () => {
  const [card] = normalizePlanCatalog([plan('pro')]);

  assert.deepEqual(card, {
    planVersionId: 'pv_pro',
    slug: 'pro',
    title: 'pro version',
    description: 'pro description',
    currency: 'USD',
    flatPrice: '10',
    billingInterval: 'minute',
    billingIntervalCount: 15,
    features: ['pro visible'],
    enterprise: false,
  });
});
