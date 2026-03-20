import { isIP } from "node:net";

function ipv4ToInt(ip: string): number {
  return ip
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .reduce((acc, octet) => (acc << 8) + octet, 0) >>> 0;
}

function isPrivateIpv4(host: string): boolean {
  const ip = ipv4ToInt(host);
  const tenStart = ipv4ToInt("10.0.0.0");
  const tenEnd = ipv4ToInt("10.255.255.255");
  const oneNineTwoStart = ipv4ToInt("192.168.0.0");
  const oneNineTwoEnd = ipv4ToInt("192.168.255.255");
  const oneSevenTwoStart = ipv4ToInt("172.16.0.0");
  const oneSevenTwoEnd = ipv4ToInt("172.31.255.255");
  const loopbackStart = ipv4ToInt("127.0.0.0");
  const loopbackEnd = ipv4ToInt("127.255.255.255");

  return (
    (ip >= tenStart && ip <= tenEnd) ||
    (ip >= oneNineTwoStart && ip <= oneNineTwoEnd) ||
    (ip >= oneSevenTwoStart && ip <= oneSevenTwoEnd) ||
    (ip >= loopbackStart && ip <= loopbackEnd)
  );
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

export function isAllowedPrivateHost(host: string): boolean {
  const normalized = host.toLowerCase();

  if (normalized === "localhost") {
    return true;
  }

  const version = isIP(normalized);
  if (version === 4) {
    return isPrivateIpv4(normalized);
  }
  if (version === 6) {
    return isPrivateIpv6(normalized);
  }

  return false;
}

export function isAllowedPrivateUrl(url: URL): boolean {
  return isAllowedPrivateHost(url.hostname);
}
