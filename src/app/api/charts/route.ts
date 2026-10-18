// GET /api/charts?schoolId=...  list saved charts
// POST /api/charts              save a chart (new, or update with an id)
import { chartHandlers } from "../../../server/chartHandlers";
import { getChartRepository } from "../../../server/db";
import { currentUser } from "../../../server/session";

// Charts belong to the signed-in user.
const handlers = chartHandlers(getChartRepository, async () => (await currentUser())?.id ?? null);

export const GET = handlers.list;
export const POST = handlers.save;
