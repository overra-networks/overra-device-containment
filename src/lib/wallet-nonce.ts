import { randomBytes } from "crypto";

/**
 * In-process nonce store for wallet sign-in challenges.
 *
 * The portal runs as a single Node process (no Redis by design — see
 * CLAUDE.md). If you ever scale beyond one instance, move this to
 * Postgres with a TTL cleanup job.
 *
 * Lifecycle:
 *   1. Client requests a nonce for an address (POST /api/auth/wallet/nonce).
 *   2. Client signs the returned message with MetaMask.
 *   3. NextAuth wallet provider calls consumeNonce(address, nonce) —
 *      single-use, fails on the second attempt.
 */

const NONCE_TTL_MS = 5 * 60 * 1000;

type NonceRecord = {
  nonce: string;
  message: string;
  expiresAt: number;
};

class WalletNonceStore {
  private store: Map<string, NonceRecord> = new Map();

  issue(address: string): { nonce: string; message: string } {
    const normalized = address.toLowerCase();
    const nonce = randomBytes(32).toString("hex");
    const ts = Date.now();
    const message = `Overra Login: ${normalized} nonce=${nonce} ts=${ts}`;
    this.store.set(normalized, {
      nonce,
      message,
      expiresAt: ts + NONCE_TTL_MS,
    });
    return { nonce, message };
  }

  /**
   * Returns the signed message string the client was issued, or null
   * if the nonce is missing, mismatched, or expired. Single-use: the
   * record is deleted on lookup regardless of outcome.
   */
  consume(address: string, nonce: string): string | null {
    const normalized = address.toLowerCase();
    const record = this.store.get(normalized);
    if (!record) return null;
    this.store.delete(normalized);
    if (record.nonce !== nonce) return null;
    if (Date.now() > record.expiresAt) return null;
    return record.message;
  }
}

const globalStore = globalThis as unknown as {
  walletNonceStore: WalletNonceStore | undefined;
};

export const walletNonces =
  globalStore.walletNonceStore ??
  (globalStore.walletNonceStore = new WalletNonceStore());
