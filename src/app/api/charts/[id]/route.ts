// GET /api/charts/:id     load one saved chart
// DELETE /api/charts/:id  delete it
import { chartHandlers } from "../../../../server/chartHandlers";
import { getChartRepository } from "../../../../server/db";
import { currentUser } from "../../../../server/session";

// Charts belong to the signed-in user.
const handlers = chartHandlers(getChartRepository, async () => (await currentUser())?.id ?? null);

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  return handlers.get(request, (await params).id);
}

export async function DELETE(request: Request, { params }: Context) {
  return handlers.remove(request, (await params).id);
}
