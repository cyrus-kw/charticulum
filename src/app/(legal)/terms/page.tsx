import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms · Charticulum" };

// Not written yet: a place for the footer's Terms link to lead.
export default function TermsPage() {
  return (
    <section>
      <h1 className="mb-3 text-xl font-semibold">Terms</h1>
      <p className="text-sm text-zinc-500">Coming soon.</p>
    </section>
  );
}
