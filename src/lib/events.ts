/**
 * In-process Server-Sent Events broadcaster.
 * Maps userId -> Set of SSE response writers.
 * Used to push real-time device status and log updates to the browser portal.
 */

type SSEClient = {
  userId: string;
  send: (data: string) => void;
  close: () => void;
};

class SSEBroadcaster {
  private clients: Map<string, Set<SSEClient>> = new Map();

  register(client: SSEClient) {
    if (!this.clients.has(client.userId)) {
      this.clients.set(client.userId, new Set());
    }
    this.clients.get(client.userId)!.add(client);
  }

  unregister(client: SSEClient) {
    const set = this.clients.get(client.userId);
    if (set) {
      set.delete(client);
      if (set.size === 0) {
        this.clients.delete(client.userId);
      }
    }
  }

  broadcastToUser(userId: string, event: string, data: unknown) {
    const set = this.clients.get(userId);
    if (!set) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of set) {
      try {
        client.send(payload);
      } catch {
        // client disconnected
        this.unregister(client);
      }
    }
  }
}

// Global singleton
const globalBroadcaster = globalThis as unknown as {
  sseBroadcaster: SSEBroadcaster | undefined;
};

export const broadcaster =
  globalBroadcaster.sseBroadcaster ??
  (globalBroadcaster.sseBroadcaster = new SSEBroadcaster());

export type SSEEventType =
  | "device:status_update"
  | "log:new_entry"
  | "device:heartbeat";
