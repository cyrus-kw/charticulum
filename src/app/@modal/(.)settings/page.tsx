import { SettingsDialog } from "../../../components/SettingsDialog";
import { Settings } from "../../../components/site/Settings";
import { requireUser } from "../../../server/session";

// Opening /settings from a page of the app (the account menu's gear):
// "(.)settings" catches that move, so instead of leaving the page,
// Settings floats over it. A refresh or a typed address shows
// (site)/settings/page.tsx instead.
export default async function SettingsOverPage() {
  const user = await requireUser();
  return (
    <SettingsDialog>
      <Settings user={user} />
    </SettingsDialog>
  );
}
