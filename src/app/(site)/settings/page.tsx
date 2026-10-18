import type { Metadata } from "next";
import { SettingsDialog } from "../../../components/SettingsDialog";
import { Settings } from "../../../components/site/Settings";
import { requireUser } from "../../../server/session";

export const metadata: Metadata = { title: "Settings · Charticulum" };

// /settings opened directly (a refresh, a new tab, a bookmark). There's no
// page underneath to return to, so it floats over the site's top bar and
// closing it goes to the dashboard. Opened from the account menu, the
// floating version in @modal/(.)settings shows instead.
export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <SettingsDialog closeHref="/dashboard">
      <Settings user={user} />
    </SettingsDialog>
  );
}
