// GET /api/charts?schoolId=...  list saved charts
// POST /api/charts              save a chart (new, or update with an id)
import { chartHandlers } from "../../../server/chartHandlers";
import { getChartRepository } from "../../../server/db";

const handlers = chartHandlers(getChartRepository);

export const GET = handlers.list;
export const POST = handlers.save;
