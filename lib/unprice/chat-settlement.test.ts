import assert from 'node:assert/strict';
import test from 'node:test';

import { settleChatTokenUsage } from './chat-settlement';

const input = {
  runId: 'brun_123',
  customerId: 'cus_123',
  chatId: 'chat_123',
  messageId: 'msg_123',
  inputTokens: 120,
  outputTokens: 30,
};

function consumption(accepted: boolean, reason: string, status = 'running') {
  return {
    accepted,
    reason,
    run: { status },
  };
}

test('accepted usage completes without separate evidence', async () => {
  const records: unknown[] = [];
  const result = await settleChatTokenUsage(input, {
    consume: async () => consumption(true, 'accepted'),
    recordEvidence: async (event) => {
      records.push(event);
    },
  });

  assert.deepEqual(result, {
    finalStatus: 'completed',
    limitReached: false,
    runIsRunning: true,
  });
  assert.deepEqual(records, []);
});

test('a duplicate settlement does not record duplicate evidence', async () => {
  let records = 0;
  const result = await settleChatTokenUsage(input, {
    consume: async () => consumption(false, 'duplicate'),
    recordEvidence: async () => {
      records += 1;
    },
  });

  assert.equal(result.finalStatus, 'completed');
  assert.equal(result.limitReached, false);
  assert.equal(records, 0);
});

test('a rejected post-generation settlement records exact usage evidence', async () => {
  const consumed: unknown[] = [];
  const recorded: unknown[] = [];
  const dependencies = {
    consume: async (event: unknown) => {
      consumed.push(event);
      return consumption(false, 'entitlement_denied');
    },
    recordEvidence: async (event: unknown) => {
      recorded.push(event);
    },
  };

  const first = await settleChatTokenUsage(input, dependencies);
  const second = await settleChatTokenUsage(input, dependencies);

  assert.deepEqual(first, {
    finalStatus: 'failed',
    limitReached: true,
    runIsRunning: true,
  });
  assert.deepEqual(second, first);
  assert.deepEqual(consumed[0], {
    runId: 'brun_123',
    idempotencyKey: 'chat:cus_123:chat_123:msg_123:tokens',
    totalTokens: 150,
  });
  assert.deepEqual(recorded[0], {
    customerId: 'cus_123',
    idempotencyKey: 'chat:cus_123:chat_123:msg_123:tokens:evidence',
    totalTokens: 150,
  });
  assert.deepEqual(consumed[1], consumed[0]);
  assert.deepEqual(recorded[1], recorded[0]);
});

test('evidence failure is propagated so the caller closes the run as failed', async () => {
  await assert.rejects(
    settleChatTokenUsage(input, {
      consume: async () => consumption(false, 'insufficient_budget'),
      recordEvidence: async () => {
        throw new Error('record failed');
      },
    }),
    /record failed/,
  );
});

test('invalid provider usage is rejected instead of estimated', async () => {
  await assert.rejects(
    settleChatTokenUsage(
      { ...input, outputTokens: Number.NaN },
      {
        consume: async () => consumption(true, 'accepted'),
        recordEvidence: async () => undefined,
      },
    ),
    /finite token usage/,
  );
});
