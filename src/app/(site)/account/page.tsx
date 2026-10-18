import type { Metadata } from "next";
import { signOutAction } from "../../auth/actions";
import { DeleteAccountButton, EmailForm, NameForm } from "../../../components/site/AccountForms";
import { Button } from "../../../components/ui";
import { requireUser } from "../../../server/session";

export const metadata: Metadata = { title: "Account · Charticulum" };

const box = "rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="max-w-xl space-y-8">
      <h1 className="text-xl font-semibold">Account</h1>

      <section className={`${box} space-y-4`}>
        <h2 className="font-medium">Profile</h2>
        <NameForm name={user.name} />
        <EmailForm email={user.email} />
        {user.role === "admin" && <p className="text-xs text-zinc-500">You're an admin: you can add and change schools.</p>}
      </section>

      <section className={`${box} space-y-3`}>
        <h2 className="font-medium">Your data</h2>
        <p className="text-sm text-zinc-500">Every chart you've saved, in one JSON file.</p>
        <a
          href="/api/account/charts"
          download
          className="inline-block rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Download all charts
        </a>
      </section>

      <section className={`${box} space-y-3`}>
        <h2 className="font-medium">Sign out</h2>
        <p className="text-sm text-zinc-500">Signs out this browser. You stay signed in on other devices.</p>
        {/* A form whose action is a server action works even before the
            page's JavaScript has loaded. */}
        <form action={signOutAction}>
          <Button type="submit">Sign out</Button>
        </form>
      </section>

      <section className={`${box} space-y-3`}>
        <h2 className="font-medium text-rose-700 dark:text-rose-400">Delete account</h2>
        <p className="text-sm text-zinc-500">Deletes your account and all your charts. This can&apos;t be undone.</p>
        <DeleteAccountButton />
      </section>
    </div>
  );
}
