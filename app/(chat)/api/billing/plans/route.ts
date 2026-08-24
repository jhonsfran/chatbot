import { auth, isRegularUser } from '@/app/(auth)/auth';
import { ChatSDKError } from '@/lib/errors';
import { getLatestKnownPlanCatalog } from '@/lib/unprice/plan-catalog';
import { logUnpriceError } from '@/lib/unprice/runtime';

export async function GET() {
  const session = await auth();

  if (!isRegularUser(session)) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  try {
    return Response.json(await getLatestKnownPlanCatalog(), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    logUnpriceError('Failed to load the plan catalog', error);
    return new ChatSDKError('service_unavailable:billing').toResponse();
  }
}
