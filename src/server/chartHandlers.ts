// What each /api/charts request does. The route files in src/app/api only
// pass requests through to these, so they can be tested without a server.
import { z } from "zod";
import { chartSchema } from "../engine/index";
import { ChartNotFoundError, LOCAL_OWNER, type ChartRepository } from "./chartRepository";

// Reject request bodies over 1 MB; a real chart is a few kilobytes.
const MAX_BODY_BYTES = 1_000_000;

const saveBody = z.object({
  id: z.string().min(1).optional(),
  schoolId: z.string().min(1),
  chart: chartSchema,
});

const error = (status: number, message: string) => Response.json({ error: message }, { status });

export function chartHandlers(
  getRepository: () => ChartRepository | null,
  // Who is asking. One local user for now; sign-in will replace this.
  getOwner: (request: Request) => string = () => LOCAL_OWNER,
) {
  const withRepository = async (run: (repo: ChartRepository) => Promise<Response>) => {
    const repo = getRepository();
    if (!repo) return error(503, "This server has no database configured.");
    try {
      return await run(repo);
    } catch (e) {
      if (e instanceof ChartNotFoundError) return error(404, e.message);
      console.error(e);
      return error(500, "Something went wrong saving your chart.");
    }
  };

  return {
    list: (request: Request) =>
      withRepository(async (repo) => {
        const schoolId = new URL(request.url).searchParams.get("schoolId");
        if (!schoolId) return error(400, "schoolId is required.");
        return Response.json(await repo.list(getOwner(request), schoolId));
      }),

    save: (request: Request) =>
      withRepository(async (repo) => {
        const text = await request.text();
        if (text.length > MAX_BODY_BYTES) return error(413, "That chart is too large.");
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          return error(400, "The request body isn't valid JSON.");
        }
        const parsed = saveBody.safeParse(json);
        if (!parsed.success) return error(400, parsed.error.issues.map((i) => i.message).join("; "));
        const saved = await repo.save(getOwner(request), parsed.data);
        return Response.json(saved, { status: parsed.data.id ? 200 : 201 });
      }),

    get: (request: Request, id: string) =>
      withRepository(async (repo) => {
        const saved = await repo.get(getOwner(request), id);
        return saved ? Response.json(saved) : error(404, `No saved chart with id ${id}.`);
      }),

    remove: (request: Request, id: string) =>
      withRepository(async (repo) => {
        const removed = await repo.remove(getOwner(request), id);
        return removed ? new Response(null, { status: 204 }) : error(404, `No saved chart with id ${id}.`);
      }),
  };
}
