import { DeleteAccountButton, EmailForm, NameForm } from "./AccountForms";
import { Panel } from "../ui";

// What's in the Settings panel: your profile, your data, and deleting the
// account. (Sign out is in the account menu, beside the Settings gear.)
export function Settings({ user }: { user: { name: string; email: string; role: string } }) {
  return (
    <>
      <Panel title="Profile">
        <div className="space-y-4">
          <NameForm name={user.name} />
          <EmailForm email={user.email} />
          {user.role === "admin" && (
            <p className="text-xs text-zinc-500">You&apos;re an admin: you can add and change schools.</p>
          )}
        </div>
      </Panel>
      <Panel title="Your data">
        <p className="mb-2 text-sm text-zinc-500">Every chart you&apos;ve saved, in one JSON file.</p>
        <a
          href="/api/account/charts"
          download
          className="inline-block rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Download all charts
        </a>
      </Panel>
      <Panel title="Delete account">
        <p className="mb-2 text-sm text-zinc-500">Deletes your account and all your charts. This can&apos;t be undone.</p>
        <DeleteAccountButton />
      </Panel>
    </>
  );
}
