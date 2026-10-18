import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "../../components/site/AuthCard";
import { SignInForm } from "../../components/site/AuthForms";
import { currentUser } from "../../server/session";

export const metadata: Metadata = { title: "Sign in · Charticulum" };

export default async function SignInPage() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <AuthCard title="Sign in">
      <SignInForm showTerminalHint={process.env.NODE_ENV !== "production"} />
    </AuthCard>
  );
}
