import assert from 'node:assert/strict';
import test from 'node:test';
import type { UIMessage } from 'ai';
import { getInitialChatTitle } from './chat-title';

function message(text: string): UIMessage {
  return {
    id: 'message-1',
    role: 'user',
    content: text,
    parts: [{ type: 'text', text }],
  };
}

test('uses normalized user text for the initial title', () => {
  assert.equal(getInitialChatTitle(message('  A   useful title  ')), 'A useful title');
});

test('uses a stable title for an empty message', () => {
  assert.equal(getInitialChatTitle(message('')), 'New conversation');
});

test('limits the initial title to 80 characters', () => {
  const title = getInitialChatTitle(message('a'.repeat(100)));
  assert.equal(title.length, 78);
  assert.ok(title.endsWith('…'));
});
