"use server";
// Server actions: functions the site's forms call that run on the server.
// "use server" lets a page in the browser call them like ordinary
// functions; Next.js turns each call into a request behind the scenes.
// Anyone can send that request, so each one checks its input itself.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDatabase } from "../server/db";
import { requireAdmin, requireUser } from "../server/session";
import { addTransferTable, createChart, importSchool, type ImportResult, type TransferResult } from "../server/site";

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

// Start a new chart from the dashboard's form, then open it. The program
// select's value is "templateId@version", or empty for a blank plan.
export async function createChartAction(form: FormData): Promise<void> {
  const [templateId, version] = text(form, "program").split("@");
  const user = await requireUser();
  const id = await createChart(requireDatabase(), user.id, {
    schoolId: text(form, "schoolId"),
    templateId: templateId || undefined,
    version: version || undefined,
  });
  // redirect() works by throwing, so nothing after it runs.
  redirect(`/chart/${encodeURIComponent(id)}`);
}

export async function deleteChartAction(id: string): Promise<void> {
  const user = await requireUser();
  await requireDatabase().charts.remove(user.id, id);
  // Tell Next.js the dashboard's list changed, so it shows fresh data.
  revalidatePath("/dashboard");
}

// For useActionState: the first argument is the previous result, which
// these don't need.
export async function importSchoolAction(_previous: ImportResult | null, form: FormData): Promise<ImportResult> {
  await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, errors: ["Choose a JSON file first."] };
  const result = await importSchool(requireDatabase(), await file.text());
  if (result.ok) revalidatePath("/schools");
  return result;
}

export async function addTransferTableAction(
  _previous: TransferResult | null,
  form: FormData,
): Promise<TransferResult> {
  await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, errors: ["Choose a CSV file first."] };
  const result = await addTransferTable(requireDatabase(), text(form, "schoolId"), await file.text());
  if (result.ok) revalidatePath("/schools");
  return result;
}
