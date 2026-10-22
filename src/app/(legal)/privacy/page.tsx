import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · Charticulum" };

// Not written yet: a place for the footer's Privacy link to lead.
export default function PrivacyPage() {
  return (
    <section>
      <h1 className="mb-3 text-xl font-semibold">Privacy</h1>
      <p className="text-sm text-zinc-500">Coming soon.</p>
    </section>
  );
}
