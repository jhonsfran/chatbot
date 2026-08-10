import 'server-only';

import { Unprice, type ApiError, type ApiResult } from '@unprice/api';
import { unpriceCatalog } from './catalog';

type HeaderReader = Pick<Headers, 'get'>;

type CustomerPlanChangeResult =
  | {
      status: 'changed';
      subscriptionId: string;
      phaseId: string;
    }
  | {
      status: 'requires_payment_method';
      paymentProvider: 'sandbox' | 'square' | 'stripe';
      message: string;
    };

type CustomerUsageMetric = {
  used: number;
  limit: number | null;
  includedAllowance: number | null;
  resetInterval: string | null;
  quotaWindow: QuotaWindow | null;
};

type QuotaWindow = {
  periodKey: string;
  startAt: number;
  endAt: number;
};

type CustomerBillingPeriod = {
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

type CustomerUsageSummary = {
  tokens: CustomerUsageMetric;
  billingPeriod: CustomerBillingPeriod | null;
};

type FeatureStatus = {
  usage?: number;
  limit?: number | null;
  quotaWindow?: QuotaWindow | null;
};

type CurrentBillingPeriodUsageResponse = {
  billing_periods: Array<{
    billing_period_id: string;
    cycle_start_at: number;
    cycle_end_at: number;
    usage: Array<{
      feature_slug: string;
      usage: number;
      spending: {
        amount: string;
        currency: string;
        display_amount: string;
      };
    }>;
  }>;
};

type CustomerEntitlement = {
  featurePlanVersion?: {
    config?: {
      tiers?: Array<{
        lastUnit?: number | null;
        unitPrice?: { dinero?: { amount?: number } };
      }>;
    };
    feature?: { slug?: string };
    limit?: number | null;
    resetConfig?: { resetInterval?: string | null } | null;
  };
};

let runtimeClient: Unprice | undefined;

const CHAT_CONVERSATION_BUDGET_MINOR = 10;
// $3.10 covers 31 daily $0.10 token budgets; $0.20 permits the two
// additional simultaneous chat holds allowed by the three-message daily cap.
const FREE_MONTHLY_CREDIT_LINE_MINOR = 330;
const PRO_MONTHLY_CREDIT_LINE_MINOR = 1_000;

export class UnpriceRuntimeError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string,
    readonly requestId?: string,
    message = 'Unprice could not complete the request',
  ) {
    super(message);
    this.name = 'UnpriceRuntimeError';
  }
}

function throwApiError(operation: string, error: ApiError): never {
  throw new UnpriceRuntimeError(
    operation,
    error.code,
    error.requestId,
    error.message,
  );
}

function unwrap<TResult>(
  operation: string,
  response: ApiResult<TResult>,
): TResult {
  if (response.error) {
    throwApiError(operation, response.error);
  }

  return response.result;
}

async function getRuntimeClient(): Promise<Unprice> {
  if (runtimeClient) {
    return runtimeClient;
  }

  const token = process.env.UNPRICE_TOKEN;

  if (!token) {
    throw new UnpriceRuntimeError(
      'client.initialize',
      'MISSING_RUNTIME_TOKEN',
      undefined,
      'UNPRICE_TOKEN is not configured',
    );
  }

  runtimeClient = new Unprice({
    token,
    ...(process.env.UNPRICE_API_URL
      ? { baseUrl: process.env.UNPRICE_API_URL }
      : {}),
  });

  return runtimeClient;
}

function getRuntimeToken(): string {
  const token = process.env.UNPRICE_TOKEN;

  if (!token) {
    throw new UnpriceRuntimeError(
      'client.initialize',
      'MISSING_RUNTIME_TOKEN',
      undefined,
      'UNPRICE_TOKEN is not configured',
    );
  }

  return token;
}

