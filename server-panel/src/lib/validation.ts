/**
 * Input validation helpers - secure by default
 */

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

export function isValidDomain(domain: string): boolean {
  if (typeof domain !== "string" || domain.length > 253) return false;
  return DOMAIN_REGEX.test(domain.trim());
}

export function sanitizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/[^a-z0-9.-]/g, "");
}

export function hasPathTraversal(path: string): boolean {
  return path.includes("..") || path.includes("\0");
}

export function isSafePath(path: string, base: string): boolean {
  if (hasPathTraversal(path)) return false;
  const resolved = path.replace(/\/+/g, "/");
  return resolved.startsWith(base) && !resolved.includes("..");
}

export function isValidContainerId(id: string): boolean {
  return /^[a-f0-9]{12,64}$/.test(id) || /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(id);
}
