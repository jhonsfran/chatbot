'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';

import { toast } from '@/components/toast';
import { BILLING_PROFILE_KEY } from '@/hooks/use-billing-profile';

type UpgradePromptContextValue = {
  isUpgradePromptOpen: boolean;
  isUpgradeCardVisible: boolean;
  isLimitPrompt: boolean;
  isUpgrading: boolean;
  showPlanDialog: () => void;
  showLimitPrompt: () => void;
  hidePlanDialog: () => void;
  dismissUpgradeReminder: () => void;
  startUpgrade: () => Promise<void>;
};

const UpgradePromptContext = createContext<UpgradePromptContextValue | null>(
  null,
);

export function UpgradePromptProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [isUpgradePromptOpen, setUpgradePromptOpen] = useState(false);
  const [isUpgradeCardVisible, setUpgradeCardVisible] = useState(false);
  const [isLimitPrompt, setIsLimitPrompt] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);

  const showPlanDialog = useCallback(() => {
    setIsLimitPrompt(false);
    setUpgradePromptOpen(true);
  }, []);

  const showLimitPrompt = useCallback(() => {
    setIsLimitPrompt(true);
    setUpgradeCardVisible(true);
    setUpgradePromptOpen(true);
  }, []);

  const hidePlanDialog = useCallback(() => setUpgradePromptOpen(false), []);

  const dismissUpgradeReminder = useCallback(() => {
    setUpgradePromptOpen(false);
    setUpgradeCardVisible(false);
  }, []);

  const startUpgrade = useCallback(async () => {
    setIsUpgrading(true);

    try {
      const response = await fetch('/api/billing/upgrade', {
        method: 'POST',
      });
      const result = (await response.json()) as {
        message?: string;
        status?: 'changed' | 'requires_payment_method';
        url?: string;
      };

      if (!response.ok) {
        throw new Error(result.message ?? 'Unable to start your upgrade.');
      }

      if (result.status === 'requires_payment_method' && result.url) {
        window.location.assign(result.url);
        return;
      }

      if (result.status === 'changed') {
        dismissUpgradeReminder();
        await mutate(BILLING_PROFILE_KEY);
        toast({
          type: 'success',
          description: 'Pro is active. You can continue chatting.',
        });
        router.refresh();
        return;
      }

      throw new Error('Unable to start your upgrade.');
    } catch (error) {
      toast({
        type: 'error',
        description:
          error instanceof Error
            ? error.message
            : 'Unable to start your upgrade.',
      });
    } finally {
      setIsUpgrading(false);
    }
  }, [dismissUpgradeReminder, mutate, router]);

  useEffect(() => {
    const url = new URL(window.location.href);

    if (url.searchParams.get('upgrade') !== 'payment-method-added') {
      return;
    }

    showPlanDialog();
    url.searchParams.delete('upgrade');
    window.history.replaceState({}, '', url);
  }, [showPlanDialog]);

  const value = useMemo(
    () => ({
      isUpgradePromptOpen,
      isUpgradeCardVisible,
      isLimitPrompt,
      isUpgrading,
      showPlanDialog,
      showLimitPrompt,
      hidePlanDialog,
      dismissUpgradeReminder,
      startUpgrade,
    }),
    [
      dismissUpgradeReminder,
      hidePlanDialog,
      isLimitPrompt,
      isUpgradeCardVisible,
      isUpgradePromptOpen,
      isUpgrading,
      showLimitPrompt,
      showPlanDialog,
      startUpgrade,
    ],
  );

  return (
    <UpgradePromptContext.Provider value={value}>
      {children}
    </UpgradePromptContext.Provider>
  );
}

export function useUpgradePrompt() {
  const context = useContext(UpgradePromptContext);

  if (!context) {
    throw new Error(
      'useUpgradePrompt must be used within UpgradePromptProvider',
    );
  }

  return context;
}
