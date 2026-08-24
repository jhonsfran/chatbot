import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ChatMessageReservation,
  getChatMessageReservationKey,
  getTotalChatTokens,
} from './chat-reservation';

test('uses one stable reservation key per chat message', () => {
  assert.equal(
    getChatMessageReservationKey({
      customerId: 'cus_1',
      chatId: 'chat_1',
      messageId: 'message_1',
    }),
    'chat:cus_1:chat_1:message:message_1',
  );
});

test('sums token usage across every AI SDK step', () => {
  assert.equal(
    getTotalChatTokens([
      { usage: { promptTokens: 120, completionTokens: 30 } },
      { usage: { promptTokens: 80, completionTokens: 20 } },
    ]),
    250,
  );
});

test('rejects invalid provider usage instead of estimating it', () => {
  assert.throws(
    () =>
      getTotalChatTokens([
        { usage: { promptTokens: 120, completionTokens: Number.NaN } },
      ]),
    /finite token usage/,
  );
});

test('settles once and does not release a completed reservation', async () => {
  const calls: string[] = [];
  const reservation = new ChatMessageReservation({
    settle: async (totalTokens) => {
      calls.push(`settle:${totalTokens}`);
      return { accepted: true, reason: 'accepted' };
    },
    release: async () => {
      calls.push('release');
    },
  });

  await reservation.settle([
    { usage: { promptTokens: 120, completionTokens: 30 } },
  ]);
  await reservation.release();

  assert.deepEqual(calls, ['settle:150']);
});

test('releases a reservation when settlement fails', async () => {
  const calls: string[] = [];
  const reservation = new ChatMessageReservation({
    settle: async () => {
      calls.push('settle');
      throw new Error('settlement failed');
    },
    release: async () => {
      calls.push('release');
    },
  });

  await assert.rejects(
    reservation.settle([
      { usage: { promptTokens: 120, completionTokens: 30 } },
    ]),
    /settlement failed/,
  );
  await reservation.release();

  assert.deepEqual(calls, ['settle', 'release']);
});

test('releases an abandoned reservation once', async () => {
  let releases = 0;
  const reservation = new ChatMessageReservation({
    settle: async () => ({ accepted: true, reason: 'accepted' }),
    release: async () => {
      releases += 1;
    },
  });

  await reservation.release();
  await reservation.release();

  assert.equal(releases, 1);
});
