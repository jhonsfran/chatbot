import { cookies } from 'next/headers';

import { Chat } from '@/components/chat';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { generateUUID } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { auth, isRegularUser } from '../(auth)/auth';
import { getModelAvailability } from '@/lib/ai/model-access';

export default async function Page() {
  const session = await auth();
  const isAuthenticated = isRegularUser(session);

  const id = generateUUID();

  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get('chat-model');
  const modelAvailability =
    isAuthenticated && session
      ? await getModelAvailability({
          userId: session.user.id,
        })
      : {
          availableChatModelIds: [DEFAULT_CHAT_MODEL],
          planAccessStatus: 'ready' as const,
        };
  const initialChatModel = modelAvailability.availableChatModelIds.includes(
    modelIdFromCookie?.value ?? '',
  )
    ? (modelIdFromCookie?.value ?? DEFAULT_CHAT_MODEL)
    : DEFAULT_CHAT_MODEL;

  return (
    <>
      <Chat
        key={id}
        id={id}
        initialMessages={[]}
        initialChatModel={initialChatModel}
        initialVisibilityType="private"
        isReadonly={false}
        isAuthenticated={isAuthenticated}
        autoResume={false}
        availableChatModelIds={modelAvailability.availableChatModelIds}
        planAccessStatus={modelAvailability.planAccessStatus}
      />
      <DataStreamHandler id={id} />
    </>
  );
}
