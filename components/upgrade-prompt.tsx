'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { toast } from '@/components/toast';

type UpgradePromptContextValue = {
  isUpgradePromptOpen: boolean;
  isUpgradeCardVisible: boolean;
  isUpgrading: boolean;
  showUpgradePrompt: () => void;
  hideUpgradePrompt: () => void;
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
  const [isUpgradePromptOpen, setUpgradePromptOpen] = useState(false);
  const [isUpgradeCardVisible, setUpgradeCardVisible] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);

  const showUpgradePrompt = () => {
    setUpgradeCardVisible(true);
    setUpgradePromptOpen(true);
  };

  const hideUpgradePrompt = () => setUpgradePromptOpen(false);

  const dismissUpgradeReminder = () => {
    setUpgradePromptOpen(false);
    setUpgradeCardVisible(false);
  };

  const startUpgrade = async () => {
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
  };

  useEffect(() => {
    const url = new URL(window.location.href);

    if (url.searchParams.get('upgrade') !== 'payment-method-added') {
      return;
    }

    showUpgradePrompt();
    url.searchParams.delete('upgrade');
    window.history.replaceState({}, '', url);
  }, []);

  return (
    <UpgradePromptContext.Provider
      value={{
        isUpgradePromptOpen,
        isUpgradeCardVisible,
        isUpgrading,
        showUpgradePrompt,
        hideUpgradePrompt,
        dismissUpgradeReminder,
        startUpgrade,
      }}
    >
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
