'use client';

import {
  type BillingProfile,
  getBillingProfileRefreshInterval,
} from '@/lib/unprice/billing-profile-types';
import { fetcher } from '@/lib/utils';
import useSWR from 'swr';

export const BILLING_PROFILE_KEY = '/api/billing/profile';

export function useBillingProfile(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<BillingProfile>(
    enabled ? BILLING_PROFILE_KEY : null,
    fetcher,
    {
      revalidateOnFocus: true,
      refreshInterval: getBillingProfileRefreshInterval,
    },
  );

  const retryProvisioning = async () => {
    const response = await fetch('/api/billing/provision', { method: 'POST' });

    if (!response.ok) {
      throw new Error('Could not restart billing setup.');
    }

    await mutate();
  };

  return {
    profile: data,
    error,
    isLoading,
    refresh: mutate,
    retryProvisioning,
  };
}
