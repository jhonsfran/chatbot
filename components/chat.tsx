'use client';

import type { Attachment, UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, fetchWithErrorHandlers, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { toast } from './toast';
import { useSearchParams } from 'next/navigation';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { useAutoResume } from '@/hooks/use-auto-resume';
import { ChatSDKError } from '@/lib/errors';
import type { PlanAccessStatus } from '@/lib/ai/models';
import { useUpgradePrompt } from './upgrade-prompt';
import { LoginGateDialog } from './login-gate-dialog';

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  isAuthenticated,
  autoResume,
  availableChatModelIds,
  planAccessStatus,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  isAuthenticated: boolean;
  autoResume: boolean;
  availableChatModelIds: string[];
  planAccessStatus: PlanAccessStatus;
}) {
  const { mutate } = useSWRConfig();
  const { showUpgradePrompt } = useUpgradePrompt();
  const [isLoginGateOpen, setIsLoginGateOpen] = useState(false);
  const requestAuthentication = useCallback(() => {
    setIsLoginGateOpen(true);
  }, []);

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    status,
    stop,
    reload,
    experimental_resume,
    data,
  } = useChat({
    id,
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    fetch: fetchWithErrorHandlers,
    experimental_prepareRequestBody: (body) => ({
      id,
      message: body.messages.at(-1),
      selectedChatModel: initialChatModel,
      selectedVisibilityType: visibilityType,
    }),
    onFinish: async () => {
      await Promise.all([
        mutate(unstable_serialize(getChatHistoryPaginationKey)),
        mutate('/api/billing/usage'),
      ]);
    },
    onError: (error) => {
      if (error instanceof ChatSDKError) {
        if (error.type === 'rate_limit' && error.surface === 'billing') {
          showUpgradePrompt();
          return;
        }

        toast({
          type: 'error',
          description: error.message,
        });
      }
    },
  });

  const searchParams = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);
  const lastProcessedBillingDataIndex = useRef(-1);

  useEffect(() => {
    if (!data?.length) {
      return;
    }

    const newData = data.slice(lastProcessedBillingDataIndex.current + 1);
    lastProcessedBillingDataIndex.current = data.length - 1;

    if (
      newData.some(
        (part) =>
          typeof part === 'object' &&
          part !== null &&
          !Array.isArray(part) &&
          'type' in part &&
          part.type === 'billing-limit-reached',
      )
    ) {
      showUpgradePrompt();
    }
  }, [data, showUpgradePrompt]);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      if (isAuthenticated) {
        append({
          role: 'user',
          content: query,
        });
      } else {
        setInput(query);
        requestAuthentication();
      }

      setHasAppendedQuery(true);

      if (isAuthenticated) {
        window.history.replaceState({}, '', `/chat/${id}`);
      }
    }
  }, [
    query,
    append,
    hasAppendedQuery,
    id,
    isAuthenticated,
    requestAuthentication,
    setInput,
  ]);

  const handleSuggestedAction = useCallback(
    (action: string) => {
      if (!isAuthenticated) {
        setInput(action);
        requestAuthentication();
        return;
      }

      window.history.replaceState({}, '', `/chat/${id}`);
      append({ role: 'user', content: action });
    },
    [append, id, isAuthenticated, requestAuthentication, setInput],
  );

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  useAutoResume({
    autoResume,
    initialMessages,
    experimental_resume,
    data,
    setMessages,
  });

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedModelId={initialChatModel}
          selectedVisibilityType={initialVisibilityType}
          isReadonly={isReadonly}
          availableChatModelIds={availableChatModelIds}
          planAccessStatus={planAccessStatus}
        />

        <Messages
          chatId={id}
          status={status}
          votes={votes}
          messages={messages}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
          isArtifactVisible={isArtifactVisible}
        />

        <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
          {!isReadonly && (
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              handleSubmit={handleSubmit}
              status={status}
              stop={stop}
              isAuthenticated={isAuthenticated}
              onAuthenticationRequired={requestAuthentication}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              setMessages={setMessages}
              selectedVisibilityType={visibilityType}
              onSuggestedAction={handleSuggestedAction}
            />
          )}
        </form>
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        status={status}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
        votes={votes}
        isReadonly={isReadonly}
        isAuthenticated={isAuthenticated}
        onAuthenticationRequired={requestAuthentication}
        onSuggestedAction={handleSuggestedAction}
        selectedVisibilityType={visibilityType}
      />

      <LoginGateDialog
        open={isLoginGateOpen}
        onOpenChange={setIsLoginGateOpen}
      />
    </>
  );
}
