// GET /api/account/charts  download all of the signed-in user's charts as
// one JSON file
import { requireDatabase } from "../../../../server/db";
import { currentUser } from "../../../../server/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to download your charts." }, { status: 401 });
  const { charts } = requireDatabase();
  const summaries = await charts.list(user.id);
  const all = await Promise.all(summaries.map((c) => charts.get(user.id, c.id)));
  return new Response(JSON.stringify(all.filter(Boolean), null, 2) + "\n", {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="charticulum-charts.json"',
    },
  });
}
