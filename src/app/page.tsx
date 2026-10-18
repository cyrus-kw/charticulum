import { redirect } from "next/navigation";
import { SignIn } from "../components/site/AuthForms";
import { DemoChart } from "../components/site/DemoChart";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { currentUser } from "../server/session";

// The front door: what Charticulum is, and signing in. Signed-in visitors
// go straight to their dashboard. It has the same top bar and footer as
// the other site pages, so signing in doesn't feel like arriving somewhere
// else.
export default async function HomePage() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <div className="flex min-h-dvh flex-col bg-page text-ink dark:bg-zinc-950 dark:text-zinc-100">
      <SiteHeader />
      {/* Two columns on wide windows (words left, the wider demo chart
          right, so its cards are full size rather than just codes), with
          their tops lined up, so the heading stays put when Sign in opens
          its form. On narrower windows the demo goes below, and on phones
          it's left out, since it's wider than the screen. */}
      <main className="mx-auto grid w-full max-w-5xl flex-1 content-center items-start gap-12 px-4 py-16 lg:grid-cols-[2fr_3fr]">
        <div className="space-y-6">
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">Chart your curriculum</h1>
            <p className="text-lg text-zinc-600 dark:text-zinc-300">See how it all fits together.</p>
          </div>
          <SignIn showTerminalHint={process.env.NODE_ENV !== "production"} />
        </div>
        <div className="hidden sm:block">
          <DemoChart />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
