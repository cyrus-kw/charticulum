"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "./ui";
import { UserMenu, type MenuUser } from "./UserMenu";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/schools", label: "Schools" },
];

// The bar across the top of the site's pages (not the planner, which uses
// the whole window). The page you're on is highlighted.
export function SiteHeader({ user }: { user: MenuUser }) {
  // usePathname: the address being shown, e.g. "/schools".
  const pathname = usePathname();
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
        <Link href="/dashboard" className="leading-tight">
          <span className="block text-base font-semibold">Charticulum</span>
          <span className="block text-xs text-zinc-500">Chart your curriculum</span>
        </Link>
        <nav aria-label="Site" className="flex flex-1 gap-1">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
                pathname === href && "bg-zinc-100 font-medium text-ink dark:bg-zinc-800 dark:text-zinc-100",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
        {/* key: a new menu (closed) on each page. */}
        <UserMenu key={pathname} user={user} look="circle" />
      </div>
    </header>
  );
}
