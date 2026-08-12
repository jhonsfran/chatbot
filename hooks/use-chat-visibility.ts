'use client';

import { useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { unstable_serialize } from 'swr/infinite';
import { updateChatVisibility } from '@/app/(chat)/actions';
import {
  getChatHistoryPaginationKey,
  type ChatHistory,
} from '@/components/sidebar-history';
import type { VisibilityType } from '@/components/visibility-selector';
import { toast } from '@/components/toast';

export function useChatVisibility({
  chatId,
  initialVisibilityType,
}: {
  chatId: string;
  initialVisibilityType: VisibilityType;
}) {
  const { mutate, cache } = useSWRConfig();
  const history: ChatHistory = cache.get('/api/history')?.data;

  const { data: localVisibility, mutate: setLocalVisibility } = useSWR(
    `${chatId}-visibility`,
    null,
    {
      fallbackData: initialVisibilityType,
    },
  );

  const visibilityType = useMemo(() => {
    if (!history) return localVisibility;
    const chat = history.chats.find((chat) => chat.id === chatId);
    if (!chat) return 'private';
    return chat.visibility;
  }, [history, chatId, localVisibility]);

  const setVisibilityType = async (updatedVisibilityType: VisibilityType) => {
    const previousVisibilityType = visibilityType;
    await setLocalVisibility(updatedVisibilityType, { revalidate: false });
    await mutate(unstable_serialize(getChatHistoryPaginationKey));

    const result = await updateChatVisibility({
      chatId: chatId,
      visibility: updatedVisibilityType,
    });

    if (!result.success) {
      await setLocalVisibility(previousVisibilityType, { revalidate: false });
      await mutate(unstable_serialize(getChatHistoryPaginationKey));
      toast({ type: 'error', description: result.message });
    }
  };

  return { visibilityType, setVisibilityType };
}
