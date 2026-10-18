import type { ReactNode } from "react";
import { ThemeToggle } from "../ThemeToggle";

// The small centered box the sign-in pages use.
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-page text-ink dark:bg-zinc-950 dark:text-zinc-100">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pt-[12vh]">
        <div className="w-full max-w-sm rounded-md border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-1 text-sm font-semibold text-zinc-500">Charticulum</p>
          <h1 className="mb-4 text-xl font-semibold">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
