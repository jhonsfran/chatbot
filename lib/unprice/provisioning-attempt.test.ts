import assert from 'node:assert/strict';
import test from 'node:test';

import { runProvisioningAttempt } from './provisioning-attempt';

const claim = {
  attemptId: 'attempt_1',
  user: { id: 'user_1', email: 'person@example.com' },
};

test('completes only the provisioning attempt that owns the claim', async () => {
  const completed: unknown[] = [];
  const result = await runProvisioningAttempt(
    { claim, applicationBaseUrl: 'https://chat.example.com' },
    {
      provisionCustomer: async () => 'customer_1',
      complete: async (input) => {
        completed.push(input);
        return true;
      },
      fail: async () => undefined,
    },
  );

  assert.equal(result, true);
  assert.deepEqual(completed, [
    {
      id: 'user_1',
      attemptId: 'attempt_1',
      unpriceCustomerId: 'customer_1',
    },
  ]);
});

test('fails only the provisioning attempt that owns the claim', async () => {
  const failures: unknown[] = [];

  await assert.rejects(
    runProvisioningAttempt(
      { claim, applicationBaseUrl: 'https://chat.example.com' },
      {
        provisionCustomer: async () => {
          throw new Error('remote failure');
        },
        complete: async () => true,
        fail: async (input) => {
          failures.push(input);
        },
      },
    ),
    /remote failure/,
  );

  assert.deepEqual(failures, [
    {
      id: 'user_1',
      attemptId: 'attempt_1',
      message: 'Billing setup did not finish. Retry from the usage card.',
    },
  ]);
});
