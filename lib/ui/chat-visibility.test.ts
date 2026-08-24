import assert from 'node:assert/strict';
import test from 'node:test';

import { saveChatVisibilityOptimistically } from './chat-visibility';

test('keeps the optimistic visibility and refreshes history after success', async () => {
  const events: string[] = [];

  const result = await saveChatVisibilityOptimistically({
    previous: 'private',
    next: 'public',
    setLocal: async (value) => {
      events.push(`local:${value}`);
    },
    save: async () => ({ success: true, message: '' }),
    refreshHistory: async () => {
      events.push('history');
    },
  });

  assert.deepEqual(result, { success: true, message: '' });
  assert.deepEqual(events, ['local:public', 'history']);
});

test('rolls the local visibility back before refreshing after failure', async () => {
  const events: string[] = [];

  const result = await saveChatVisibilityOptimistically({
    previous: 'private',
    next: 'public',
    setLocal: async (value) => {
      events.push(`local:${value}`);
    },
    save: async () => ({ success: false, message: 'denied' }),
    refreshHistory: async () => {
      events.push('history');
    },
  });

  assert.deepEqual(result, { success: false, message: 'denied' });
  assert.deepEqual(events, ['local:public', 'local:private', 'history']);
});
