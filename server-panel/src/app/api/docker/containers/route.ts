import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { runCommand } from "@/lib/commands";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { stdout } = await runCommand("docker", [
      "ps",
      "-a",
      "--format",
      "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Status}}\t{{.Ports}}",
    ]);
    const lines = stdout.trim().split("\n").filter(Boolean);
    const containers = lines.map((line) => {
      const [id, names, image, state, status, ports] = line.split("\t");
      return {
        id: id || "",
        shortId: (id || "").slice(0, 12),
        name: (names || id || "").replace(/^\//, ""),
        image: image || "",
        state: (state || "unknown").toLowerCase(),
        status: status || "",
        ports: (ports || "").split(", ").filter(Boolean),
      };
    });
    return NextResponse.json({
      available: true,
      containers,
    });
  } catch {
    return NextResponse.json({
      available: false,
      containers: [],
      message: "Docker not available",
    });
  }
}
