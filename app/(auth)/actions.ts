'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { compare } from 'bcrypt-ts';

import {
  findOrCreatePendingUser,
  setUserUnpriceCustomerId,
} from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import {
  getApplicationBaseUrl,
  logUnpriceError,
  provisionUnpriceCustomer,
  UnpriceRuntimeError,
} from '@/lib/unprice/runtime';

import { signIn } from './auth';

const authFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export interface LoginActionState {
  status: 'idle' | 'in_progress' | 'success' | 'failed' | 'invalid_data';
}

export const login = async (
  _: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
    });

    await signIn('credentials', {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: 'success' };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: 'invalid_data' };
    }

    return { status: 'failed' };
  }
};

export interface RegisterActionState {
  status:
    | 'idle'
    | 'in_progress'
    | 'success'
    | 'failed'
    | 'provisioning_failed'
    | 'user_exists'
    | 'invalid_data';
}

export const register = async (
  _: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
    });

    const user = await findOrCreatePendingUser({
      id: generateUUID(),
      email: validatedData.email,
      password: validatedData.password,
    });

    if (
      user.unpriceCustomerId ||
      !user.password ||
      !(await compare(validatedData.password, user.password))
    ) {
      return { status: 'user_exists' } as RegisterActionState;
    }
    const requestHeaders = await headers();
    const unpriceCustomerId = await provisionUnpriceCustomer({
      userId: user.id,
      email: validatedData.email,
      applicationBaseUrl: getApplicationBaseUrl(requestHeaders),
    });

    await setUserUnpriceCustomerId({
      id: user.id,
      unpriceCustomerId,
    });
    await signIn('credentials', {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: 'success' };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: 'invalid_data' };
    }

    if (error instanceof UnpriceRuntimeError) {
      logUnpriceError('Failed to provision registered customer', error);
      return { status: 'provisioning_failed' };
    }

    return { status: 'failed' };
  }
};
