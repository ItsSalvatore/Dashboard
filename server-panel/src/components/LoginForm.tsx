"use client";

import { useState } from "react";

export default function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, twoFactorCode }),
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess();
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] p-8"
      >
        <h1 className="mb-6 text-xl font-bold text-[var(--foreground)]">
          Server Panel
        </h1>
        <label className="mb-2 block text-sm font-medium text-[var(--muted)]">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
          placeholder="Enter password"
          autoFocus
          required
        />
        <label className="mb-2 block text-sm font-medium text-[var(--muted)]">
          Authenticator code
        </label>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={twoFactorCode}
          onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
          placeholder="6-digit code if enabled"
        />
        <p className="mb-4 text-xs text-[var(--muted)]">
          Use the current code from Microsoft Authenticator or any TOTP-compatible app if 2FA is enabled.
        </p>
        {error && (
          <p className="mb-4 text-sm text-red-400">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-[var(--accent)]/20 py-2 font-medium text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
