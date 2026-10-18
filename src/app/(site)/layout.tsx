import type { ReactNode } from "react";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { requireUser } from "../../server/session";

// The "(site)" folder is a route group: the parentheses keep "site" out of
// the address (this is /dashboard, not /site/dashboard). It lets these
// pages share this layout, the top bar, without the planner getting it.
// Every page here needs someone signed in. Each page checks for itself
// too: a layout isn't always re-run when moving between its pages.
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    // A column at least as tall as the window; flex-1 lets the main part
    // grow, so the footer stays at the bottom even on a short page.
    <div className="flex min-h-dvh flex-col bg-page text-ink dark:bg-zinc-950 dark:text-zinc-100">
      <SiteHeader user={{ name: user.name, email: user.email, role: user.role }} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      <SiteFooter />
    </div>
  );
}