async function postUnpriceRuntimeOperation<TResult>(
  operation: string,
  path: string,
  body: Record<string, unknown>,
): Promise<TResult> {
  const request = new Request(
    new URL(path, process.env.UNPRICE_API_URL ?? 'https://api.unprice.dev'),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getRuntimeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  const response = await fetch(request);
  const payload = (await response.json()) as
    | TResult
    | {
        error?: {
          code?: string;
          message?: string;
          requestId?: string;
        };
      };

  if (!response.ok) {
    const error = (
      payload as {
        error?: {
          code?: string;
          message?: string;
          requestId?: string;
        };
      }
    ).error;

    throw new UnpriceRuntimeError(
      operation,
      error?.code ?? 'FETCH_ERROR',
      error?.requestId,
      error?.message,
    );
  }

  return payload as TResult;
}

export function getApplicationBaseUrl(headers: HeaderReader): string {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  if (configuredUrl) {
    return new URL(configuredUrl).origin;
  }

  const origin = headers.get('origin');

  if (origin) {
    return new URL(origin).origin;
  }

  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  const protocol = headers.get('x-forwarded-proto') ?? 'http';

  return host ? `${protocol}://${host}` : 'http://localhost:3000';
}

export async function provisionUnpriceCustomer({
  userId,
  email,
  applicationBaseUrl,
}: {
  userId: string;
  email: string;
  applicationBaseUrl: string;
}): Promise<string> {
  const planSlug =
    process.env.UNPRICE_SIGNUP_PLAN_SLUG?.trim() || unpriceCatalog.plans.free;
  const creditLineAmountMinor =
    planSlug === unpriceCatalog.plans.free
      ? FREE_MONTHLY_CREDIT_LINE_MINOR
      : planSlug === unpriceCatalog.plans.pro
        ? PRO_MONTHLY_CREDIT_LINE_MINOR
        : undefined;
  const client = await getRuntimeClient();
  const response = await client.customers.signUp({
    name: email.split('@')[0] || email,
    email,
    externalId: userId,
    successUrl: `${applicationBaseUrl}/`,
    cancelUrl: `${applicationBaseUrl}/register`,
    planSlug,
    ...(creditLineAmountMinor
      ? { creditLinePolicy: 'capped' as const, creditLineAmountMinor }
      : {}),
  });
  const result = unwrap('customers.signUp', response);

  if (!result.success) {
    throw new UnpriceRuntimeError(
      'customers.signUp',
      'SIGNUP_INCOMPLETE',
      undefined,
      'Unprice did not complete customer provisioning',
    );
  }

  return result.customerId;
}

export async function checkReasoningModelAccess(customerId: string) {
  return unwrap(
    'access.check',
    await (await getRuntimeClient()).access.check({
      customerId,
      featureSlug: unpriceCatalog.features.reasoningModel,
    }),
  );
}

export async function checkTotalTokenAccess(customerId: string) {
  return unwrap(
    'access.check',
    await (await getRuntimeClient()).access.check({
      customerId,
      featureSlug: unpriceCatalog.features.totalTokens,
    }),
  );
}

function findFeatureEntitlement(
  entitlements: CustomerEntitlement[],
  featureSlug: string,
) {
  return entitlements.find(
    (entitlement) =>
      entitlement.featurePlanVersion?.feature?.slug === featureSlug,
  )?.featurePlanVersion;
}

function getTierAllowance(feature?: CustomerEntitlement['featurePlanVersion']) {
  const includedTier = feature?.config?.tiers?.find(
    (tier) => tier.unitPrice?.dinero?.amount === 0 && tier.lastUnit != null,
  );

  return includedTier?.lastUnit ?? null;
}

function toUsageMetric(
  featureStatus: FeatureStatus,
  feature?: CustomerEntitlement['featurePlanVersion'],
): CustomerUsageMetric {
  return {
    used: Math.max(0, featureStatus.usage ?? 0),
    // A zero-priced tier is an included allowance, not a ceiling. Only the
    // access check's finite limit can deny future use and render as a meter.
    limit: featureStatus.limit ?? feature?.limit ?? null,
    includedAllowance: getTierAllowance(feature),
    resetInterval: feature?.resetConfig?.resetInterval ?? null,
    quotaWindow: featureStatus.quotaWindow ?? null,
  };
}

function toCustomerBillingPeriod(
  response: CurrentBillingPeriodUsageResponse,
): CustomerBillingPeriod | null {
  const period = response.billing_periods[0];

  if (!period) {
    return null;
  }

  const tokens = period.usage.find(
    (usage) => usage.feature_slug === unpriceCatalog.features.totalTokens,
  );

  return {
    startAt: period.cycle_start_at,
    endAt: period.cycle_end_at,
    tokens: {
      used: Math.max(0, tokens?.usage ?? 0),
      spending: tokens
        ? {
            amount: tokens.spending.amount,
            currency: tokens.spending.currency,
            displayAmount: tokens.spending.display_amount,
          }
        : null,
    },
  };
}

export async function getCustomerUsageSummary(
  customerId: string,
): Promise<CustomerUsageSummary> {
  const [tokenStatus, entitlements] = await Promise.all([
    checkTotalTokenAccess(customerId),
    postUnpriceRuntimeOperation<CustomerEntitlement[]>(
      'access.entitlements.list',
      '/v1/access/entitlements/list',
      { customerId },
    ),
  ]);
  const billingPeriod =
    await postUnpriceRuntimeOperation<CurrentBillingPeriodUsageResponse>(
      'analytics.usage.currentBillingPeriod',
      '/v1/analytics/usage/current-billing-period',
      { customer_id: customerId },
    )
      .then(toCustomerBillingPeriod)
      .catch((error) => {
        logUnpriceError('Current billing-period usage is unavailable', error);
        return null;
      });
  const tokenEntitlement = findFeatureEntitlement(
    entitlements,
    unpriceCatalog.features.totalTokens,
  );
  return {
    tokens: toUsageMetric(tokenStatus, tokenEntitlement),
    billingPeriod,
  };
}

async function getProPlanVersionId(): Promise<string> {
  const result = unwrap(
    'planVersions.list',
    await (await getRuntimeClient()).planVersions.list({
      onlyPublished: true,
      onlyLatest: true,
    }),
  );
  const proPlanVersion = result.planVersions.find(
    (planVersion) =>
      planVersion.plan.slug === unpriceCatalog.plans.pro &&
      planVersion.active &&
      !planVersion.archived,
  );

  if (!proPlanVersion) {
    throw new UnpriceRuntimeError(
      'planVersions.list',
      'PRO_PLAN_NOT_FOUND',
      undefined,
      'The Pro plan is not available for upgrade',
    );
  }

  return proPlanVersion.id;
}

export async function upgradeCustomerToPro(customerId: string) {
  const planVersionId = await getProPlanVersionId();

  return postUnpriceRuntimeOperation<CustomerPlanChangeResult>(
    'customers.changePlan',
    '/v1/customers/change-plan',
    {
      customerId,
      planVersionId,
      creditLinePolicy: 'capped',
      creditLineAmountMinor: PRO_MONTHLY_CREDIT_LINE_MINOR,
    },
  );
}

export async function createPaymentMethodSetup({
  customerId,
  paymentProvider,
  successUrl,
  cancelUrl,
}: {
  customerId: string;
  paymentProvider: 'sandbox' | 'square' | 'stripe';
  successUrl: string;
  cancelUrl: string;
}) {
  return unwrap(
    'paymentMethods.create',
    await (await getRuntimeClient()).paymentMethods.create({
      customerId,
      paymentProvider,
      successUrl,
      cancelUrl,
    }),
  );
}

function getChatBudgetWindow(now = new Date()) {
  return {
    key: now.toISOString().slice(0, 10),
    expiresAt: Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    ),
  };
}

