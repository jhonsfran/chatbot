import { auth, isRegularUser } from '@/app/(auth)/auth';
import { getUserById } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import {
  claimRegisteredUserProvisioning,
  provisionClaimedUser,
} from '@/lib/unprice/provisioning';
import { getApplicationBaseUrl, logUnpriceError } from '@/lib/unprice/runtime';
import { after } from 'next/server';

export async function POST(request: Request) {
  const session = await auth();

  if (!isRegularUser(session)) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const user = await getUserById(session.user.id);

  if (!user) {
    return new ChatSDKError('not_found:database').toResponse();
  }

  if (user.unpriceCustomerId) {
    return new Response(null, { status: 204 });
  }

  const applicationBaseUrl = getApplicationBaseUrl(request.headers);
  const claim = await claimRegisteredUserProvisioning(user.id);

  if (!claim) {
    return Response.json({ status: 'provisioning' }, { status: 202 });
  }

  after(async () => {
    try {
      await provisionClaimedUser({ claim, applicationBaseUrl });
    } catch (error) {
      logUnpriceError('Provisioning retry failed', error);
    }
  });

  return Response.json({ status: 'scheduled' }, { status: 202 });
}
