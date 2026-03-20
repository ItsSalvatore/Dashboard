export const PANEL_SESSION_COOKIE_NAME = "panel_session";

export const AUTH_SETUP_MESSAGE =
  "Authentication not configured. Set PANEL_SECRET and PANEL_PASSWORD or PANEL_PASSWORD_HASH in .env.local, then restart the panel.";

export function hasPasswordAuth(): boolean {
  return Boolean(
    process.env.PANEL_PASSWORD?.trim() || process.env.PANEL_PASSWORD_HASH?.trim()
  );
}

export function hasPanelSecret(): boolean {
  return Boolean(process.env.PANEL_SECRET?.trim());
}

export function isAuthConfigured(): boolean {
  return hasPasswordAuth() && hasPanelSecret();
}

export function getAuthSecret(): string {
  const secret = process.env.PANEL_SECRET?.trim();

  if (!secret) {
    throw new Error("PANEL_SECRET must be set");
  }

  return secret;
}