export async function startChatBudgetRun({
  customerId,
  chatId,
}: {
  customerId: string;
  chatId: string;
}) {
  const window = getChatBudgetWindow();

  return unwrap(
    'runs.start',
    await (await getRuntimeClient()).runs.start({
      customerId,
      budgetAmountMinor: CHAT_CONVERSATION_BUDGET_MINOR,
      idempotencyKey: `chat:${customerId}:${chatId}:budget:${window.key}`,
      workloadType: 'custom',
      workloadId: chatId,
      expiresAt: window.expiresAt,
    }),
  );
}

export async function endChatBudgetRun({
  runId,
  status,
}: {
  runId: string;
  status: 'completed' | 'failed';
}) {
  return unwrap(
    'runs.end',
    await (await getRuntimeClient()).runs.end({
      runId,
      status,
    }),
  );
}

export async function consumeChatBudgetTokens({
  runId,
  customerId,
  chatId,
  messageId,
  inputTokens,
  outputTokens,
}: {
  runId: string;
  customerId: string;
  chatId: string;
  messageId: string;
  inputTokens: number;
  outputTokens: number;
}) {
  return unwrap(
    'runs.consume',
    await (await getRuntimeClient()).runs.consume({
      runId,
      featureSlug: unpriceCatalog.features.totalTokens,
      eventSlug: unpriceCatalog.events.aiCompletion,
      idempotencyKey: `chat:${customerId}:${chatId}:${messageId}:tokens`,
      properties: {
        total_tokens: Math.max(
          0,
          Math.trunc(inputTokens) + Math.trunc(outputTokens),
        ),
      },
    }),
  );
}

export function logUnpriceError(context: string, error: unknown) {
  if (error instanceof UnpriceRuntimeError) {
    console.error(context, {
      operation: error.operation,
      code: error.code,
      requestId: error.requestId,
      message: error.message,
    });
    return;
  }

  console.error(context, error);
}
