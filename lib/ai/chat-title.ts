import type { UIMessage } from 'ai';

export function getInitialChatTitle(message: UIMessage): string {
  const partText = message.parts
    ?.filter(
      (part): part is Extract<(typeof message.parts)[number], { type: 'text' }> =>
        part.type === 'text',
    )
    .map((part) => part.text)
    .join(' ');
  const contentText =
    typeof message.content === 'string' ? message.content : undefined;
  const normalized = (partText || contentText || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return 'New conversation';
  }

  return normalized.length <= 80
    ? normalized
    : `${normalized.slice(0, 77).trimEnd()}…`;
}
