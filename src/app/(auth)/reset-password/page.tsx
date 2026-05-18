"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { BrandMark } from "@/components/layout/brand-mark";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [token, setToken] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  // Capture the token, then strip it from the URL bar so it does not leak
  // via the Referer header if the user navigates away.
  useEffect(() => {
    const t = params.get("token") ?? "";
    setToken(t);
    if (t && typeof window !== "undefined") {
      window.history.replaceState({}, "", "/reset-password");
    }
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirm) {
      toast({ title: "Passwords do not match", variant: "error" });
      return;
    }
    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Must be at least 8 characters.",
        variant: "error",
      });
      return;
    }
    if (!token) {
      toast({
        title: "Missing reset token",
        description: "Open the link from your reset email.",
        variant: "error",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { message?: string; error?: string };

      if (!res.ok) {
        toast({
          title: "Could not reset password",
          description: data.error ?? "Please request a new reset link.",
          variant: "error",
        });
        return;
      }
      toast({
        title: "Password updated",
        description: "Sign in with your new password.",
        variant: "success",
      });
      router.push("/login");
    } catch {
      toast({ title: "Network error", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ width: "100%", maxWidth: "360px", padding: "0 20px" }}>
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
          Set New Password
        </p>
      </div>

      <form onSubmit={handleSubmit}>
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
            New password
          </label>
          <Input
            type="password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <div style={{ marginBottom: "22px" }}>
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
            Confirm password
          </label>
          <Input
            type="password"
            placeholder="••••••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
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
              <Loader2
                style={{ width: "14px", height: "14px" }}
                className="animate-spin"
              />
              Updating...
            </>
          ) : (
            "Update password"
          )}
        </button>
      </form>

      <p
        style={{
          textAlign: "center",
          marginTop: "24px",
          fontSize: "12px",
          color: "#8A9BAB",
        }}
      >
        <Link
          href="/login"
          style={{ color: "#2B5F8A", textDecoration: "none" }}
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
