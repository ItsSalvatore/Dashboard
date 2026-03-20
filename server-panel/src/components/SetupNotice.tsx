"use client";

export default function SetupNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-8">
        <h1 className="mb-3 text-xl font-bold text-[var(--foreground)]">
          Finish panel setup
        </h1>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Add a panel password in `server-panel/.env.local`, then restart the app.
        </p>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 text-sm text-[var(--foreground)]">
          <p className="font-medium">Required env vars</p>
          <p className="mt-2 font-mono">PANEL_SECRET=generate-a-long-random-secret</p>
          <p className="mt-2 font-mono">PANEL_PASSWORD=your-secure-password</p>
          <p className="mt-1 text-[var(--muted)]">
            Or use `PANEL_PASSWORD_HASH` if you prefer storing a bcrypt hash.
          </p>
        </div>
      </div>
    </div>
  );
}
