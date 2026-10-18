import type { Metadata } from "next";
import { ImportSchoolForm, TransferTableForm } from "../../../components/site/SchoolForms";
import { LocalTime } from "../../../components/site/LocalTime";
import { countsByKind } from "../../../components/ui";
import { requireDatabase } from "../../../server/db";
import { requireUser } from "../../../server/session";

export const metadata: Metadata = { title: "Schools · Charticulum" };

const box = "rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";
const link = "text-sm text-sky-700 underline dark:text-sky-400";

// Every school's data, shared by all users. Only admins can import or
// change a school (the server actions check too).
export default async function SchoolsPage() {
  const user = await requireUser();
  const admin = user.role === "admin";
  const { schools: repo } = requireDatabase();
  const summaries = await repo.list();
  const schools = await Promise.all(summaries.map(async (s) => ({ ...s, data: await repo.get(s.id) })));

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-3 text-xl font-semibold">Schools</h1>
        <ul className="space-y-3">
          {schools.map(({ id, name, updatedAt, data }) => (
            <li key={id} className={box}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">{name}</h2>
                <a className={link} href={`/api/schools/${encodeURIComponent(id)}`} download>
                  Export (JSON)
                </a>
              </div>
              {data && (
                <p className="text-xs text-zinc-500">
                  {countsByKind(data.objects)} · {data.templates.length} programs · {data.equivalencyTable.length}{" "}
                  equivalency rows
                  {/* The built-in sample has never been saved (its date is 1970). */}
                  {Date.parse(updatedAt) > 0 && (
                    <>
                      {" "}
                      · updated <LocalTime iso={updatedAt} />
                    </>
                  )}
                </p>
              )}
              {admin && <TransferTableForm schoolId={id} className="mt-3" />}
            </li>
          ))}
        </ul>
      </section>

      {admin && (
        <section>
          <h2 className="mb-3 text-xl font-semibold">Import a school</h2>
          <div className={`${box} space-y-3`}>
            <p className="text-sm text-zinc-500">
              A school with the same id as one above replaces it. Charts pinned to a program version keep working as long
              as the new file still includes that version.
            </p>
            <ImportSchoolForm />
            <div className="flex flex-wrap gap-x-3">
              <a className={link} href="/samples/example-state-university.json" download>
                Sample school (JSON)
              </a>
              <a className={link} href="/samples/transfer-table.csv" download>
                Sample transfer table (CSV)
              </a>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
