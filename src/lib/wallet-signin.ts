import { signIn } from "next-auth/react";

/**
 * Drives the browser side of the MetaMask sign-in flow:
 *   1. Ask MetaMask for the user's accounts.
 *   2. Request a single-use challenge from the server.
 *   3. Have the wallet sign that challenge with personal_sign.
 *   4. Submit (address, signature, nonce) to the NextAuth "wallet" provider.
 *
 * Returns "ok" on success, or an error code the caller can map to a toast.
 * Throws nothing — all failures land in the result union.
 */
export type WalletSignInResult =
  | { status: "ok" }
  | { status: "no_metamask" }
  | { status: "deep_link"; url: string }
  | { status: "rejected" }
  | { status: "error"; message: string };

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

function getEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  return eth ?? null;
}

// Mobile detection. Conservative: only matches devices where window.ethereum
// genuinely cannot be injected by a browser extension (iOS Safari/Chrome,
// Android Chrome). Tablets are excluded since they often run desktop
// extensions; this errs on the side of trying the extension path first.
function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPod/i.test(navigator.userAgent);
}

// Builds a MetaMask Mobile deep-link that re-opens the current page inside
// MetaMask's in-app browser, where window.ethereum IS injected. If the user
// doesn't have MetaMask Mobile installed, the link routes them through the
// App Store / Play Store first — MetaMask handles that fallback.
function metamaskDeepLink(): string {
  const { host, pathname, search } = window.location;
  return `https://metamask.app.link/dapp/${host}${pathname}${search}`;
}

export async function signInWithMetaMask(): Promise<WalletSignInResult> {
  const ethereum = getEthereum();
  if (!ethereum) {
    // On mobile, window.ethereum can never be injected from a regular
    // browser — only from inside MetaMask Mobile's own dApp browser.
    // Hand back a deep-link the caller can open to bounce the user there.
    if (isMobileBrowser()) {
      return { status: "deep_link", url: metamaskDeepLink() };
    }
    return { status: "no_metamask" };
  }

  let address: string;
  try {
    const accounts = (await ethereum.request({
      method: "eth_requestAccounts",
    })) as string[];
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return { status: "rejected" };
    }
    address = accounts[0];
  } catch (e: unknown) {
    // MetaMask uses code 4001 for "user rejected request".
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: number }).code === 4001) {
      return { status: "rejected" };
    }
    return { status: "error", message: "Could not connect to MetaMask" };
  }

  let nonce: string;
  let message: string;
  try {
    const res = await fetch("/api/auth/wallet/nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        status: "error",
        message: data?.error ?? "Could not start wallet sign-in",
      };
    }
    nonce = data.nonce;
    message = data.message;
  } catch {
    return { status: "error", message: "Network error contacting server" };
  }

  let signature: string;
  try {
    signature = (await ethereum.request({
      method: "personal_sign",
      params: [message, address],
    })) as string;
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: number }).code === 4001) {
      return { status: "rejected" };
    }
    return { status: "error", message: "Wallet signature failed" };
  }

  const result = await signIn("wallet", {
    address,
    signature,
    nonce,
    redirect: false,
  });

  if (result?.ok) {
    return { status: "ok" };
  }
  // Surface the provider's thrown error to the caller. NextAuth packs it
  // into result.error as a string.
  return { status: "error", message: result?.error ?? "Sign-in failed" };
}
