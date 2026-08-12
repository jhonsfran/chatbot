'use client';

import { Clock3, Gauge, RefreshCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useBillingProfile } from '@/hooks/use-billing-profile';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';

function formatTokens(value: number) {
  return new Intl.NumberFormat('en', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function UsageCard({ onManagePlan }: { onManagePlan: () => void }) {
  const { profile, error, isLoading, refresh, retryProvisioning } =
    useBillingProfile();
  const [clientNow, setClientNow] = useState(Date.now());
  const [isRetrying, setIsRetrying] = useState(false);
  const clockOffset = useMemo(
    () => (profile ? profile.serverNow - Date.now() : 0),
    [profile],
  );
  const now = clientNow + clockOffset;

  useEffect(() => {
    const interval = window.setInterval(() => setClientNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const nextBoundary = Math.min(
      profile?.usageResetsAt ?? Number.POSITIVE_INFINITY,
      profile?.cycleEndsAt ?? Number.POSITIVE_INFINITY,
    );

    if (!Number.isFinite(nextBoundary)) {
      return;
    }

    const serverAlignedNow = Date.now() + clockOffset;
    const timeout = window.setTimeout(
      () => void refresh(),
      Math.max(0, nextBoundary - serverAlignedNow) + 250,
    );
    return () => window.clearTimeout(timeout);
  }, [clockOffset, profile?.cycleEndsAt, profile?.usageResetsAt, refresh]);

  if (isLoading && !profile) {
    return (
      <div className="rounded-xl border border-sidebar-border/80 bg-sidebar-accent/45 p-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-4 h-2 w-full" />
        <Skeleton className="mt-3 h-7 w-full" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
        <p className="font-medium">Usage is unavailable</p>
        <Button className="mt-2 h-7 w-full" onClick={() => refresh()} size="sm">
          Try again
        </Button>
      </div>
    );
  }

  if (profile.status === 'pending') {
    return (
      <div className="rounded-xl border border-sidebar-border/80 bg-sidebar-accent/45 p-3">
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="size-1.5 animate-pulse rounded-full bg-amber-400" />
          Setting up billing
        </div>
        <p className="mt-2 text-[11px] leading-4 text-sidebar-foreground/55">
          Your account is ready. Plan checks will finish in a moment.
        </p>
      </div>
    );
  }

  if (profile.status === 'failed') {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-xs font-medium">Billing setup needs attention</p>
        <p className="mt-1 text-[11px] leading-4 text-sidebar-foreground/55">
          {profile.message}
        </p>
        <Button
          className="mt-2 h-7 w-full gap-1.5"
          disabled={isRetrying}
          onClick={async () => {
            setIsRetrying(true);
            try {
              await retryProvisioning();
            } finally {
              setIsRetrying(false);
            }
          }}
          size="sm"
          variant="outline"
        >
          <RefreshCcw className={cn('size-3', isRetrying && 'animate-spin')} />
          Retry setup
        </Button>
      </div>
    );
  }

  const percentage = profile.allowance
    ? Math.min(100, (profile.usage / profile.allowance) * 100)
    : 0;

  return (
    <div
      className="overflow-hidden rounded-xl border border-sidebar-border/80 bg-sidebar-accent/45 p-3"
      data-testid="usage-card"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/55">
          <Gauge className="size-3" /> Usage
        </div>
        <span className="rounded-full border border-sidebar-border bg-sidebar px-2 py-0.5 text-[10px] font-medium capitalize">
          {profile.plan}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="font-mono text-lg font-semibold tabular-nums tracking-tight">
          {formatTokens(profile.usage)}
        </p>
        <p className="pb-0.5 text-[10px] text-sidebar-foreground/50">
          of {profile.allowance ? formatTokens(profile.allowance) : 'unlimited'}
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sidebar-foreground/10">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            percentage >= 90 ? 'bg-amber-400' : 'bg-sidebar-primary',
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-sidebar-border/70 pt-2.5 text-[10px] text-sidebar-foreground/55">
        <span className="flex items-center gap-1">
          <RefreshCcw className="size-2.5" /> Reset{' '}
          <strong className="font-medium text-sidebar-foreground/80 tabular-nums">
            {profile.usageResetsAt
              ? formatCountdown(profile.usageResetsAt - now)
              : '—'}
          </strong>
        </span>
        <span className="flex items-center justify-end gap-1">
          <Clock3 className="size-2.5" /> Renew{' '}
          <strong className="font-medium text-sidebar-foreground/80 tabular-nums">
            {profile.cycleEndsAt
              ? formatCountdown(profile.cycleEndsAt - now)
              : '—'}
          </strong>
        </span>
      </div>

      <Button
        className="mt-2.5 h-7 w-full text-xs"
        onClick={onManagePlan}
        size="sm"
        type="button"
        variant="outline"
      >
        Manage plan
      </Button>
    </div>
  );
}
