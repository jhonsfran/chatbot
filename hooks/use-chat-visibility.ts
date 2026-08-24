'use client';

import useSWR, { useSWRConfig } from 'swr';
import { unstable_serialize } from 'swr/infinite';
import { updateChatVisibility } from '@/app/(chat)/actions';
import { getChatHistoryPaginationKey } from '@/components/sidebar-history';
import { toast } from '@/components/toast';
import {
  saveChatVisibilityOptimistically,
  type VisibilityType,
} from '@/lib/ui/chat-visibility';

export function useChatVisibility({
  chatId,
  initialVisibilityType,
}: {
  chatId: string;
  initialVisibilityType: VisibilityType;
}) {
  const { mutate } = useSWRConfig();

  const { data: localVisibility, mutate: setLocalVisibility } = useSWR(
    `${chatId}-visibility`,
    null,
    {
      fallbackData: initialVisibilityType,
    },
  );

  const visibilityType = localVisibility ?? initialVisibilityType;

  const setVisibilityType = async (updatedVisibilityType: VisibilityType) => {
    const previousVisibilityType = visibilityType;
    const result = await saveChatVisibilityOptimistically({
      previous: previousVisibilityType,
      next: updatedVisibilityType,
      setLocal: (value) => setLocalVisibility(value, { revalidate: false }),
      save: () =>
        updateChatVisibility({
          chatId,
          visibility: updatedVisibilityType,
        }),
      refreshHistory: () =>
        mutate(unstable_serialize(getChatHistoryPaginationKey)),
    });

    if (!result.success) {
      toast({ type: 'error', description: result.message });
    }
  };

  return { visibilityType, setVisibilityType };
}
