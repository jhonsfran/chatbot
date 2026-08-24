'use client';

import React, { type ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

type CodeBlockProps = ComponentPropsWithoutRef<'code'> & {
  node?: unknown;
};

export function CodeBlock({ node, className, ...props }: CodeBlockProps) {
  return (
    <code
      className={cn(
        'text-sm [p_&]:rounded-md [p_&]:bg-zinc-100 [p_&]:px-1 [p_&]:py-0.5 dark:[p_&]:bg-zinc-800',
        className,
      )}
      {...props}
    />
  );
}
