'use client';

import useSWR from 'swr';

import { fetcher } from '@/lib/utils';
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar';

type UsageMetric = {
  used: number;
  limit: number | null;
  includedAllowance: number | null;
  resetInterval: string | null;
  quotaWindow: {
    periodKey: string;
    startAt: number;
    endAt: number;
  } | null;
};

type BillingPeriod = {
  startAt: number;
  endAt: number;
  tokens: {
    used: number;
    spending: {
      amount: string;
      currency: string;
      displayAmount: string;
    } | null;
  };
};

type UsageSummaryResponse =
  | { available: false }
  | {
      available: true;
      tokens: UsageMetric;
      billingPeriod: BillingPeriod | null;
    };

function formatNumber(value: number) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function getCadenceLabel(resetInterval: string | null) {
  if (resetInterval === 'day') {
    return 'Resets daily';
  }

  if (resetInterval === 'month') {
    return 'Resets monthly';
  }

  return 'Current billing period';
}

function getQuotaWindowLabel(metric: UsageMetric) {
  if (!metric.quotaWindow) {
    return getCadenceLabel(metric.resetInterval);
  }

  const resetAt = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(metric.quotaWindow.endAt);

  return `Resets ${resetAt}`;
}

function getBillingPeriodLabel(period: BillingPeriod) {
  const formatter = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  });

  return `${formatter.format(period.startAt)} – ${formatter.format(
    period.endAt,
  )}`;
}

function UsageMeter({
  label,
  metric,
  unit,
}: {
  label: string;
  metric: UsageMetric;
  unit: string;
}) {
  const ratio =
    metric.limit && metric.limit > 0
      ? Math.min(100, (metric.used / metric.limit) * 100)
      : null;
  const value = metric.limit
    ? `${formatNumber(metric.used)} / ${formatNumber(metric.limit)}`
    : `${formatNumber(metric.used)} / unlimited`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium text-sidebar-foreground text-xs">{label}</p>
        <p className="text-sidebar-foreground/70 text-xs tabular-nums">
          {value} {unit}
        </p>
      </div>
      {ratio !== null && (
        <div
          aria-label={`${label}: ${value} ${unit}`}
          aria-valuemax={metric.limit ?? undefined}
          aria-valuemin={0}
          aria-valuenow={metric.used}
          className="mt-2 h-1 overflow-hidden rounded-full bg-sidebar-foreground/10"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-sidebar-foreground/70 transition-[width] duration-300"
            style={{ width: `${ratio}%` }}
          />
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-sidebar-foreground/50">
        {metric.includedAllowance
          ? `Includes ${formatNumber(metric.includedAllowance)} ${unit} before overage · ${getQuotaWindowLabel(metric).toLowerCase()}`
          : getQuotaWindowLabel(metric)}
      </p>
    </div>
  );
}

function BillingTokenUsage({
  metric,
  billingPeriod,
}: {
  metric: UsageMetric;
  billingPeriod: BillingPeriod;
}) {
  const included = metric.includedAllowance;
  const ratio =
    included && included > 0
      ? Math.min(100, (billingPeriod.tokens.used / included) * 100)
      : null;
  const value = included
    ? `${formatNumber(billingPeriod.tokens.used)} / ${formatNumber(included)} included`
    : `${formatNumber(billingPeriod.tokens.used)} this billing period`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium text-sidebar-foreground text-xs">Tokens</p>
        <p className="text-sidebar-foreground/70 text-xs tabular-nums">
          {value}
        </p>
      </div>
      {ratio !== null && (
        <div
          aria-label={`Tokens: ${value}`}
          aria-valuemax={included ?? undefined}
          aria-valuemin={0}
          aria-valuenow={billingPeriod.tokens.used}
          className="mt-2 h-1 overflow-hidden rounded-full bg-sidebar-foreground/10"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-sidebar-foreground/70 transition-[width] duration-300"
            style={{ width: `${ratio}%` }}
          />
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-sidebar-foreground/50">
        {`Billing period ${getBillingPeriodLabel(billingPeriod)}${billingPeriod.tokens.spending ? ` · ${billingPeriod.tokens.spending.displayAmount} overage` : ''}`}
      </p>
    </div>
  );
}

function BillingUsageUnavailable() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium text-sidebar-foreground text-xs">Tokens</p>
        <p className="text-sidebar-foreground/70 text-xs">Unavailable</p>
      </div>
      <p className="mt-1.5 text-[11px] text-sidebar-foreground/50">
        Billing-period usage will refresh when reporting is available.
      </p>
    </div>
  );
}

export function UsageSummary() {
  const { data } = useSWR<UsageSummaryResponse>('/api/billing/usage', fetcher, {
    revalidateOnFocus: true,
  });

  if (!data?.available) {
    return null;
  }

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <section
          className="rounded-xl border border-sidebar-foreground/15 bg-sidebar-accent/40 p-3"
          data-testid="usage-summary"
        >
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10px] text-sidebar-foreground/55 uppercase tracking-[0.15em]">
              Usage
            </p>
            <span className="text-[10px] text-sidebar-foreground/45">
              Quota + billing
            </span>
          </div>
          <div className="space-y-4">
            {data.tokens.limit !== null ? (
              <UsageMeter label="Tokens" metric={data.tokens} unit="tokens" />
            ) : data.billingPeriod ? (
              <BillingTokenUsage
                billingPeriod={data.billingPeriod}
                metric={data.tokens}
              />
            ) : (
              <BillingUsageUnavailable />
            )}
          </div>
        </section>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
