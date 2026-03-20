import { appendFile, readFile } from "fs/promises";
import { join } from "path";
import { getPanelDataDir } from "./panel-data";

export type AuditEntry = {
  timestamp: string;
  action: string;
  actor: string;
  outcome: "success" | "failure";
  details?: Record<string, string | number | boolean | null>;
};

async function getAuditFile() {
  return join(await getPanelDataDir(), "audit.log");
}

export async function recordAuditEvent(entry: AuditEntry) {
  const filePath = await getAuditFile();
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf-8");
}

export async function readRecentAuditEvents(limit = 100): Promise<AuditEntry[]> {
  const filePath = await getAuditFile();

  try {
    const raw = await readFile(filePath, "utf-8");
    return raw
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as AuditEntry)
      .reverse();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
