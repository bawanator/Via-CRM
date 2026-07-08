"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BookIcon, ChartIcon, ClockIcon, DealsIcon, PeopleIcon, SunIcon } from "@/components/ui/icons";
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

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh">
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
          <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-[max(env(safe-area-inset-top),0.5rem)] md:px-8 md:pb-12 md:pt-6">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="bar-blur fixed inset-x-0 bottom-0 z-30 flex border-t-[0.5px] border-separator pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 ${
                active ? "text-blue" : "text-label-2"
              }`}
            >
              <Icon className="h-6 w-6" strokeWidth={active ? 2.1 : 1.8} />
              <span className="text-caption-2 font-medium">{label}</span>
            </Link>
          );
        })}
        <div className="flex min-h-12 flex-1 flex-col items-center justify-center pt-1.5 text-label-2">
          <CommandSearch mobile />
        </div>
      </nav>
    </div>
  );
}
