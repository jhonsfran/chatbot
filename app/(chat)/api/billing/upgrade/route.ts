import { auth, type UserType } from '@/app/(auth)/auth';
import { getUserById } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import {
  createPaymentMethodSetup,
  getApplicationBaseUrl,
  logUnpriceError,
  UnpriceRuntimeError,
  upgradeCustomerToPro,
} from '@/lib/unprice/runtime';
import { invalidateEntitlementCache } from '@/lib/unprice/billing-profile';

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const userType: UserType = session.user.type;

  if (userType !== 'regular') {
    return new ChatSDKError('forbidden:billing').toResponse();
  }

  const registeredUser = await getUserById(session.user.id);

  if (!registeredUser?.unpriceCustomerId) {
    return new ChatSDKError('service_unavailable:billing').toResponse();
  }

  try {
    const outcome = await upgradeCustomerToPro(
      registeredUser.unpriceCustomerId,
    );

    if (outcome.status === 'changed') {
      invalidateEntitlementCache(registeredUser.unpriceCustomerId);
      return Response.json(outcome);
    }

    const applicationBaseUrl = getApplicationBaseUrl(request.headers);
    const paymentSetup = await createPaymentMethodSetup({
      customerId: registeredUser.unpriceCustomerId,
      paymentProvider: outcome.paymentProvider,
      successUrl: `${applicationBaseUrl}/?upgrade=payment-method-added`,
      cancelUrl: applicationBaseUrl,
    });

    if (!paymentSetup.success) {
      return new ChatSDKError('service_unavailable:billing').toResponse();
    }

    return Response.json({
      status: 'requires_payment_method',
      url: paymentSetup.url,
    });
  } catch (error) {
    if (error instanceof UnpriceRuntimeError) {
      if (error.code === 'FORBIDDEN') {
        return new ChatSDKError('forbidden:account', error.code).toResponse();
      }

      logUnpriceError('Failed to upgrade customer plan', error);
    } else {
      console.error('Failed to upgrade customer plan', error);
    }

    return new ChatSDKError('service_unavailable:billing').toResponse();
  }
}
