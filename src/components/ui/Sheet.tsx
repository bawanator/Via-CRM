"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

// iOS sheet: slides up from the bottom on mobile, centered card on desktop.
// Header is the standard Cancel / Title / Action bar.
export function Sheet({
  open,
  onOpenChange,
  title,
  trigger,
  action,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  trigger?: ReactNode;
  action?: ReactNode; // right-side header button, e.g. a Save submit button
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 [animation:fade-in_0.2s_ease]" />
        <Dialog.Content
          className="elevated-surface fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-2xl bg-bg-grouped pb-[env(safe-area-inset-bottom)] [animation:sheet-up_0.3s_cubic-bezier(0.32,0.72,0,1)] focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:[animation:pop-in_0.2s_ease]"
        >
          <header className="bar-blur sticky top-0 z-10 flex min-h-13 items-center justify-between gap-2 rounded-t-2xl border-b-[0.5px] border-separator px-4 py-2">
            <Dialog.Close asChild>
              <button className="text-body pressable min-h-11 rounded-lg px-1 text-blue">Cancel</button>
            </Dialog.Close>
            <Dialog.Title className="text-headline absolute left-1/2 -translate-x-1/2 truncate">{title}</Dialog.Title>
            <div className="min-w-11 text-right">{action}</div>
          </header>
          <div className="p-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const SheetClose = Dialog.Close;
