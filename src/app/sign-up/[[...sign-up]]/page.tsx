import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

import { AuthShell } from "@/features/auth/components/auth-shell";

export const metadata: Metadata = {
  title: "Create an account",
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="Start building voices"
      subtitle="Create your Resonance account. You will pick or create a workspace next."
    >
      <SignUp
        appearance={{ elements: { rootBox: "w-full", cardBox: "w-full shadow-none" } }}
      />
    </AuthShell>
  );
}
