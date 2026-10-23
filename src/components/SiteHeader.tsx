"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { cn, tabClass } from "./ui";
import { UserMenu, type MenuUser } from "./UserMenu";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/schools", label: "Schools" },
];

// The bar across the top of the site's pages (not the planner, which uses
// the whole window). The page you're on is highlighted. The wordmark is
// just a name, not a link. Signed out, the bar has just the
// wordmark and the theme button.
export function SiteHeader({ user }: { user?: MenuUser }) {
  // usePathname: the address being shown, e.g. "/schools".
  const pathname = usePathname();
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      {/* Three columns: the wordmark on the left, the links centered on
          the bar, and the account and theme buttons on the right. The
          outer two share the leftover space equally (1fr each), which is
          what keeps the middle one truly centered. Tighter gaps on phones
          (under Tailwind's "sm", 640px), so everything fits on one line. */}
      <div className="mx-auto grid h-14 max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:gap-6">
        <div className="shrink-0 justify-self-start leading-tight">
          <span className="block text-base font-semibold">Charticulum</span>
          <span className="block text-xs whitespace-nowrap text-zinc-500">Chart your curriculum</span>
        </div>
        {/* self-stretch: the links run the bar's full height, so the
            chosen one's underline sits on the bar's bottom border, like
            the Curriculum AI / Catalog tabs in the planner's side panel.
            To look like those tabs: each link is the same width with its
            name centered, they touch (no gap, so the underlines would
            meet), and pb-3 puts the words 12px above the underline, the
            same gap those tabs have (their py-3). */}
        <nav aria-label="Site" className="flex self-stretch">
          {user &&
            LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={cn(tabClass(pathname === href), "flex w-24 items-end justify-center pb-3 sm:w-40")}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-end gap-3 sm:gap-6">
          {/* key: a new menu (closed) on each page. */}
          {user && <UserMenu key={pathname} user={user} look="circle" />}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
