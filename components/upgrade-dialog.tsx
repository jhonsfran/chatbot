'use client';

import { Building2, LockKeyhole } from 'lucide-react';

import { CheckCircleFillIcon, SparklesIcon } from '@/components/icons';
import { useUpgradePrompt } from '@/components/upgrade-prompt';
import { useBillingProfile } from '@/hooks/use-billing-profile';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

const plans = [
  {
    id: 'free' as const,
    name: 'Free',
    price: '$0',
    cadence: '',
    description: 'Everyday chat with a five-minute usage window.',
    benefits: ['10K tokens / 5 min', 'Standard chat model'],
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    price: '$10',
    cadence: '/ 15 min',
    description: 'More capacity for focused, reasoning-heavy work.',
    benefits: ['1M included tokens / 5 min', 'Reasoning model'],
  },
  {
    id: 'enterprise' as const,
    name: 'Enterprise',
    price: 'Sales',
    cadence: 'managed',
    description: 'A shared workspace with advanced creation tools.',
    benefits: [
      'Reasoning model',
      'Artifact tools',
      'Public chat sharing',
    ],
  },
];

export function UpgradeDialog() {
  const {
    hidePlanDialog,
    isLimitPrompt,
    isUpgradePromptOpen,
    isUpgrading,
    startUpgrade,
  } = useUpgradePrompt();
  const { profile } = useBillingProfile();

  return (
    <AlertDialog
      open={isUpgradePromptOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          hidePlanDialog();
        }
      }}
    >
      <AlertDialogContent
        className="max-h-[90dvh] gap-0 overflow-y-auto border-border/90 p-0 sm:max-w-2xl"
        data-testid="upgrade-dialog"
      >
        <AlertDialogHeader className="border-b px-5 pb-4 pt-5 text-left">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <span className="flex size-7 items-center justify-center rounded-md border bg-muted text-foreground">
              <SparklesIcon size={15} />
            </span>
            {isLimitPrompt ? 'Usage allowance reached' : 'Plans and access'}
          </div>
          <AlertDialogTitle className="max-w-lg text-2xl tracking-tight">
            {isLimitPrompt
              ? 'Your next window is close.'
              : 'Choose how much room you need.'}
          </AlertDialogTitle>
          <AlertDialogDescription className="max-w-xl pt-1 text-pretty leading-6">
            Usage resets every five minutes. The demo billing cycle renews every
            15 minutes. Enterprise access is assigned by sales.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-3 p-5 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = profile?.plan === plan.id;
            const isEnterprise = plan.id === 'enterprise';

            return (
              <section
                className={cn(
                  'flex min-h-64 flex-col rounded-xl border bg-muted/20 p-4',
                  isCurrent && 'border-foreground/40 bg-muted/45 shadow-sm',
                )}
                key={plan.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{plan.name}</p>
                    <p className="mt-1 flex items-baseline gap-1 font-mono text-lg font-semibold tabular-nums">
                      {plan.price}
                      {plan.cadence && (
                        <span className="font-sans text-[10px] font-normal text-muted-foreground">
                          {plan.cadence}
                        </span>
                      )}
                    </p>
                  </div>
                  {isCurrent ? (
                    <span className="rounded-full border bg-background px-2 py-1 text-[9px] uppercase tracking-[0.12em]">
                      Current
                    </span>
                  ) : isEnterprise ? (
                    <Building2 className="size-4 text-muted-foreground" />
                  ) : null}
                </div>

                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {plan.description}
                </p>
                <ul className="mt-4 space-y-2 border-t pt-3">
                  {plan.benefits.map((benefit) => (
                    <li className="flex items-center gap-2 text-xs" key={benefit}>
                      <CheckCircleFillIcon size={14} />
                      {benefit}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-4">
                  {plan.id === 'pro' && profile?.plan === 'free' ? (
                    <Button
                      className="w-full"
                      data-testid="upgrade-button"
                      disabled={isUpgrading}
                      onClick={startUpgrade}
                      size="sm"
                      type="button"
                    >
                      {isUpgrading ? 'Starting…' : 'Upgrade to Pro'}
                    </Button>
                  ) : isEnterprise ? (
                    <div className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-dashed text-[10px] text-muted-foreground">
                      <LockKeyhole className="size-3" /> Managed by sales
                    </div>
                  ) : (
                    <div className="h-8" />
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <AlertDialogFooter className="border-t bg-muted/20 px-5 py-4">
          <AlertDialogCancel
            className="mt-0"
            data-testid="upgrade-dialog-dismiss"
            disabled={isUpgrading}
          >
            Close
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
