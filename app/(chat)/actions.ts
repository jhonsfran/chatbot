'use server';

import { generateText, type UIMessage } from 'ai';
import { cookies } from 'next/headers';
import {
  deleteMessagesByChatIdAfterTimestamp,
  getChatById,
  getMessageById,
  getUserById,
  updateChatVisiblityById,
} from '@/lib/db/queries';
import type { VisibilityType } from '@/components/visibility-selector';
import { myProvider } from '@/lib/ai/providers';
import { auth, isRegularUser } from '@/app/(auth)/auth';
import { getFlatEntitlements } from '@/lib/unprice/billing-profile';

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('chat-model', model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  const { text: title } = await generateText({
    model: myProvider.languageModel('title-model'),
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons`,
    prompt: JSON.stringify(message),
  });

  return title;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  const session = await auth();

  if (!isRegularUser(session)) {
    return { success: false, message: 'Sign in to change chat visibility.' };
  }

  const [chat, user] = await Promise.all([
    getChatById({ id: chatId }),
    getUserById(session.user.id),
  ]);

  if (!chat || chat.userId !== session.user.id) {
    return { success: false, message: 'This chat does not belong to you.' };
  }

  if (visibility === 'public') {
    if (!user?.unpriceCustomerId) {
      return { success: false, message: 'Billing setup is still in progress.' };
    }

    const access = await getFlatEntitlements(user.unpriceCustomerId);

    if (!access.canSharePublicChats) {
      return {
        success: false,
        message: 'Public sharing requires an Enterprise plan.',
      };
    }
  }

  await updateChatVisiblityById({ chatId, visibility });
  return { success: true, message: '' };
}
