'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { login, type LoginActionState } from '@/app/(auth)/actions';
import { toast } from '@/components/toast';
import { AuthForm } from '@/components/auth-form';
import { SubmitButton } from '@/components/submit-button';

export function SignInForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isSuccessful, setIsSuccessful] = useState(false);
  const hasCompletedAuthentication = useRef(false);
  const { update: updateSession } = useSession();
  const [state, formAction] = useActionState<LoginActionState, FormData>(
    login,
    { status: 'idle' },
  );

  useEffect(() => {
    if (state.status === 'failed') {
      toast({ type: 'error', description: 'Invalid credentials!' });
      return;
    }

    if (state.status === 'invalid_data') {
      toast({
        type: 'error',
        description: 'Failed validating your submission!',
      });
      return;
    }

    if (state.status !== 'success' || hasCompletedAuthentication.current) {
      return;
    }

    hasCompletedAuthentication.current = true;
    setIsSuccessful(true);
    void updateSession().finally(() => {
      onSuccess?.();

      if (onSuccess) {
        router.refresh();
      } else {
        router.replace('/');
      }
    });
  }, [onSuccess, router, state.status, updateSession]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get('email') as string);
    formAction(formData);
  };

  return (
    <AuthForm action={handleSubmit} defaultEmail={email}>
      <SubmitButton isSuccessful={isSuccessful}>Sign in</SubmitButton>
      <p className="text-center text-sm text-gray-600 mt-4 dark:text-zinc-400">
        {"Don't have an account? "}
        <Link
          href="/register"
          className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
        >
          Sign up
        </Link>
        {' for free.'}
      </p>
    </AuthForm>
  );
}
