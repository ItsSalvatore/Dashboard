import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { requireAuth } from "@/lib/auth";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";
export const revalidate = 0;

const INSTALL_TIMEOUT_MS = 180000; // 3 min for Docker install

type InstallablePackage = "docker" | "nginx" | "certbot";

// All installs run with sudo. Configure passwordless sudo for the panel user, or run panel as root.
const INSTALL_SCRIPTS: Record<
  InstallablePackage,
  { check: string; install: string; name: string }
> = {
  docker: {
    name: "Docker",
    check: "docker --version 2>/dev/null",
    install: "curl -fsSL https://get.docker.com | sudo -n sh",
  },
  nginx: {
    name: "nginx",
    check: "nginx -v 2>/dev/null",
    install: "sudo -n apt-get update -qq && sudo -n apt-get install -y nginx",
  },
  certbot: {
    name: "Certbot",
    check: "certbot --version 2>/dev/null",
    install: "sudo -n apt-get update -qq && sudo -n apt-get install -y certbot",
  },
};

async function isInstalled(pkg: InstallablePackage): Promise<boolean> {
  try {
    await execAsync(INSTALL_SCRIPTS[pkg].check, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const [docker, nginx, certbot] = await Promise.all([
      isInstalled("docker"),
      isInstalled("nginx"),
      isInstalled("certbot"),
    ]);

    return NextResponse.json({
      docker: { installed: docker, name: "Docker" },
      nginx: { installed: nginx, name: "nginx" },
      certbot: { installed: certbot, name: "Certbot" },
    });
  } catch (error) {
    console.error("Install status error:", error);
    return NextResponse.json(
      { error: "Failed to check install status" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const pkg = body.package as InstallablePackage;

    if (!pkg || !INSTALL_SCRIPTS[pkg]) {
      return NextResponse.json(
        { error: `Unknown package. Use: ${Object.keys(INSTALL_SCRIPTS).join(", ")}` },
        { status: 400 }
      );
    }

    const alreadyInstalled = await isInstalled(pkg);
    if (alreadyInstalled) {
      return NextResponse.json({
        ok: true,
        message: `${INSTALL_SCRIPTS[pkg].name} is already installed`,
      });
    }

    const { install } = INSTALL_SCRIPTS[pkg];
    const { stdout, stderr } = await execAsync(install, {
      timeout: INSTALL_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });

    const output = (stdout + stderr).trim();
    const verified = await isInstalled(pkg);

    return NextResponse.json({
      ok: verified,
      message: verified
        ? `${INSTALL_SCRIPTS[pkg].name} installed successfully`
        : "Install may have failed. Check output.",
      output: output.slice(-2000),
    });
  } catch (error: unknown) {
    const err = error as { stderr?: string; stdout?: string; message?: string };
    const msg =
      err.stderr || err.stdout || err.message || "Install failed";
    console.error("Install error:", err);
    return NextResponse.json(
      { error: msg.slice(-500) },
      { status: 500 }
    );
  }
}
