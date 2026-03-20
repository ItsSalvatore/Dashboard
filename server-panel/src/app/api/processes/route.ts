import { NextResponse } from "next/server";
import si from "systeminformation";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const sort = searchParams.get("sort") ?? "cpu";

  try {
    const { list } = await si.processes();

    const processes = list
      .map((p) => ({
        pid: p.pid,
        name: p.name,
        cpu: Math.round(p.cpu),
        mem: Math.round((p.memRss / 1024 / 1024) * 10) / 10,
        memRss: p.memRss,
        state: p.state,
        user: p.user,
        command: p.command?.slice(0, 80),
      }))
      .sort((a, b) => {
        if (sort === "cpu") return (b.cpu ?? 0) - (a.cpu ?? 0);
        if (sort === "mem") return (b.mem ?? 0) - (a.mem ?? 0);
        if (sort === "name") return (a.name ?? "").localeCompare(b.name ?? "");
        return 0;
      })
      .slice(0, limit);

    return NextResponse.json({
      processes,
      total: list.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Processes API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch processes" },
      { status: 500 }
    );
  }
}
