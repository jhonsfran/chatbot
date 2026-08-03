'use client';

import { forwardRef } from 'react';
import { useRouter } from 'next/navigation';

import { Button, type ButtonProps } from '@/components/ui/button';

type NewChatButtonProps = Omit<ButtonProps, 'onClick'> & {
  onChatAvailable?: () => void;
};

export const NewChatButton = forwardRef<HTMLButtonElement, NewChatButtonProps>(
  function NewChatButton({ onChatAvailable, disabled, ...buttonProps }, ref) {
    const router = useRouter();

    const startNewChat = () => {
      onChatAvailable?.();
      router.push('/');
      router.refresh();
    };

    return (
      <Button
        {...buttonProps}
        ref={ref}
        disabled={disabled}
        onClick={startNewChat}
        type="button"
      />
    );
  },
);
