import { cookies } from 'next/headers';

import { Chat } from '@/components/chat';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { generateUUID } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { auth } from '../(auth)/auth';
import { redirect } from 'next/navigation';
import { getModelAvailability } from '@/lib/ai/model-access';

export default async function Page() {
  const session = await auth();

  if (!session) {
    redirect('/api/auth/guest');
  }

  const id = generateUUID();

  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get('chat-model');
  const modelAvailability = await getModelAvailability({
    userId: session.user.id,
    userType: session.user.type,
  });
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
        autoResume={false}
        availableChatModelIds={modelAvailability.availableChatModelIds}
        planAccessStatus={modelAvailability.planAccessStatus}
      />
      <DataStreamHandler id={id} />
    </>
  );
}
