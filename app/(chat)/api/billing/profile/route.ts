import { auth, isRegularUser } from '@/app/(auth)/auth';
import { getUserById } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { getBillingProfile } from '@/lib/unprice/billing-profile';
import { logUnpriceError } from '@/lib/unprice/runtime';

export async function GET() {
  const session = await auth();

  if (!isRegularUser(session)) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const user = await getUserById(session.user.id);

  if (!user) {
    return new ChatSDKError('not_found:database').toResponse();
  }

  try {
    const profile = await getBillingProfile(user);

    return Response.json(profile, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    logUnpriceError('Failed to load billing profile', error);
    return new ChatSDKError('service_unavailable:billing').toResponse();
  }
}
