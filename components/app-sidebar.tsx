'use client';

import type { User } from 'next-auth';

import { PlusIcon } from '@/components/icons';
import { NewChatButton } from '@/components/new-chat-button';
import { SidebarHistory } from '@/components/sidebar-history';
import { SidebarUserNav } from '@/components/sidebar-user-nav';
import { useUpgradePrompt } from '@/components/upgrade-prompt';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarGroup,
  SidebarGroupContent,
  useSidebar,
} from '@/components/ui/sidebar';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function AppSidebar({ user }: { user: User | undefined }) {
  const { setOpenMobile } = useSidebar();
  const {
    dismissUpgradeReminder,
    isUpgradeCardVisible,
    isUpgrading,
    showUpgradePrompt,
  } = useUpgradePrompt();

  return (
    <Sidebar className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row justify-between items-center">
            <Link
              href="/"
              onClick={() => {
                setOpenMobile(false);
              }}
              className="flex flex-row gap-3 items-center"
            >
              <span className="text-lg font-semibold px-2 hover:bg-muted rounded-md cursor-pointer">
                Unprice Chatbot
              </span>
            </Link>
            <Tooltip>
              <TooltipTrigger asChild>
                <NewChatButton
                  aria-label="New Chat"
                  variant="ghost"
                  className="p-2 h-fit"
                  onChatAvailable={() => {
                    setOpenMobile(false);
                  }}
                >
                  <PlusIcon />
                </NewChatButton>
              </TooltipTrigger>
              <TooltipContent align="end">New Chat</TooltipContent>
            </Tooltip>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {isUpgradeCardVisible && user && (
          <SidebarGroup>
            <SidebarGroupContent>
              <div
                className="overflow-hidden rounded-xl border border-sidebar-foreground/15 bg-sidebar-accent p-3 shadow-sm"
                data-testid="upgrade-card"
              >
                <div className="flex items-center justify-between gap-2 text-[10px] text-sidebar-foreground/55 uppercase tracking-[0.15em]">
                  Usage limit reached
                  <span className="rounded border border-sidebar-foreground/15 px-1.5 py-0.5 text-[9px] text-sidebar-foreground/70">
                    Pro
                  </span>
                </div>
                <p className="mt-3 font-semibold text-sm tracking-tight">
                  More room to think.
                </p>
                <p className="mt-1 text-sidebar-foreground/65 text-xs leading-5">
                  Reasoning access and $10 in monthly token usage.
                </p>
                <Button
                  className="mt-3 w-full"
                  data-testid="upgrade-card-button"
                  disabled={isUpgrading}
                  onClick={showUpgradePrompt}
                  size="sm"
                  type="button"
                >
                  View Pro — $10/month
                </Button>
                <Button
                  className="mt-1.5 w-full text-sidebar-foreground/65 hover:text-sidebar-foreground"
                  data-testid="dismiss-upgrade-button"
                  disabled={isUpgrading}
                  onClick={dismissUpgradeReminder}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Dismiss
                </Button>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarHistory user={user} />
      </SidebarContent>
      <SidebarFooter>{user && <SidebarUserNav user={user} />}</SidebarFooter>
    </Sidebar>
  );
}
