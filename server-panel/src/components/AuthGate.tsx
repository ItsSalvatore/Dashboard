"use client";

import { useEffect, useState } from "react";
import LoginForm from "./LoginForm";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => setAuthorized(d.authorized))
      .catch(() => setAuthorized(false));
  }, []);

  if (authorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
      </div>
    );
  }

  if (!authorized) {
    return <LoginForm onSuccess={() => setAuthorized(true)} />;
  }

  return <>{children}</>;
}
