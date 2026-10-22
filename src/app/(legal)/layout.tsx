import type { ReactNode } from "react";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { currentUser } from "../../server/session";

// The "(legal)" route group (the parentheses keep it out of the address:
// this is /privacy, not /legal/privacy) holds the pages the footer links
// to. Unlike "(site)", anyone can read them, signed in or not, so this
// layout only asks who's signed in to fill in the top bar.
export default async function LegalLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <div className="flex min-h-dvh flex-col bg-page text-ink dark:bg-zinc-950 dark:text-zinc-100">
      <SiteHeader user={user ? { name: user.name, email: user.email, role: user.role } : undefined} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      <SiteFooter />
    </div>
  );
}
