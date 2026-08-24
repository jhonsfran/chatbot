'use client';

import { Building2, LockKeyhole } from 'lucide-react';

import { CheckCircleFillIcon, SparklesIcon } from '@/components/icons';
import { useUpgradePrompt } from '@/components/upgrade-prompt';
import { useBillingProfile } from '@/hooks/use-billing-profile';
import { usePlanCatalog } from '@/hooks/use-plan-catalog';
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
import { Skeleton } from '@/components/ui/skeleton';

function formatPrice(price: string, currency: 'USD' | 'EUR') {
  const amount = Number(price);

  if (!Number.isFinite(amount)) {
    return price;
  }

  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function formatCadence(interval: string, count: number) {
  if (interval === 'onetime') {
    return 'one time';
  }

  return `/ ${count} ${interval}${count === 1 ? '' : 's'}`;
}

export function UpgradeDialog() {
  const {
    hidePlanDialog,
    isLimitPrompt,
    isUpgradePromptOpen,
    isUpgrading,
    startUpgrade,
  } = useUpgradePrompt();
  const { profile } = useBillingProfile();
  const currentPlan = profile?.status === 'ready' ? profile.plan : null;
  const { plans, error, isLoading, refresh } =
    usePlanCatalog(isUpgradePromptOpen);

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
            Usage and renewal times follow your active plan. Enterprise access
            is assigned by sales.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-3 p-5 md:grid-cols-3">
          {isLoading && !plans
            ? ['free', 'pro', 'enterprise'].map((slug) => (
                <section
                  className="flex min-h-64 flex-col rounded-xl border bg-muted/20 p-4"
                  key={slug}
                >
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="mt-3 h-6 w-28" />
                  <Skeleton className="mt-5 h-4 w-full" />
                  <Skeleton className="mt-2 h-4 w-4/5" />
                  <Skeleton className="mt-6 h-16 w-full" />
                </section>
              ))
            : null}

          {error && !plans ? (
            <div className="col-span-full rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
              <p className="text-sm font-medium">Plans are unavailable</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The current Unprice catalog could not be loaded.
              </p>
              <Button
                className="mt-4"
                onClick={() => void refresh()}
                size="sm"
                type="button"
                variant="outline"
              >
                Try again
              </Button>
            </div>
          ) : null}

          {!isLoading && !error && plans?.length === 0 ? (
            <p className="col-span-full p-5 text-center text-sm text-muted-foreground">
              No supported plans are published.
            </p>
          ) : null}

          {plans?.map((plan) => {
            const isCurrent = currentPlan === plan.slug;
            const isEnterprise = plan.slug === 'enterprise';

            return (
              <section
                className={cn(
                  'flex min-h-64 flex-col rounded-xl border bg-muted/20 p-4',
                  isCurrent && 'border-foreground/40 bg-muted/45 shadow-sm',
                )}
                key={plan.planVersionId}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{plan.title}</p>
                    <p className="mt-1 flex items-baseline gap-1 font-mono text-lg font-semibold tabular-nums">
                      {formatPrice(plan.flatPrice, plan.currency)}
                      <span className="font-sans text-[10px] font-normal text-muted-foreground">
                        {formatCadence(
                          plan.billingInterval,
                          plan.billingIntervalCount,
                        )}
                      </span>
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
                  {plan.features.map((feature) => (
                    <li
                      className="flex items-center gap-2 text-xs"
                      key={feature}
                    >
                      <CheckCircleFillIcon size={14} />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-4">
                  {plan.slug === 'pro' && currentPlan === 'free' ? (
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
