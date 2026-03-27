import { NextResponse } from "next/server";
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { isValidDomain, sanitizeDomain } from "@/lib/validation";
import { requireAuth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { runFirstSuccessful } from "@/lib/commands";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BIND_ZONE_DIR = "/etc/bind/zones";
const BIND_NAMED_CONF = "/etc/bind/named.conf.local";

async function reloadDnsService() {
  await runFirstSuccessful([
    { command: "systemctl", args: ["reload", "bind9"] },
    { command: "service", args: ["named", "reload"] },
  ]);
}

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (!existsSync(BIND_ZONE_DIR)) {
      return NextResponse.json({ zones: [], message: "bind9 zones dir not found" });
    }
    const files = await readdir(BIND_ZONE_DIR);
    const zones = files
      .filter((f) => f.endsWith(".zone"))
      .map((f) => f.replace(/\.zone$/, ""));
    const zoneDetails: { name: string; records: string[] }[] = [];
    for (const z of zones) {
      const path = join(BIND_ZONE_DIR, `${z}.zone`);
      const content = await readFile(path, "utf8").catch(() => "");
      const records = content.split("\n").filter((l) => !l.startsWith(";") && l.trim());
      zoneDetails.push({ name: z, records });
    }
    return NextResponse.json({ zones: zoneDetails });
  } catch (error) {
    return NextResponse.json({ zones: [], error: String(error) });
  }
}

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "create-zone") {
    const domain = sanitizeDomain(typeof body.domain === "string" ? body.domain : "");
    if (!isValidDomain(domain)) {
      return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
    }
    await mkdir(BIND_ZONE_DIR, { recursive: true });
    const zoneFile = join(BIND_ZONE_DIR, `${domain}.zone`);
    if (existsSync(zoneFile)) {
      return NextResponse.json({ error: "Zone already exists" }, { status: 409 });
    }
    const serial = Math.floor(Date.now() / 1000);
    const zoneContent = `$TTL 3600
@ IN SOA ns1.${domain}. admin.${domain}. ( ${serial} 7200 3600 1209600 3600 )
@ IN NS ns1.${domain}.
@ IN A 127.0.0.1
ns1 IN A 127.0.0.1
www IN A 127.0.0.1
`;
    await writeFile(zoneFile, zoneContent);
    const zoneConfig = `zone "${domain}" {
    type master;
    file "${zoneFile}";
    allow-transfer { none; };
};
`;
    const namedConf = await readFile(BIND_NAMED_CONF, "utf8").catch(() => "");
    if (!namedConf.includes(`zone "${domain}"`)) {
      await writeFile(BIND_NAMED_CONF, namedConf + "\n" + zoneConfig);
    }
    await reloadDnsService();
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "dns.zone.create",
      actor: "admin",
      outcome: "success",
      details: { domain },
    });
    return NextResponse.json({ ok: true, domain });
  }

  if (action === "add-record") {
    const zone = sanitizeDomain(typeof body.zone === "string" ? body.zone : "");
    const name = typeof body.name === "string" && body.name.trim() ? body.name : "@";
    const type = (typeof body.type === "string" ? body.type : "A").toUpperCase();
    const value = String(body.value ?? "").trim();
    if (!zone || !value || value.length > 500) {
      return NextResponse.json({ error: "Invalid record" }, { status: 400 });
    }
    const validTypes = ["A", "AAAA", "CNAME", "MX", "TXT", "NS"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid record type" }, { status: 400 });
    }
    const zoneFile = join(BIND_ZONE_DIR, `${zone}.zone`);
    if (!existsSync(zoneFile)) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }
    const record = type === "MX"
      ? `${name} IN MX 10 ${value}`
      : `${name} IN ${type} ${value}`;
    const content = await readFile(zoneFile, "utf8");
    const lines = content.split("\n");
    const soaLine = lines.findIndex((l) => l.includes("SOA"));
    if (soaLine >= 0) {
      const soaMatch = lines[soaLine].match(/\( (\d+) /);
      if (soaMatch) {
        const newSerial = parseInt(soaMatch[1], 10) + 1;
        lines[soaLine] = lines[soaLine].replace(/\( \d+ /, `( ${newSerial} `);
      }
    }
    lines.push(record);
    await writeFile(zoneFile, lines.join("\n"));
    await reloadDnsService();
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "dns.record.add",
      actor: "admin",
      outcome: "success",
      details: { zone, type, name },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete-record") {
    const zone = sanitizeDomain(typeof body.zone === "string" ? body.zone : "");
    const recordLine = typeof body.line === "number" ? body.line : -1;
    const zoneFile = join(BIND_ZONE_DIR, `${zone}.zone`);
    if (!existsSync(zoneFile)) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }
    const content = await readFile(zoneFile, "utf8");
    const lines = content.split("\n").filter((_, i) => i !== recordLine);
    await writeFile(zoneFile, lines.join("\n"));
    await reloadDnsService();
    await recordAuditEvent({
      timestamp: new Date().toISOString(),
      action: "dns.record.delete",
      actor: "admin",
      outcome: "success",
      details: { zone, line: typeof recordLine === "number" ? recordLine : -1 },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
