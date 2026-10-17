import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Dashboard · Charticulum" };

// A placeholder, so the dashboard link in the Tools sidebar leads
// somewhere. The real dashboard (e.g. all your saved plans at a glance)
// comes once the site's structure is outlined; see "Not built yet" in
// CLAUDE.md.
export default function DashboardPage() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-3 text-ink dark:text-zinc-100">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="text-sm text-zinc-500">Coming soon.</p>
      <Link href="/" className="text-sm text-sky-700 underline dark:text-sky-400">
        Back to your chart
      </Link>
    </main>
  );
}
