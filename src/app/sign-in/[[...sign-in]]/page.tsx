import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

import { AuthShell } from "@/features/auth/components/auth-shell";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function SignInPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your Resonance workspace to keep generating."
    >
      <SignIn
        appearance={{ elements: { rootBox: "w-full", cardBox: "w-full shadow-none" } }}
      />
    </AuthShell>
  );
}
