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

// Companies, Reports and Audit live in the sidebar on desktop (and behind
// search on mobile) — the mobile bar keeps its four daily-destination slots.
// Companies sits beside Brokers: people and the orgs they belong to.
const DESKTOP_NAV = [
  { href: "/", label: "Today", icon: SunIcon },
  { href: "/brokers", label: "Brokers", icon: PeopleIcon },
  { href: "/companies", label: "Companies", icon: CompanyIcon },
  { href: "/deals", label: "Deals", icon: DealsIcon },
  { href: "/loan-book", label: "Loan Book", icon: BookIcon },
  { href: "/reports", label: "Reports", icon: ChartIcon },
  { href: "/audit", label: "Audit", icon: ClockIcon },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r-[0.5px] border-separator px-3 py-5 md:flex">
        <p className="text-headline mb-6 px-3 text-label">Vía OS</p>
        <nav className="flex flex-col gap-0.5" aria-label="Primary">
          {DESKTOP_NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={`pressable flex min-h-11 items-center gap-3 rounded-lg px-3 ${
                isActive(pathname, href) ? "bg-blue/12 font-semibold text-blue" : "text-label"
              }`}
            >
              <Icon className="h-5.5 w-5.5" />
              <span className="text-body">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-3">
          <CommandSearch />
          <form action="/auth/signout" method="post" className="mt-2">
            <button type="submit" className="text-footnote pressable min-h-11 rounded-lg text-label-2">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-[max(env(safe-area-inset-top),0.5rem)] md:px-8 md:pb-12">
          {children}
        </main>
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
