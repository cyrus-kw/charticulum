// GET /api/schools/:schoolId/objects/:objectId   one object's description
//
// The planner page leaves descriptions out of the school it sends (they
// can add up to megabytes), so Selected asks for one here when a course
// is selected.
import { requireDatabase } from "../../../../../../server/db";
import { currentUser } from "../../../../../../server/session";
import { objectDescription } from "../../../../../../server/site";

type Context = { params: Promise<{ schoolId: string; objectId: string }> };

export async function GET(_request: Request, { params }: Context) {
  // Schools are shared, but like every page past the home page, only for
  // people who are signed in.
  if (!(await currentUser())) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { schoolId, objectId } = await params;
  const description = await objectDescription(requireDatabase(), schoolId, objectId);
  return Response.json({ description });
}
