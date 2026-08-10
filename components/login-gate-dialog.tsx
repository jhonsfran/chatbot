'use client';

import { SignInForm } from '@/components/sign-in-form';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function LoginGateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="login-gate">
        <AlertDialogHeader>
          <AlertDialogTitle>Sign in to send a message</AlertDialogTitle>
          <AlertDialogDescription>
            Create an account or sign in to start chatting.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <SignInForm onSuccess={() => onOpenChange(false)} />
        <AlertDialogCancel>Continue browsing</AlertDialogCancel>
      </AlertDialogContent>
    </AlertDialog>
  );
}
