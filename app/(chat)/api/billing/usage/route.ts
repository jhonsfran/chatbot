import { auth, type UserType } from '@/app/(auth)/auth';
import { getUserById } from '@/lib/db/queries';
import {
  getCustomerUsageSummary,
  logUnpriceError,
  UnpriceRuntimeError,
} from '@/lib/unprice/runtime';

export async function GET() {
  const session = await auth();

  if (!session?.user || (session.user.type as UserType) !== 'regular') {
    return Response.json({ available: false });
  }

  const registeredUser = await getUserById(session.user.id);

  if (!registeredUser?.unpriceCustomerId) {
    return Response.json({ available: false });
  }

  try {
    const usage = await getCustomerUsageSummary(
      registeredUser.unpriceCustomerId,
    );

    return Response.json({ available: true, ...usage });
  } catch (error) {
    if (error instanceof UnpriceRuntimeError) {
      logUnpriceError('Failed to load customer usage', error);
    } else {
      console.error('Failed to load customer usage', error);
    }

    // Usage is informational. A transient reporting failure must not affect
    // chat or the billing enforcement path.
    return Response.json({ available: false });
  }
}
