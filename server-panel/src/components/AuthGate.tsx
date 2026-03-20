"use client";

import { useEffect, useState } from "react";
import LoginForm from "./LoginForm";
import SetupNotice from "./SetupNotice";

type SessionState = {
  authorized: boolean;
  configured: boolean;
};

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) =>
        setSession({
          authorized: Boolean(d.authorized),
          configured: Boolean(d.configured),
        })
      )
      .catch(() =>
        setSession({
          authorized: false,
          configured: true,
        })
      );
  }, []);

  if (session === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
      </div>
    );
  }

  if (!session.configured) {
    return <SetupNotice />;
  }

  if (!session.authorized) {
    return (
      <LoginForm
        onSuccess={() =>
          setSession({
            authorized: true,
            configured: true,
          })
        }
      />
    );
  }

  return children;
}
