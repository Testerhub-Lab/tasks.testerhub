"use client";

import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

export default function SignInButton({ redirect }: { redirect: string }) {
  const signInUrl = `/api/auth/signin/authentik?redirect=${encodeURIComponent(redirect)}`;

  return (
    <Button
      variant="primary"
      className="w-full"
      onClick={() => {
        window.location.href = signInUrl;
      }}
    >
      Войти через TesterHub
    </Button>
  );
}
