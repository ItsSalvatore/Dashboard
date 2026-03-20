import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readPanelJson, writePanelJson } from "./panel-data";

type TwoFactorConfig = {
  enabled: boolean;
  secret: string | null;
  pendingSecret: string | null;
  issuer: string;
  label: string;
};

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

const DEFAULT_TWO_FACTOR_CONFIG: TwoFactorConfig = {
  enabled: false,
  secret: null,
  pendingSecret: null,
  issuer: "Server Panel",
  label: "admin",
};

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string): Buffer {
  const normalized = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid base32 secret");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function generateCode(secret: string, counter: number) {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export async function readTwoFactorConfig() {
  return readPanelJson<TwoFactorConfig>("two-factor.json", DEFAULT_TWO_FACTOR_CONFIG);
}

export async function writeTwoFactorConfig(config: TwoFactorConfig) {
  await writePanelJson("two-factor.json", config);
}

export function buildOtpAuthUri({
  issuer,
  label,
  secret,
}: {
  issuer: string;
  label: string;
  secret: string;
}) {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedLabel = encodeURIComponent(label);
  const encodedSecret = encodeURIComponent(secret);
  return `otpauth://totp/${encodedIssuer}:${encodedLabel}?secret=${encodedSecret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}

export function verifyTotpCode(secret: string, code: string, now = Date.now()) {
  const normalizedCode = code.trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  const currentCounter = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);

  for (let offset = -1; offset <= 1; offset += 1) {
    const expected = generateCode(secret, currentCounter + offset);
    const provided = Buffer.from(normalizedCode, "utf8");
    const reference = Buffer.from(expected, "utf8");
    if (provided.length === reference.length && timingSafeEqual(provided, reference)) {
      return true;
    }
  }

  return false;
}
