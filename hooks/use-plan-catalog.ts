'use client';

import useSWR from 'swr';

import type { BillingPlanCatalog } from '@/lib/unprice/plan-catalog-types';
import { fetcher } from '@/lib/utils';

export const BILLING_PLAN_CATALOG_KEY = '/api/billing/plans';

export function usePlanCatalog(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<BillingPlanCatalog>(
    enabled ? BILLING_PLAN_CATALOG_KEY : null,
    fetcher,
    { revalidateOnFocus: true },
  );

  return {
    plans: data?.plans,
    error,
    isLoading,
    refresh: mutate,
  };
}
