import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { verifyAgentToken } from "@/lib/agent-auth";

// GET /api/agent/script — serves the Python agent daemon script.
// Requires a valid agent JWT so only registered devices can download it.
export async function GET(req: NextRequest) {
  const payload = await verifyAgentToken(req);
  if (!payload) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const scriptPath = join(process.cwd(), "agent", "overra-agent.py");
    const script = readFileSync(scriptPath, "utf-8");

    return new NextResponse(script, {
      headers: {
        "Content-Type": "text/x-python",
        "Content-Disposition": 'attachment; filename="overra-agent.py"',
      },
    });
  } catch {
    return new NextResponse("Agent script not found", { status: 404 });
  }
}
