import 'server-only';

import { Unprice, type ApiError, type ApiResult } from '@unprice/api';
import { z } from 'zod';
import { unpriceCatalog } from './catalog';

type HeaderReader = Pick<Headers, 'get'>;

const customerPlanChangeResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('changed'),
    subscriptionId: z.string(),
    phaseId: z.string(),
  }),
  z.object({
    status: z.literal('requires_payment_method'),
    paymentProvider: z.enum(['sandbox', 'square', 'stripe']),
    message: z.string(),
  }),
]);

const unpriceErrorPayloadSchema = z.object({
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
      requestId: z.string().optional(),
    })
    .optional(),
});

type CustomerPlanChangeResult = z.infer<typeof customerPlanChangeResultSchema>;

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

async function postUnpriceCompatibilityOperation(
  operation: string,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(
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

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new UnpriceRuntimeError(
      operation,
      'INVALID_RESPONSE',
      undefined,
      'Unprice returned an invalid response',
    );
  }

  if (!response.ok) {
    const parsed = unpriceErrorPayloadSchema.safeParse(payload);

    throw new UnpriceRuntimeError(
      operation,
      parsed.data?.error?.code ?? 'FETCH_ERROR',
      parsed.data?.error?.requestId,
      parsed.data?.error?.message,
    );
  }

  return payload;
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
  const client = await getRuntimeClient();
  const response = await client.customers.signUp({
    name: email.split('@')[0] || email,
    email,
    externalId: userId,
    successUrl: `${applicationBaseUrl}/`,
    cancelUrl: `${applicationBaseUrl}/register`,
    planSlug: unpriceCatalog.plans.free,
    creditLinePolicy: 'capped' as const,
    creditLineAmountMinor: FREE_MONTHLY_CREDIT_LINE_MINOR,
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
  const result = await postUnpriceCompatibilityOperation(
    'customers.changePlan',
    '/v1/customers/change-plan',
    {
      customerId,
      planVersionId,
      creditLinePolicy: 'capped',
      creditLineAmountMinor: PRO_MONTHLY_CREDIT_LINE_MINOR,
    },
  );
  const parsed = customerPlanChangeResultSchema.safeParse(result);

  if (!parsed.success) {
    throw new UnpriceRuntimeError(
      'customers.changePlan',
      'INVALID_RESPONSE',
      undefined,
      'Unprice returned an unexpected plan-change response',
    );
  }

  return parsed.data;
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
  messageId,
}: {
  customerId: string;
  chatId: string;
  messageId: string;
}) {
  const window = getChatBudgetWindow();

  return unwrap(
    'runs.start',
    await (await getRuntimeClient()).runs.start({
      customerId,
      budgetAmountMinor: CHAT_CONVERSATION_BUDGET_MINOR,
      idempotencyKey: `chat:${customerId}:${chatId}:${messageId}:budget:${window.key}`,
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
