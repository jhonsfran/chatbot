import 'server-only';

import {
  type BillingPlanCatalog,
  normalizePlanCatalog,
} from './plan-catalog-types';
import {
  listLatestPublishedPlanVersions,
  UnpriceRuntimeError,
} from './runtime';

const CATALOG_TTL_MS = 60_000;

let catalogCache:
  | { expiresAt: number; catalog: BillingPlanCatalog }
  | undefined;

export async function getLatestKnownPlanCatalog(): Promise<BillingPlanCatalog> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) {
    return catalogCache.catalog;
  }

  const result = await listLatestPublishedPlanVersions();
  const plans = normalizePlanCatalog(result.planVersions);

  if (plans.length === 0) {
    throw new UnpriceRuntimeError(
      'planVersions.list',
      'KNOWN_PLANS_NOT_FOUND',
      undefined,
      'No active published application plans are available',
    );
  }

  const catalog = { plans };
  catalogCache = { expiresAt: Date.now() + CATALOG_TTL_MS, catalog };

  return catalog;
}
