"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { BrandMark } from "@/components/layout/brand-mark";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        toast({
          title: "Too many requests",
          description: "Please wait before trying again.",
          variant: "error",
        });
        return;
      }
      setSubmitted(true);
    } catch {
      toast({
        title: "Network error",
        description: "Please try again.",
        variant: "error",
      });
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
          Reset Account Password
        </p>
      </div>

      {submitted ? (
        <div
          style={{
            padding: "20px",
            borderRadius: "8px",
            background: "#131F32",
            border: "1px solid #1C2E4A",
            color: "#E8F0FF",
            fontSize: "13px",
            lineHeight: 1.6,
            marginBottom: "24px",
          }}
        >
          If an account with that email exists, we&apos;ve sent password reset
          instructions. The link expires in 1 hour.
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
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
              Email address
            </label>
            <Input
              type="email"
              placeholder="operator@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
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
                Sending...
              </>
            ) : (
              "Send reset link"
            )}
          </button>
        </form>
      )}

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
