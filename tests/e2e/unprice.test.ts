import { generateId } from 'ai';
import { getUnixTime } from 'date-fns';
import { getMessageByErrorCode } from '@/lib/errors';
import { generateUUID } from '@/lib/utils';
import { expect, test } from '../fixtures';
import { createAuthenticatedContext } from '../helpers';
import { AuthPage } from '../pages/auth';
import { ChatPage } from '../pages/chat';
import { TEST_PROMPTS } from '../prompts/routes';

test.describe('Unprice monetization', () => {
  test('does not activate an account when customer provisioning fails', async ({
    page,
  }) => {
    const auth = new AuthPage(page);
    const email = `unprice-failure-${getUnixTime(new Date())}@playwright.com`;
    const password = generateId(16);

    await auth.register(email, password);
    await auth.expectToastToContain(
      'We could not set up your plan. Your account is not active; please try again.',
    );

    await auth.login(email, password);
    await auth.expectToastToContain('Invalid credentials!');
  });

  test('retries pending provisioning with the same external id', async ({
    page,
  }) => {
    const auth = new AuthPage(page);
    const email = `unprice-retry-${getUnixTime(new Date())}@playwright.com`;
    const password = generateId(16);

    await auth.register(email, password);
    await auth.expectToastToContain(
      'We could not set up your plan. Your account is not active; please try again.',
    );

    await auth.register(email, password);
    await auth.expectToastToContain('Account created successfully!');
    await page.waitForURL('/');
  });

  test('provisions the Free wallet credit required for chat budgets', async ({
    page,
  }) => {
    const auth = new AuthPage(page);
    const email = `unprice-free-credit-line-${getUnixTime(new Date())}@playwright.com`;
    const password = generateId(16);

    await auth.register(email, password);
    await auth.expectToastToContain('Account created successfully!');
  });

  test('hides a model that the current plan does not include', async ({
    browser,
  }) => {
    const customer = await createAuthenticatedContext({
      browser,
      name: `unprice-free-${getUnixTime(new Date())}`,
    });

    try {
      await customer.page.goto('/');
      await customer.page.getByTestId('model-selector').click();
      await expect(
        customer.page.getByTestId('model-selector-item-chat-model-reasoning'),
      ).toHaveCount(0);
    } finally {
      await customer.context.close();
    }
  });

  test('shows the active plan usage in the sidebar', async ({ browser }) => {
    const customer = await createAuthenticatedContext({
      browser,
      name: `unprice-free-usage-${getUnixTime(new Date())}`,
    });

    try {
      await customer.page.goto('/');

      await expect(customer.page.getByTestId('usage-summary')).toBeVisible();
      await expect(customer.page.getByTestId('usage-summary')).toContainText(
        '0 / 10K tokens',
      );
      await expect(
        customer.page.getByTestId('usage-summary'),
      ).not.toContainText('Chats');
    } finally {
      await customer.context.close();
    }
  });

  test('separates Pro token billing usage from the live quota', async ({
    browser,
  }) => {
    const customer = await createAuthenticatedContext({
      browser,
      name: `unprice-pro-usage-${getUnixTime(new Date())}`,
    });

    try {
      await customer.page.goto('/');

      await expect(customer.page.getByTestId('usage-summary')).toContainText(
        '0 / 1M included',
      );
      await expect(customer.page.getByTestId('usage-summary')).toContainText(
        'Billing period',
      );
    } finally {
      await customer.context.close();
    }
  });

  test('does not block a chat when the legacy chat allowance is exhausted', async ({
    browser,
  }) => {
    const customer = await createAuthenticatedContext({
      browser,
      name: `unprice-exhausted-${getUnixTime(new Date())}`,
    });

    try {
      const response = await customer.request.post('/api/chat', {
        data: {
          id: generateUUID(),
          message: {
            ...TEST_PROMPTS.SKY.MESSAGE,
            id: generateUUID(),
          },
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(response.status()).toBe(200);
    } finally {
      await customer.context.close();
    }
  });

  test('blocks a chat when the token budget is exhausted', async ({
    browser,
  }) => {
    const customer = await createAuthenticatedContext({
      browser,
      name: `unprice-token-exhausted-${getUnixTime(new Date())}`,
    });

    try {
      const response = await customer.request.post('/api/chat', {
        data: {
          id: generateUUID(),
          message: {
            ...TEST_PROMPTS.SKY.MESSAGE,
            id: generateUUID(),
          },
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(response.status()).toBe(429);
      expect(await response.json()).toMatchObject({
        code: 'rate_limit:billing',
        cause: 'LIMIT_EXCEEDED',
      });
    } finally {
      await customer.context.close();
    }
  });

  test('stops a conversation after its budget rejects a response', async ({
    browser,
  }) => {
    const customer = await createAuthenticatedContext({
      browser,
      name: `unprice-conversation-budget-exhausted-${getUnixTime(new Date())}`,
    });
    const chatId = generateUUID();

    try {
      const firstResponse = await customer.request.post('/api/chat', {
        data: {
          id: chatId,
          message: {
            ...TEST_PROMPTS.SKY.MESSAGE,
            id: generateUUID(),
          },
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(firstResponse.status()).toBe(200);
      await firstResponse.body();

      const nextResponse = await customer.request.post('/api/chat', {
        data: {
          id: chatId,
          message: {
            ...TEST_PROMPTS.SKY.MESSAGE,
            id: generateUUID(),
          },
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(nextResponse.status()).toBe(429);
      expect(await nextResponse.json()).toMatchObject({
        code: 'rate_limit:billing',
      });
    } finally {
      await customer.context.close();
    }
  });

  test('denies a conversation whose $0.10 budget is already exhausted', async ({
    browser,
  }) => {
    const customer = await createAuthenticatedContext({
      browser,
      name: `unprice-budget-exhausted-${getUnixTime(new Date())}`,
    });

    try {
      const response = await customer.request.post('/api/chat', {
        data: {
          id: generateUUID(),
          message: {
            ...TEST_PROMPTS.SKY.MESSAGE,
            id: generateUUID(),
          },
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(response.status()).toBe(429);
      expect(await response.json()).toMatchObject({
        code: 'rate_limit:billing',
        message: getMessageByErrorCode('rate_limit:billing'),
      });
    } finally {
      await customer.context.close();
    }
  });

  test('shows an upgrade dialog after a billing limit blocks chat', async ({
    browser,
  }) => {
    const customer = await createAuthenticatedContext({
      browser,
      name: `unprice-budget-exhausted-ui-${getUnixTime(new Date())}`,
    });

    try {
      const chat = new ChatPage(customer.page);
      await chat.createNewChat();
      await chat.sendUserMessage('Please send a response.');
      await chat.isGenerationComplete();

      await expect(customer.page.getByTestId('upgrade-dialog')).toBeVisible();
      await expect(customer.page.getByTestId('upgrade-card')).toBeVisible();
    } finally {
      await customer.context.close();
    }
  });

  test('does not show an upgrade prompt when only the legacy chat allowance is exhausted', async ({
    browser,
  }) => {
    const customer = await createAuthenticatedContext({
      browser,
      name: `unprice-exhausted-new-chat-${getUnixTime(new Date())}`,
    });

    try {
      const availability = await customer.request.get(
        '/api/billing/chat-availability',
      );

      expect(availability.status()).toBe(200);
      expect(await availability.json()).toEqual({ allowed: true });

      await customer.page.getByLabel('New Chat').first().click();

      await expect(
        customer.page.getByTestId('upgrade-dialog'),
      ).not.toBeVisible();
      await expect(customer.page.getByTestId('upgrade-card')).not.toBeVisible();
      await expect(customer.page).toHaveURL(/\/$/);
    } finally {
      await customer.context.close();
    }
  });

  test('upgrades an exhausted customer from the upgrade dialog', async ({
    browser,
  }) => {
    const customer = await createAuthenticatedContext({
      browser,
      name: `unprice-budget-exhausted-upgrade-${getUnixTime(new Date())}`,
    });

    try {
      const chat = new ChatPage(customer.page);
      await chat.sendUserMessage('Please send a response.');
      await chat.isGenerationComplete();

      await customer.page.getByTestId('upgrade-button').click();

      await expect(
        customer.page.getByTestId('upgrade-dialog'),
      ).not.toBeVisible();
      await expect(customer.page.getByTestId('upgrade-card')).not.toBeVisible();
      await expect(customer.page.getByTestId('toast')).toContainText(
        'Pro is active. You can continue chatting.',
      );
    } finally {
      await customer.context.close();
    }
  });

  test('explains when a disabled account cannot use chat', async ({
    browser,
  }) => {
    const customer = await createAuthenticatedContext({
      browser,
      name: `unprice-disabled-${getUnixTime(new Date())}`,
    });

    try {
      const response = await customer.request.post('/api/chat', {
        data: {
          id: generateUUID(),
          message: {
            ...TEST_PROMPTS.SKY.MESSAGE,
            id: generateUUID(),
          },
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(response.status()).toBe(403);
      expect(await response.json()).toMatchObject({
        code: 'forbidden:account',
        message: getMessageByErrorCode('forbidden:account'),
        cause: 'FORBIDDEN',
      });
    } finally {
      await customer.context.close();
    }
  });
});
