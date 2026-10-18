// GET /api/schools/:id  download a school's data as a JSON file
import { getSchoolRepository } from "../../../../server/db";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const repo = getSchoolRepository();
  if (!repo) return Response.json({ error: "This server has no database configured." }, { status: 503 });
  const data = await repo.get(id);
  if (!data) return Response.json({ error: `No school with id ${id}.` }, { status: 404 });
  return new Response(JSON.stringify(data, null, 2) + "\n", {
    headers: {
      "content-type": "application/json",
      // "attachment" makes the browser save the file instead of showing it.
      "content-disposition": `attachment; filename="${id.replace(/[^\w.-]/g, "_")}.json"`,
    },
  });
}
