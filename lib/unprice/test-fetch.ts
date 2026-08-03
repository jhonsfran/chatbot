import { unpriceCatalog } from './catalog';

const CHAT_CONVERSATION_BUDGET_MINOR = 10;
const FREE_MONTHLY_CREDIT_LINE_MINOR = 330;
const PRO_MONTHLY_CREDIT_LINE_MINOR = 1_000;
const failedSignupExternalIds = new Set<string>();
const budgetRunCustomers = new Map<string, string>();
const activeBudgetReservations = new Map<string, number>();
const budgetRunIdsByIdempotencyKey = new Map<string, string>();
const budgetRuns = new Map<
  string,
  {
    runId: string;
    status: 'running' | 'completed' | 'canceled' | 'failed';
    customerId: string;
    currency: string;
    workloadType: string | null;
    workloadId: string | null;
    budgetAmountMinor: number;
    consumedAmountMinor: number;
    remainingAmountMinor: number;
  }
>();

function provisioningFailure() {
  return Response.json(
    {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Simulated customer provisioning failure',
        docs: 'https://unprice.dev/docs',
        requestId: 'req_test_signup_failure',
      },
    },
    { status: 500 },
  );
}

export async function testFetch(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const body = (await request.json()) as Record<string, unknown>;

  if (path === '/v1/customers/sign-up') {
    const email = String(body.email);
    const externalId = String(body.externalId);

    if (
      email.includes('unprice-retry') &&
      !failedSignupExternalIds.has(externalId)
    ) {
      failedSignupExternalIds.add(externalId);
      return provisioningFailure();
    }

    if (email.includes('unprice-failure')) {
      return provisioningFailure();
    }

    if (
      email.includes('unprice-free-credit-line') &&
      (body.planSlug !== unpriceCatalog.plans.free ||
        body.creditLinePolicy !== 'capped' ||
        body.creditLineAmountMinor !== FREE_MONTHLY_CREDIT_LINE_MINOR)
    ) {
      return Response.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Free signup must provision its monthly run-budget credit',
            docs: 'https://unprice.dev/docs',
            requestId: 'req_test_free_credit_line',
          },
        },
        { status: 400 },
      );
    }

    const scenario = email.includes('unprice-free')
      ? 'free'
      : email.includes('unprice-conversation-budget-exhausted')
        ? 'conversation_budget_exhausted'
        : email.includes('unprice-budget-exhausted')
          ? 'budget_exhausted'
          : email.includes('unprice-token-exhausted')
            ? 'token_exhausted'
            : email.includes('unprice-exhausted')
              ? 'exhausted'
              : email.includes('unprice-disabled')
                ? 'disabled'
                : 'allowed';

    return Response.json({
      success: true,
      url: body.successUrl,
      customerId: `cus_test_${scenario}_${externalId}`,
    });
  }

  if (path === '/v1/access/check') {
    const customerId = String(body.customerId);
    const featureSlug = String(body.featureSlug);
    const isReasoningModel =
      featureSlug === unpriceCatalog.features.reasoningModel;
    const isTotalTokens = featureSlug === unpriceCatalog.features.totalTokens;
    const allowed = isTotalTokens
      ? !customerId.includes('_token_exhausted_')
      : isReasoningModel
        ? !customerId.includes('_free_')
        : true;
    const isFreePlan = customerId.includes('_free_');
    const limit =
      featureSlug === unpriceCatalog.features.totalTokens
        ? isFreePlan
          ? 10_000
          : null
        : undefined;

    return Response.json({
      allowed,
      featureSlug,
      ...(limit !== undefined ? { limit, usage: 0 } : {}),
      ...(limit !== undefined
        ? {
            quotaWindow: {
              periodKey: 'day:1774051200000',
              startAt: 1_774_051_200_000,
              endAt: 1_774_137_600_000,
            },
          }
        : {}),
      ...(!allowed
        ? {
            rejectionReason: isTotalTokens
              ? 'LIMIT_EXCEEDED'
              : 'NO_MATCHING_ENTITLEMENT',
          }
        : {}),
    });
  }

  if (path === '/v1/access/entitlements/list') {
    const isFreePlan = String(body.customerId).includes('_free_');

    return Response.json([
      {
        featurePlanVersion: {
          feature: { slug: unpriceCatalog.features.totalTokens },
          limit: isFreePlan ? 10_000 : null,
          resetConfig: { resetInterval: isFreePlan ? 'day' : 'month' },
          ...(!isFreePlan
            ? {
                config: {
                  tiers: [
                    {
                      lastUnit: 1_000_000,
                      unitPrice: { dinero: { amount: 0 } },
                    },
                  ],
                },
              }
            : {}),
        },
      },
    ]);
  }

  if (path === '/v1/analytics/usage/current-billing-period') {
    const isFreePlan = String(body.customer_id).includes('_free_');

    return Response.json({
      billing_periods: isFreePlan
        ? []
        : [
            {
              billing_period_id: 'bp_test_current',
              cycle_start_at: 1_774_051_200_000,
              cycle_end_at: 1_776_643_200_000,
              usage: [
                {
                  feature_slug: unpriceCatalog.features.totalTokens,
                  usage: 0,
                  spending: {
                    amount: '0',
                    currency: 'USD',
                    display_amount: '$0.00',
                  },
                },
              ],
            },
          ],
    });
  }

  if (path === '/v1/plan-versions/list') {
    return Response.json({
      planVersions: [
        {
          id: 'pv_test_pro',
          active: true,
          archived: false,
          plan: { slug: unpriceCatalog.plans.pro },
        },
      ],
    });
  }

  if (path === '/v1/customers/change-plan') {
    if (
      body.creditLinePolicy !== 'capped' ||
      body.creditLineAmountMinor !== PRO_MONTHLY_CREDIT_LINE_MINOR
    ) {
      return Response.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Pro upgrades must preserve their $10 monthly run budget',
            docs: 'https://unprice.dev/docs',
            requestId: 'req_test_pro_credit_line',
          },
        },
        { status: 400 },
      );
    }

    return Response.json({
      status: 'changed',
      subscriptionId: `sub_test_${body.customerId}`,
      phaseId: 'phase_test_pro',
    });
  }

  if (path === '/v1/runs/start') {
    const customerId = String(body.customerId);

    if (customerId.includes('_disabled_')) {
      return Response.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Your account has been disabled. Please contact support.',
            docs: 'https://unprice.dev/docs',
            requestId: 'req_test_customer_disabled',
          },
        },
        { status: 403 },
      );
    }

    const idempotencyKey = String(body.idempotencyKey);
    const existingRunId = budgetRunIdsByIdempotencyKey.get(idempotencyKey);

    if (existingRunId) {
      return Response.json(budgetRuns.get(existingRunId));
    }

    const reservationCount = activeBudgetReservations.get(customerId) ?? 0;
    const budgetExceeded =
      customerId.includes('_budget_exhausted_') ||
      (customerId.includes('_exhausted_') && reservationCount > 0);
    const budgetAmountMinor = Number(body.budgetAmountMinor);
    const runId = `brun_test_${body.workloadId}`;

    if (!budgetExceeded) {
      budgetRunCustomers.set(runId, customerId);
      activeBudgetReservations.set(customerId, reservationCount + 1);

      const run = {
        runId,
        status: 'running' as const,
        customerId,
        currency: 'USD',
        workloadType: String(body.workloadType ?? 'custom'),
        workloadId: String(body.workloadId ?? ''),
        budgetAmountMinor,
        consumedAmountMinor: 0,
        remainingAmountMinor: budgetAmountMinor,
      };

      budgetRunIdsByIdempotencyKey.set(idempotencyKey, runId);
      budgetRuns.set(runId, run);

      return Response.json(run);
    }

    return Response.json({
      runId,
      status: budgetExceeded ? 'budget_exceeded' : 'running',
      customerId,
      currency: 'USD',
      workloadType: body.workloadType ?? null,
      workloadId: body.workloadId ?? null,
      traceId: null,
      parentRunId: null,
      budgetAmountMinor,
      consumedAmountMinor: budgetExceeded ? budgetAmountMinor : 0,
      remainingAmountMinor: budgetExceeded ? 0 : budgetAmountMinor,
    });
  }

  if (path.startsWith('/v1/runs/consume/')) {
    const runId = path.split('/').at(-1) ?? '';
    const run = budgetRuns.get(runId);

    if (run?.customerId.includes('_conversation_budget_exhausted_')) {
      run.consumedAmountMinor = run.budgetAmountMinor;
      run.remainingAmountMinor = 0;

      return Response.json({
        accepted: false,
        reason: 'insufficient_budget',
        run,
      });
    }

    if (run) {
      run.consumedAmountMinor = Math.min(run.budgetAmountMinor, 1);
      run.remainingAmountMinor = Math.max(
        0,
        run.budgetAmountMinor - run.consumedAmountMinor,
      );
    }

    return Response.json({
      accepted: true,
      reason: 'accepted',
      run: {
        ...(run ?? {
          runId,
          status: 'running',
          customerId: 'cus_test_allowed',
          currency: 'USD',
          workloadType: 'custom',
          workloadId: null,
          budgetAmountMinor: CHAT_CONVERSATION_BUDGET_MINOR,
          consumedAmountMinor: 1,
          remainingAmountMinor: CHAT_CONVERSATION_BUDGET_MINOR - 1,
        }),
        traceId: null,
        parentRunId: null,
      },
    });
  }

  if (path.startsWith('/v1/runs/end/')) {
    const runId = path.split('/').at(-1) ?? '';
    const customerId = budgetRunCustomers.get(runId);
    const run = budgetRuns.get(runId);

    if (customerId) {
      const reservationCount = activeBudgetReservations.get(customerId) ?? 0;
      activeBudgetReservations.set(
        customerId,
        Math.max(0, reservationCount - 1),
      );
      budgetRunCustomers.delete(runId);
    }

    if (run) {
      run.status = body.status as 'completed' | 'canceled' | 'failed';
      run.remainingAmountMinor = 0;
      return Response.json(run);
    }

    return Response.json({
      runId,
      status: body.status ?? 'canceled',
      customerId: 'cus_test_allowed',
      currency: 'USD',
      workloadType: 'custom',
      workloadId: null,
      traceId: null,
      parentRunId: null,
      budgetAmountMinor: CHAT_CONVERSATION_BUDGET_MINOR,
      consumedAmountMinor: 0,
      remainingAmountMinor: 0,
    });
  }

  return Response.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: `Unhandled Unprice test route: ${path}`,
        docs: 'https://unprice.dev/docs',
        requestId: 'req_test',
      },
    },
    { status: 404 },
  );
}
