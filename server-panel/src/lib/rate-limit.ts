type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const loginAttempts = new Map<string, RateLimitRecord>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

function cleanup(now: number) {
  for (const [key, value] of loginAttempts.entries()) {
    if (value.resetAt <= now) {
      loginAttempts.delete(key);
    }
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function getLoginRateLimitState(key: string) {
  const now = Date.now();
  cleanup(now);

  const current = loginAttempts.get(key);
  if (!current) {
    return { allowed: true, remaining: LOGIN_MAX_ATTEMPTS, retryAfterSeconds: 0 };
  }

  if (current.count >= LOGIN_MAX_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, LOGIN_MAX_ATTEMPTS - current.count),
    retryAfterSeconds: 0,
  };
}

export function recordLoginFailure(key: string) {
  const now = Date.now();
  cleanup(now);

  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }

  loginAttempts.set(key, {
    count: current.count + 1,
    resetAt: current.resetAt,
  });
}

export function clearLoginFailures(key: string) {
  loginAttempts.delete(key);
}
