import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { broadcaster } from "@/lib/events";

// GET /api/events — Server-Sent Events stream for real-time portal updates
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  let controller: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;

      const client = {
        userId,
        send(data: string) {
          controller.enqueue(encoder.encode(data));
        },
        close() {
          try {
            controller.close();
          } catch {}
        },
      };

      broadcaster.register(client);

      // Send connected event
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({ userId })}\n\n`
        )
      );

      // Keep-alive ping every 25 seconds
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(keepAlive);
          broadcaster.unregister(client);
        }
      }, 25000);

      // Cleanup on close
      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        broadcaster.unregister(client);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
