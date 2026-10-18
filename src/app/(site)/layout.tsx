import type { ReactNode } from "react";
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
    <div className="min-h-dvh bg-page text-ink dark:bg-zinc-950 dark:text-zinc-100">
      <SiteHeader user={{ name: user.name, email: user.email }} />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
