import 'server-only';

import { Unprice, type ApiError, type ApiResult } from '@unprice/api';
import { unpriceCatalog } from './catalog';
import {
  ChatMessageReservation,
  getChatMessageReservationKey,
} from './chat-reservation';

type HeaderReader = Pick<Headers, 'get'>;

let runtimeClient: Unprice | undefined;

export const CHAT_MAX_OUTPUT_TOKENS = 1_000;
const CHAT_RESERVATION_TTL_MS = 10 * 60 * 1000;
// The sandbox credit lines leave room for several concurrent $1 chat runs.
const FREE_CREDIT_LINE_MINOR = 330;
const PRO_CREDIT_LINE_MINOR = 1_000;

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
    creditLineAmountMinor: FREE_CREDIT_LINE_MINOR,
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

export async function checkArtifactToolsAccess(customerId: string) {
  return unwrap(
    'access.check',
    await (await getRuntimeClient()).access.check({
      customerId,
      featureSlug: unpriceCatalog.features.artifactTools,
    }),
  );
}

export async function checkPublicChatSharingAccess(customerId: string) {
  return unwrap(
    'access.check',
    await (await getRuntimeClient()).access.check({
      customerId,
      featureSlug: unpriceCatalog.features.publicChatSharing,
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

export async function getCustomerSubscription(customerId: string) {
  return unwrap(
    'subscriptions.get',
    await (await getRuntimeClient()).subscriptions.get({ customerId }),
  );
}

export async function listLatestPublishedPlanVersions() {
  return unwrap(
    'planVersions.list',
    await (await getRuntimeClient()).planVersions.list({
      onlyPublished: true,
      onlyLatest: true,
    }),
  );
}

async function getProPlanVersionId(): Promise<string> {
  const result = await listLatestPublishedPlanVersions();
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
  return unwrap(
    'customers.changePlan',
    await (await getRuntimeClient()).customers.changePlan({
      customerId,
      planVersionId,
      creditLinePolicy: 'capped',
      creditLineAmountMinor: PRO_CREDIT_LINE_MINOR,
    }),
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

function getChatMessageBudgetMinor(): number {
  const amount = Number(
    process.env.UNPRICE_CHAT_CONVERSATION_BUDGET_MINOR ?? '100',
  );

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new UnpriceRuntimeError(
      'runs.start',
      'INVALID_CONVERSATION_BUDGET',
      undefined,
      'UNPRICE_CHAT_CONVERSATION_BUDGET_MINOR must be a positive integer',
    );
  }

  return amount;
}

export async function reserveChatMessage({
  customerId,
  chatId,
  messageId,
}: {
  customerId: string;
  chatId: string;
  messageId: string;
}) {
  const client = await getRuntimeClient();
  const sdkReservation = unwrap(
    'reservations.reserve',
    await client.reservations.reserve({
      customerId,
      maximumAmountMinor: getChatMessageBudgetMinor(),
      idempotencyKey: getChatMessageReservationKey({
        customerId,
        chatId,
        messageId,
      }),
      expiresAt: Date.now() + CHAT_RESERVATION_TTL_MS,
    }),
  );

  return new ChatMessageReservation({
    settle: async (totalTokens) => {
      const settlement = unwrap(
        'reservations.settle',
        await sdkReservation.settle({
          featureSlug: unpriceCatalog.features.totalTokens,
          eventSlug: unpriceCatalog.events.aiCompletion,
          id: messageId,
          properties: { total_tokens: totalTokens },
        }),
      );

      return {
        accepted: settlement.accepted || settlement.reason === 'duplicate',
        reason: settlement.reason,
      };
    },
    release: async () => {
      unwrap('reservations.release', await sdkReservation.release());
    },
  });
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
