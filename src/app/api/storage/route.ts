// Tells the browser whether charts can be saved to the database.
import { hasDatabase } from "../../../server/db";

export function GET() {
  return Response.json({ database: hasDatabase() });
}
