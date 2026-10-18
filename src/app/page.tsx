import { redirect } from "next/navigation";
import { SignIn } from "../components/site/AuthForms";
import { ThemeToggle } from "../components/ThemeToggle";
import { currentUser } from "../server/session";

// The front door: what Charticulum is, and signing in. Signed-in visitors
// go straight to their dashboard.
export default async function HomePage() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <div className="flex min-h-dvh flex-col bg-page text-ink dark:bg-zinc-950 dark:text-zinc-100">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 pb-24 text-center">
        <h1 className="text-4xl font-semibold">Charticulum</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-300">
          Chart your curriculum. Courses are cards in term columns, requisites are arrows, and every school rule is
          checked as you plan.
        </p>
        <SignIn showTerminalHint={process.env.NODE_ENV !== "production"} />
      </main>
    </div>
  );
}
