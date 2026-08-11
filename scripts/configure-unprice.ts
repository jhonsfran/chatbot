import { config as loadEnvironment } from 'dotenv';
import { Unprice, type ApiError, type operations } from '@unprice/api';
import { unpriceCatalog } from '../lib/unprice/catalog';

loadEnvironment({ path: '.env.local' });

type ApplyRequest = NonNullable<
  operations['monetization.apply']['requestBody']
>['content']['application/json'];

const request = {
  config: {
    events: [
      {
        slug: unpriceCatalog.events.aiCompletion,
        name: 'AI completion',
        availableProperties: ['total_tokens'],
      },
    ],
    features: [
      {
        slug: unpriceCatalog.features.reasoningModel,
        title: 'Reasoning model',
        description: 'Access to the advanced reasoning model',
        unitOfMeasure: 'access',
      },
      {
        slug: unpriceCatalog.features.totalTokens,
        title: 'Total tokens',
        description: 'Actual model tokens consumed by a chat response',
        unitOfMeasure: 'token',
      },
    ],
    plans: [
      {
        slug: unpriceCatalog.plans.free,
        title: 'Free',
        description: 'A free plan for trying the AI chatbot',
        defaultPlan: true,
        version: {
          currency: 'USD',
          paymentProvider: 'sandbox',
          billingConfig: {
            name: 'monthly',
            interval: 'month',
            intervalCount: 1,
          },
          features: [
            {
              featureSlug: unpriceCatalog.features.totalTokens,
              featureType: 'usage',
              config: { usageMode: 'unit', price: '0.00001' },
              meterConfig: {
                eventSlug: unpriceCatalog.events.aiCompletion,
                aggregationMethod: 'sum',
                aggregationField: 'total_tokens',
              },
              limit: 10_000,
              resetConfig: { interval: 'day' },
            },
          ],
        },
      },
      {
        slug: unpriceCatalog.plans.pro,
        title: 'Pro',
        description: 'Advanced reasoning and included token usage',
        defaultPlan: false,
        version: {
          currency: 'USD',
          paymentProvider: 'sandbox',
          billingConfig: {
            name: 'monthly',
            interval: 'month',
            intervalCount: 1,
          },
          features: [
            {
              featureSlug: unpriceCatalog.features.reasoningModel,
              featureType: 'flat',
              config: { price: '10.00' },
            },
            {
              featureSlug: unpriceCatalog.features.totalTokens,
              featureType: 'usage',
              config: {
                usageMode: 'tier',
                tierMode: 'graduated',
                tiers: [
                  {
                    firstUnit: 1,
                    lastUnit: 1_000_000,
                    unitPrice: '0.00',
                    flatPrice: '0.00',
                  },
                  {
                    firstUnit: 1_000_001,
                    lastUnit: null,
                    unitPrice: '0.00001',
                    flatPrice: '0.00',
                  },
                ],
              },
              meterConfig: {
                eventSlug: unpriceCatalog.events.aiCompletion,
                aggregationMethod: 'sum',
                aggregationField: 'total_tokens',
              },
            },
          ],
        },
      },
      {
        slug: unpriceCatalog.plans.enterprise,
        title: 'Enterprise',
        description:
          'Advanced reasoning and included token usage for sales-managed customers',
        defaultPlan: false,
        version: {
          currency: 'USD',
          paymentProvider: 'sandbox',
          billingConfig: {
            name: 'monthly',
            interval: 'month',
            intervalCount: 1,
          },
          features: [
            {
              featureSlug: unpriceCatalog.features.reasoningModel,
              featureType: 'flat',
              config: { price: '10.00' },
            },
            {
              featureSlug: unpriceCatalog.features.totalTokens,
              featureType: 'usage',
              config: {
                usageMode: 'tier',
                tierMode: 'graduated',
                tiers: [
                  {
                    firstUnit: 1,
                    lastUnit: 1_000_000,
                    unitPrice: '0.00',
                    flatPrice: '0.00',
                  },
                  {
                    firstUnit: 1_000_001,
                    lastUnit: null,
                    unitPrice: '0.00001',
                    flatPrice: '0.00',
                  },
                ],
              },
              meterConfig: {
                eventSlug: unpriceCatalog.events.aiCompletion,
                aggregationMethod: 'sum',
                aggregationField: 'total_tokens',
              },
            },
          ],
        },
      },
    ],
  },
} satisfies ApplyRequest;

function fail(operation: string, error: ApiError): never {
  console.error(`${operation} failed`, {
    code: error.code,
    message: error.message,
    requestId: error.requestId,
  });
  process.exit(1);
}

async function main() {
  const token = process.env.UNPRICE_CONFIG_TOKEN;

  if (!token) {
    throw new Error('UNPRICE_CONFIG_TOKEN is required');
  }

  const unprice = new Unprice({
    token,
    ...(process.env.UNPRICE_API_URL
      ? { baseUrl: process.env.UNPRICE_API_URL }
      : {}),
  });

  const current = await unprice.monetization.get();

  if (current.error) {
    fail('monetization.get', current.error);
  }

  console.log(
    JSON.stringify(
      {
        current: current.result,
        proposed: request.config,
      },
      null,
      2,
    ),
  );

  if (!process.argv.includes('--apply')) {
    console.log(
      '\nRead-only inspection complete. Review the proposal, then run `pnpm unprice:apply` to create or reuse drafts.',
    );
    return;
  }

  const applied = await unprice.monetization.apply(request);

  if (applied.error) {
    fail('monetization.apply', applied.error);
  }

  console.log(
    JSON.stringify(
      {
        plans: applied.result.plans,
        staleDrafts: applied.result.staleDrafts,
        integrationContract: applied.result.integrationContract,
        reviewUrl: applied.result.reviewUrl,
      },
      null,
      2,
    ),
  );

  console.log(
    '\nSTOP: review the draft in the dashboard and publish it manually before provisioning customers.',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
