"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "../app/auth/actions";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "./ui";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/schools", label: "Schools" },
];

// The bar across the top of the site's pages (not the planner, which uses
// the whole window). The page you're on is highlighted.
export function SiteHeader({ user }: { user: { name: string; email: string } }) {
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
        <UserMenu key={pathname} user={user} />
      </div>
    </header>
  );
}

// The circle with your initial, which opens a small menu. <details> is a
// built-in show/hide element: clicking its <summary> opens and closes it.
function UserMenu({ user }: { user: { name: string; email: string } }) {
  const item = "block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800";
  const ref = useRef<HTMLDetailsElement>(null);
  // Close it when clicking anywhere outside it.
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary
        aria-label="Account menu"
        title={user.name}
        className="flex size-8 cursor-pointer list-none items-center justify-center rounded-full bg-sky-600 text-sm font-semibold text-white select-none hover:bg-sky-700 [&::-webkit-details-marker]:hidden"
      >
        {user.name.trim().charAt(0).toUpperCase() || "?"}
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-56 rounded-md border border-zinc-200 bg-white p-1 shadow-md dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-zinc-500">{user.email}</div>
        </div>
        <Link href="/account" className={item}>
          Account
        </Link>
        <form action={signOutAction}>
          <button type="submit" className={item}>
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
