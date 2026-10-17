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

// Error codes that mean the server couldn't reach the database at all:
// it isn't running, or the address in DATABASE_URL is wrong. The E-codes
// come from Node's network layer; P1001 is Prisma's "can't reach" code.
const UNREACHABLE = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "P1001"]);
// Prisma's code for "that table doesn't exist": the database is running
// but its migrations were never applied.
const TABLE_MISSING = "P2021";

// Turn an unexpected error into a message the person can act on. `doing`
// names what failed, e.g. "saving your chart".
function failure(e: unknown, doing: string): Response {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === "string" && UNREACHABLE.has(code)) {
    return error(503, `Couldn't reach the database while ${doing}. Is it running? (npm run db:local)`);
  }
  if (code === TABLE_MISSING) {
    return error(503, `The database isn't set up yet, so ${doing} failed. Run npm run db:migrate.`);
  }
  return error(500, `Something went wrong ${doing}.`);
}

export function chartHandlers(
  getRepository: () => ChartRepository | null,
  // Who is asking. One local user for now; sign-in will replace this.
  getOwner: (request: Request) => string = () => LOCAL_OWNER,
) {
  const withRepository = async (doing: string, run: (repo: ChartRepository) => Promise<Response>) => {
    const repo = getRepository();
    if (!repo) return error(503, "This server has no database configured.");
    try {
      return await run(repo);
    } catch (e) {
      if (e instanceof ChartNotFoundError) return error(404, e.message);
      console.error(e);
      return failure(e, doing);
    }
  };

  return {
    list: (request: Request) =>
      withRepository("loading your saved plans", async (repo) => {
        const schoolId = new URL(request.url).searchParams.get("schoolId");
        if (!schoolId) return error(400, "schoolId is required.");
        return Response.json(await repo.list(getOwner(request), schoolId));
      }),

    save: (request: Request) =>
      withRepository("saving your chart", async (repo) => {
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
      withRepository("opening that plan", async (repo) => {
        const saved = await repo.get(getOwner(request), id);
        return saved ? Response.json(saved) : error(404, `No saved chart with id ${id}.`);
      }),

    remove: (request: Request, id: string) =>
      withRepository("deleting that plan", async (repo) => {
        const removed = await repo.remove(getOwner(request), id);
        return removed ? new Response(null, { status: 204 }) : error(404, `No saved chart with id ${id}.`);
      }),
  };
}
