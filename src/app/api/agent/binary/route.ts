import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { join } from "path";
import { verifyAgentToken } from "@/lib/agent-auth";

const VALID_OS = new Set(["linux", "darwin", "windows"]);
const VALID_ARCH = new Set(["amd64", "arm64"]);

// GET /api/agent/binary?os=<os>&arch=<arch>
// Serves the pre-built Go agent binary for the requested platform.
// Requires a valid agent JWT — only authenticated devices can download.
export async function GET(req: NextRequest) {
  const payload = await verifyAgentToken(req);
  if (!payload) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const os = searchParams.get("os") ?? "";
  const arch = searchParams.get("arch") ?? "";

  if (!VALID_OS.has(os) || !VALID_ARCH.has(arch)) {
    return new NextResponse("Invalid platform — os must be linux|darwin|windows, arch must be amd64|arm64", { status: 400 });
  }

  // Windows arm64 is not cross-compiled (CGo dependency via golang.org/x/sys/windows).
  if (os === "windows" && arch === "arm64") {
    return new NextResponse("windows/arm64 binary not available", { status: 404 });
  }

  const filename =
    os === "windows"
      ? `overra-agent-${os}-${arch}.exe`
      : `overra-agent-${os}-${arch}`;

  const binaryPath = join(process.cwd(), "agents", filename);

  try {
    const fileStat = await stat(binaryPath);

    const stream = new ReadableStream({
      start(controller) {
        const fileStream = createReadStream(binaryPath);
        fileStream.on("data", (chunk) =>
          controller.enqueue(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        );
        fileStream.on("end", () => controller.close());
        fileStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        // ReadableStream cancelled (client disconnected) — GC handles cleanup.
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": fileStat.size.toString(),
      },
    });
  } catch {
    return new NextResponse(
      `Binary not found — run 'make all' inside overra-agent/ first`,
      { status: 404 }
    );
  }
}
