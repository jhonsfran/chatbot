'use client';

import { CheckCircleFillIcon, SparklesIcon } from '@/components/icons';
import { useUpgradePrompt } from '@/components/upgrade-prompt';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

const proBenefits = [
  'No daily chat cap',
  'Reasoning model access',
  '$10 monthly token allowance',
];

export function UpgradeDialog() {
  const { hideUpgradePrompt, isUpgradePromptOpen, isUpgrading, startUpgrade } =
    useUpgradePrompt();

  return (
    <AlertDialog
      open={isUpgradePromptOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          hideUpgradePrompt();
        }
      }}
    >
      <AlertDialogContent
        className="gap-0 overflow-hidden border-border/90 p-0 sm:max-w-md"
        data-testid="upgrade-dialog"
      >
        <AlertDialogHeader className="border-b px-5 pt-5 pb-4 text-left">
          <div className="mb-4 flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.16em]">
            <span className="flex size-7 items-center justify-center rounded-md border bg-muted text-foreground">
              <SparklesIcon size={15} />
            </span>
            Usage allowance reached
          </div>
          <AlertDialogTitle className="max-w-sm text-2xl tracking-tight">
            Keep the conversation moving.
          </AlertDialogTitle>
          <AlertDialogDescription className="max-w-sm pt-1 text-pretty leading-6">
            You’ve reached your current plan’s usage allowance. Pro gives you
            more room to continue without waiting for a reset.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="p-5">
          <div className="rounded-lg border bg-muted/35 p-4">
            <div className="flex items-start justify-between gap-4 border-b pb-3">
              <div>
                <p className="font-semibold text-base">Pro</p>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  For uninterrupted daily work
                </p>
              </div>
              <p className="whitespace-nowrap font-semibold text-sm">
                $10{' '}
                <span className="font-normal text-muted-foreground">
                  / month
                </span>
              </p>
            </div>
            <ul className="mt-3 space-y-2" aria-label="Pro plan includes">
              {proBenefits.map((benefit) => (
                <li className="flex items-center gap-2 text-sm" key={benefit}>
                  <CheckCircleFillIcon size={15} />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <AlertDialogFooter className="border-t bg-muted/20 px-5 py-4 sm:justify-between sm:space-x-0">
          <AlertDialogCancel
            className="mt-0 border-0 bg-transparent px-2 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
            data-testid="upgrade-dialog-dismiss"
            disabled={isUpgrading}
          >
            Keep Free plan
          </AlertDialogCancel>
          <Button
            data-testid="upgrade-button"
            disabled={isUpgrading}
            onClick={startUpgrade}
            type="button"
          >
            {isUpgrading ? 'Starting upgrade…' : 'Upgrade to Pro — $10/month'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
