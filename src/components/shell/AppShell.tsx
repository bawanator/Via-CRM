"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BookIcon,
  BranchIcon,
  ChartIcon,
  ClockIcon,
  DealsIcon,
  MenuIcon,
  PeopleIcon,
  SunIcon,
} from "@/components/ui/icons";
import { CompanyIcon } from "@/components/companies/CompanyIcon";
import { CommandSearch } from "@/components/shell/CommandSearch";

const TABS = [
  { href: "/", label: "Today", icon: SunIcon },
  { href: "/brokers", label: "Brokers", icon: PeopleIcon },
  { href: "/deals", label: "Deals", icon: DealsIcon },
  { href: "/loan-book", label: "Loan Book", icon: BookIcon },
] as const;

// Companies, Reports and Audit live in the rail on desktop (and behind
// search on mobile) — the mobile bar keeps its four daily-destination slots.
// The rail groups daily destinations above the divider, admin below it.
const RAIL_MAIN = [
  { href: "/", label: "Today", icon: SunIcon },
  { href: "/brokers", label: "Brokers", icon: PeopleIcon },
  { href: "/companies", label: "Companies", icon: CompanyIcon },
  { href: "/deals", label: "Deals", icon: DealsIcon },
  { href: "/loan-book", label: "Loan Book", icon: BookIcon },
] as const;
const RAIL_ADMIN = [
  { href: "/reports", label: "Reports", icon: ChartIcon },
  { href: "/audit", label: "Audit", icon: ClockIcon },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// Breadcrumb trail: Vía Private / <section>. Detail pages show their section.
function sectionLabel(pathname: string): string {
  const all = [...RAIL_MAIN, ...RAIL_ADMIN];
  const hit = all.find(({ href }) => href !== "/" && pathname.startsWith(href));
  return hit?.label ?? "Today";
}

function RailLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: (props: React.SVGProps<SVGSVGElement>) => ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`pressable flex h-9 items-center rounded-md ${
        active ? "bg-fill-2 font-medium text-label" : "text-label-2 hover:bg-fill-2 hover:text-label"
      }`}
    >
      {/* Icon sits in a fixed 40px slot so it doesn't shift as the rail expands. */}
      <span className="flex w-10 shrink-0 items-center justify-center">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="text-body whitespace-nowrap pr-3 opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100">
        {label}
      </span>
    </Link>
  );
}

// Mobile hamburger menu: every destination (including the ones the tab pill
// can't fit) plus sign out, in a bottom sheet.
function MobileMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const items = [...RAIL_MAIN, ...RAIL_ADMIN];
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          aria-label="Menu"
          className="pressable flex h-9 w-9 items-center justify-center rounded-lg border border-separator text-label-2"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 [animation:fade-in_0.2s_ease]" />
        <Dialog.Content className="elevated-surface fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-bg pb-[max(env(safe-area-inset-bottom),0.75rem)] [animation:sheet-up_0.3s_cubic-bezier(0.32,0.72,0,1)] focus:outline-none">
          <Dialog.Title className="text-headline px-5 pb-1 pt-4 text-label">Vía OS</Dialog.Title>
          <nav aria-label="Menu" className="px-2 pt-1">
            {items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`pressable flex min-h-11 items-center gap-3 rounded-lg px-3 ${
                    active ? "bg-fill-2 font-medium text-label" : "text-label"
                  }`}
                >
                  <Icon className="h-5 w-5 text-label-2" />
                  <span className="text-body">{label}</span>
                </Link>
              );
            })}
          </nav>
          <form action="/auth/signout" method="post" className="border-t-[0.5px] border-separator px-2 pt-2 mt-2">
            <button type="submit" className="pressable text-body flex min-h-11 w-full items-center rounded-lg px-3 text-red">
              Sign out
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh">
      {/* Mobile breadcrumb header (Supabase mobile style, on white) */}
      <header className="bar-blur sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b-[0.5px] border-separator px-3 pt-[env(safe-area-inset-top)] md:hidden">
        <Link
          href="/"
          aria-label="Home"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-separator"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
          <img src="/icons/logo-mark.svg" alt="" className="h-4 w-auto" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-headline truncate leading-tight text-label">{sectionLabel(pathname)}</p>
          <p className="micro-label flex items-center gap-1">
            <BranchIcon className="h-3 w-3" />
            Production
          </p>
        </div>
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/25 text-headline text-accent-ink"
        >
          H
        </span>
        <MobileMenu pathname={pathname} />
      </header>

      {/* Desktop breadcrumb header */}
      <header className="bar-blur sticky top-0 z-30 hidden h-12 items-center gap-2 border-b-[0.5px] border-separator pl-3 pr-4 md:flex">
        <Link href="/" className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-fill-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
          <img src="/icons/logo-mark.svg" alt="" className="h-4.5 w-auto" />
          <span className="text-headline text-label">Vía Private</span>
        </Link>
        <span className="text-label-3" aria-hidden>
          /
        </span>
        <span className="text-body text-label-2">{sectionLabel(pathname)}</span>
        <span className="micro-label ml-1 rounded-full border border-accent/50 bg-accent/15 px-2 py-0.5 !text-accent-ink">
          Production
        </span>

        <div className="ml-auto flex items-center gap-2">
          <CommandSearch />
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="pressable text-footnote h-8 rounded-md border border-separator px-2.5 text-label-2 hover:text-label"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="md:flex">
        {/* Icon rail: 56px of icons; expands over the content on hover. */}
        <aside className="hidden w-14 shrink-0 md:block">
          <nav
            aria-label="Primary"
            className="group/rail fixed bottom-0 left-0 top-12 z-20 flex w-14 flex-col gap-0.5 overflow-hidden border-r-[0.5px] border-separator bg-bg px-2 py-3 transition-[width,box-shadow] duration-150 ease-out hover:w-56 hover:shadow-[var(--ios-elevated-shadow)]"
          >
            {RAIL_MAIN.map((item) => (
              <RailLink key={item.href} {...item} active={isActive(pathname, item.href)} />
            ))}
            <div className="mx-2 my-2 border-t-[0.5px] border-separator" />
            {RAIL_ADMIN.map((item) => (
              <RailLink key={item.href} {...item} active={isActive(pathname, item.href)} />
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Top safe-area lives in the sticky mobile header now, not here. */}
          <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 md:px-8 md:pb-12 md:pt-6">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile floating pill toolbar (Supabase mobile style). Icon-only:
          labels live in the hamburger menu; aria-labels carry them here. */}
      <nav
        aria-label="Primary"
        className="bar-blur elevated-surface fixed bottom-[max(env(safe-area-inset-bottom),0.75rem)] left-1/2 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-full border-[0.5px] border-separator px-2 py-1.5 md:hidden"
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`pressable flex h-11 w-11 items-center justify-center rounded-full ${
                active ? "bg-fill-2 text-label" : "text-label-2"
              }`}
            >
              <Icon className="h-5.5 w-5.5" strokeWidth={active ? 2.1 : 1.8} />
            </Link>
          );
        })}
        <CommandSearch mobile />
      </nav>
    </div>
  );
}
