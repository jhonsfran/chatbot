import { auth } from '@/app/(auth)/auth';
import { ChatSDKError } from '@/lib/errors';

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  // Token usage is consumed against the chat's budget when it finishes. A
  // conversation count must never prevent the user from starting another chat.
  return Response.json({ allowed: true });
}
