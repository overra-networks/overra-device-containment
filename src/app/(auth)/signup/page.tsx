"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { BrandMark } from "@/components/layout/brand-mark";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Signup failed", description: data.error, variant: "error" });
        return;
      }

      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (result?.error) {
        router.push("/login");
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

  const fieldLabel = (text: string) => (
    <label
      style={{
        display: "block",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase" as const,
        color: "#8A9BAB",
        marginBottom: "6px",
        fontFamily: "var(--font-mono, monospace)",
      }}
    >
      {text}
    </label>
  );

  return (
    <div style={{ width: "100%", maxWidth: "360px", padding: "0 20px" }}>
      {/* Brand */}
      <div style={{ textAlign: "center", marginBottom: "36px" }}>
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
          Create your account
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "22px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            {fieldLabel("Full name")}
            <Input
              type="text"
              placeholder="Jane Smith"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            {fieldLabel("Email address")}
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
            {fieldLabel("Password")}
            <Input
              type="password"
              placeholder="Minimum 8 characters"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              minLength={8}
              autoComplete="new-password"
            />
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
            background: "#0E1C29",
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
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <p style={{ textAlign: "center", marginTop: "24px", fontSize: "12px", color: "#8A9BAB" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "#2B5F8A", textDecoration: "none" }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
