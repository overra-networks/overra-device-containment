"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { BrandMark } from "@/components/layout/brand-mark";
import { MetaMaskFox } from "@/components/icons/metamask-fox";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { signInWithMetaMask } from "@/lib/wallet-signin";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (result?.error) {
        toast({ title: "Authentication failed", description: "Invalid credentials", variant: "error" });
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      toast({ title: "An unexpected error occurred", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleWalletSignIn() {
    setWalletLoading(true);
    try {
      const result = await signInWithMetaMask();
      switch (result.status) {
        case "ok":
          router.push("/dashboard");
          router.refresh();
          return;
        case "no_metamask":
          toast({
            title: "MetaMask not detected",
            description: "Install the MetaMask browser extension to sign in with a wallet.",
            variant: "error",
          });
          return;
        case "deep_link":
          // Mobile: bounce into MetaMask Mobile's in-app browser. If the
          // app isn't installed, the link routes through the store first.
          window.location.href = result.url;
          return;
        case "rejected":
          toast({
            title: "Signature rejected",
            description: "You declined the wallet signature.",
            variant: "error",
          });
          return;
        default:
          toast({
            title: "Wallet sign-in failed",
            description: result.message,
            variant: "error",
          });
      }
    } finally {
      setWalletLoading(false);
    }
  }

  return (
    <div style={{ width: "100%", maxWidth: "360px", padding: "0 20px" }}>
      {/* Brand mark */}
      <div style={{ textAlign: "center", marginBottom: "44px" }}>
        <div style={{ display: "inline-block", marginBottom: "20px" }}>
          <BrandMark variant="page" />
        </div>
        <p
          style={{
            fontSize: "10px",
            letterSpacing: "0.14em",
            color: "#8A9BAB",
            textTransform: "uppercase",
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
          Endpoint Containment Platform
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "22px" }}>
          <div style={{ marginBottom: "14px" }}>
            <label
              style={{
                display: "block",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#8A9BAB",
                marginBottom: "6px",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              Email address
            </label>
            <Input
              type="email"
              placeholder="operator@domain.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#8A9BAB",
                marginBottom: "6px",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              Password
            </label>
            <Input
              type="password"
              placeholder="••••••••••••"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              autoComplete="current-password"
            />
            <div style={{ textAlign: "right", marginTop: "8px" }}>
              <Link
                href="/forgot-password"
                style={{
                  fontSize: "11px",
                  color: "#6B84A8",
                  textDecoration: "none",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                Forgot password?
              </Link>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            height: "44px",
            borderRadius: "8px",
            border: "none",
            background: loading ? "#162840" : "#0E1C29",
            color: "white",
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: loading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            opacity: loading ? 0.8 : 1,
            transition: "all 0.15s",
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
          {loading ? (
            <>
              <Loader2 style={{ width: "14px", height: "14px" }} className="animate-spin" />
              Authenticating...
            </>
          ) : (
            "Authenticate"
          )}
        </button>
      </form>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          margin: "20px 0 14px",
          fontSize: "10px",
          letterSpacing: "0.14em",
          color: "#5A7080",
          textTransform: "uppercase",
          fontFamily: "var(--font-mono, monospace)",
        }}
      >
        <span style={{ flex: 1, height: "1px", background: "#1C2E4A" }} />
        or
        <span style={{ flex: 1, height: "1px", background: "#1C2E4A" }} />
      </div>

      <button
        type="button"
        onClick={handleWalletSignIn}
        disabled={walletLoading || loading}
        style={{
          width: "100%",
          height: "44px",
          borderRadius: "8px",
          border: "1px solid #1C2E4A",
          background: "#131F32",
          color: "#E8F0FF",
          fontSize: "12px",
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: walletLoading || loading ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          opacity: walletLoading || loading ? 0.55 : 1,
          transition: "all 0.15s",
          fontFamily: "var(--font-mono, monospace)",
        }}
      >
        {walletLoading ? (
          <>
            <Loader2 style={{ width: "14px", height: "14px" }} className="animate-spin" />
            Waiting for wallet...
          </>
        ) : (
          <>
            <MetaMaskFox size={16} />
            Sign in with MetaMask
          </>
        )}
      </button>

      <p
        style={{
          textAlign: "center",
          marginTop: "24px",
          fontSize: "12px",
          color: "#8A9BAB",
        }}
      >
        No account?{" "}
        <Link
          href="/signup"
          style={{ color: "#2B5F8A", textDecoration: "none" }}
        >
          Request access
        </Link>
      </p>
    </div>
  );
}
