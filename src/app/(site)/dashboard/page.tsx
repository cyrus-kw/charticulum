import type { Metadata } from "next";
import Link from "next/link";
import { DeleteChartButton } from "../../../components/site/DeleteChartButton";
import { LocalTime } from "../../../components/site/LocalTime";
import { NewChartForm } from "../../../components/site/NewChartForm";
import { requireDatabase } from "../../../server/db";
import { requireUser } from "../../../server/session";
import { dashboardData } from "../../../server/site";

export const metadata: Metadata = { title: "Dashboard · Charticulum" };

const box = "rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";

// Your charts, and a form to start a new one. This is a server component:
// it runs on the server, reads the database directly, and sends finished
// HTML to the browser.
export default async function DashboardPage() {
  // Reading the sign-in cookie also tells Next.js to build this page for
  // each visit (not once ahead of time).
  const user = await requireUser();
  const { charts, schools } = await dashboardData(requireDatabase(), user.id);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-3 text-xl font-semibold">Start a new chart</h1>
        <div className={`${box} p-4`}>
          <NewChartForm schools={schools} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Your charts</h2>
        {charts.length === 0 ? (
          <p className="text-sm text-zinc-500">No charts yet. Start one above.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {charts.map((c) => (
              <li key={c.id} className={`${box} flex flex-col gap-2 p-4`}>
                <Link href={`/chart/${encodeURIComponent(c.id)}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
                <div className="text-sm text-zinc-500">{c.schoolName}</div>
                <div className="mt-auto flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    Edited <LocalTime iso={c.updatedAt} />
                  </span>
                  <DeleteChartButton id={c.id} name={c.name} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
