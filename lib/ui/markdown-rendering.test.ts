import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Markdown } from '@/components/markdown';

test('renders inline code inside a paragraph without a pre element', () => {
  const html = renderToStaticMarkup(
    createElement(Markdown, null, 'Use `const value = 1` here.'),
  );

  assert.match(html, /<p>Use <code[^>]*>const value = 1<\/code> here\.<\/p>/);
  assert.doesNotMatch(html, /<p[^>]*>[\s\S]*<pre/);
});

test('renders fenced code as pre containing code', () => {
  const html = renderToStaticMarkup(
    createElement(Markdown, null, '```ts\nconst value = 1;\n```'),
  );

  assert.match(html, /<pre[^>]*>[\s\S]*<code[^>]*>const value = 1;/);
  assert.doesNotMatch(html, /<p[^>]*>[\s\S]*<pre/);
});
