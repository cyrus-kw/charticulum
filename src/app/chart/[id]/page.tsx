import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Planner } from "../../../components/Planner";
import { requireDatabase } from "../../../server/db";
import { requireUser } from "../../../server/session";
import { openChart } from "../../../server/site";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Chart · Charticulum" };

// One saved chart, open in the planner. [id] in the folder name means
// this page answers every /chart/<something> address, with that something
// handed over as params.id.
export default async function ChartPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();
  const opened = await openChart(requireDatabase(), user.id, id);
  // Someone else's chart looks the same as a missing one, so its
  // existence isn't revealed.
  if (!opened) notFound();
  return (
    <Planner
      school={opened.school}
      saved={opened.saved}
      user={{ name: user.name, email: user.email, role: user.role }}
    />
  );
}
