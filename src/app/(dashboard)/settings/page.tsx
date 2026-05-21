"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { Shield, Wallet, Loader2, CheckCircle2, Link2Off, KeyRound } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { truncateAddress } from "@/lib/utils";

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    setWalletAddress((session?.user as any)?.walletAddress ?? null);
  }, [session]);

  async function linkWallet() {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      toast({
        title: "MetaMask not detected",
        description: "Install MetaMask browser extension to link a wallet",
        variant: "error",
      });
      return;
    }

    setLinking(true);
    try {
      const accounts: string[] = await (window as any).ethereum.request({
        method: "eth_requestAccounts",
      });
      const address = accounts[0];

      const message = `Overra Wallet Link: ${address} ts=${Date.now()}`;
      const signature = await (window as any).ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });

      const res = await fetch("/api/auth/wallet/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: address, signature, message }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Failed to link wallet", description: data.error, variant: "error" });
        return;
      }

      await update({ walletAddress: address });
      setWalletAddress(address);
      toast({ title: "Wallet linked successfully", variant: "success" });
    } catch (e: any) {
      if (e?.code === 4001) {
        toast({ title: "Signature rejected", description: "You rejected the wallet signature", variant: "error" });
      } else {
        toast({ title: "Failed to link wallet", variant: "error" });
      }
    } finally {
      setLinking(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "error" });
      return;
    }
    if (newPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Must be at least 8 characters.",
        variant: "error",
      });
      return;
    }
    if (newPassword === currentPassword) {
      toast({
        title: "New password must be different",
        description: "Choose a password you have not used here.",
        variant: "error",
      });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json()) as { message?: string; error?: string };

      if (!res.ok) {
        toast({
          title: "Could not change password",
          description: data.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Password updated",
        description: "Sign in again with your new password.",
        variant: "success",
      });
      // The server bumped passwordChangedAt, which invalidates this JWT on
      // its next refresh. Sign out now for a clean redirect rather than
      // letting the user hit a stale-session 401 later.
      await signOut({ callbackUrl: "/login" });
    } catch {
      toast({ title: "Network error", variant: "error" });
    } finally {
      setChangingPassword(false);
    }
  }

  async function unlinkWallet() {
    setUnlinking(true);
    try {
      const res = await fetch("/api/auth/wallet/link", { method: "DELETE" });
      if (!res.ok) {
        toast({ title: "Failed to unlink wallet", variant: "error" });
        return;
      }
      await update({ walletAddress: null });
      setWalletAddress(null);
      toast({ title: "Wallet unlinked", variant: "success" });
    } catch {
      toast({ title: "Failed to unlink wallet", variant: "error" });
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "600px" }}>
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#0E1C29", marginBottom: "4px" }}>
          Settings
        </h1>
        <p style={{ fontSize: "13px", color: "#5A7080" }}>
          Manage your account and security preferences
        </p>
      </div>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <Label>Name</Label>
            <Input value={session?.user?.name ?? ""} disabled />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <Label>Email</Label>
            <Input value={session?.user?.email ?? ""} disabled />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <Label>Plan</Label>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 10px",
                  borderRadius: "20px",
                  background: "rgba(14,28,41,0.07)",
                  color: "#0E1C29",
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                <Shield style={{ width: "10px", height: "10px" }} />
                {((session?.user as any)?.plan ?? "free").toUpperCase()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={changePassword}
            style={{ display: "flex", flexDirection: "column", gap: "14px" }}
          >
            <p style={{ fontSize: "13px", color: "#5A7080", lineHeight: 1.6 }}>
              You will be signed out after updating your password and need to
              sign in again with the new one.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Repeat new password"
              />
            </div>
            <button
              type="submit"
              disabled={changingPassword}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                height: "36px",
                padding: "0 16px",
                borderRadius: "6px",
                border: "1px solid #DDE3EA",
                background: "#0E1C29",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: 500,
                cursor: changingPassword ? "not-allowed" : "pointer",
                opacity: changingPassword ? 0.7 : 1,
                transition: "all 0.15s",
                alignSelf: "flex-start",
              }}
            >
              {changingPassword ? (
                <>
                  <Loader2
                    style={{ width: "14px", height: "14px" }}
                    className="animate-spin"
                  />
                  Updating...
                </>
              ) : (
                <>
                  <KeyRound style={{ width: "14px", height: "14px" }} />
                  Update password
                </>
              )}
            </button>
          </form>
        </CardContent>
      </Card>

      {/* Wallet Authority */}
      <Card>
        <CardHeader>
          <CardTitle>Wallet Authority</CardTitle>
        </CardHeader>
        <CardContent style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <p style={{ fontSize: "13px", color: "#5A7080", lineHeight: 1.6 }}>
            Link an Ethereum wallet to cryptographically authorize containment actions.
            Devices with a wallet authority require a valid EIP-191 signature before
            containment can be entered or released.
          </p>

          {walletAddress ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderRadius: "8px",
                background: "#FFFFFF",
                border: "1px solid #DDE3EA",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: "rgba(0,135,90,0.1)",
                    border: "1px solid rgba(0,135,90,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <CheckCircle2 style={{ width: "14px", height: "14px", color: "#00875A" }} />
                </div>
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: "#0E1C29", marginBottom: "2px" }}>
                    Wallet linked
                  </p>
                  <p
                    style={{
                      fontSize: "11px",
                      fontFamily: "var(--font-mono, monospace)",
                      color: "#5A7080",
                    }}
                  >
                    {truncateAddress(walletAddress, 8)}
                  </p>
                </div>
              </div>
              <button
                onClick={unlinkWallet}
                disabled={unlinking}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  borderRadius: "6px",
                  border: "1px solid #DDE3EA",
                  background: "transparent",
                  color: "#FF3355",
                  cursor: unlinking ? "not-allowed" : "pointer",
                  opacity: unlinking ? 0.6 : 1,
                  transition: "all 0.15s",
                }}
              >
                {unlinking ? (
                  <Loader2 style={{ width: "14px", height: "14px" }} className="animate-spin" />
                ) : (
                  <Link2Off style={{ width: "14px", height: "14px" }} />
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={linkWallet}
              disabled={linking}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                height: "36px",
                padding: "0 16px",
                borderRadius: "6px",
                border: "1px solid #DDE3EA",
                background: "transparent",
                color: "#0E1C29",
                fontSize: "13px",
                fontWeight: 500,
                cursor: linking ? "not-allowed" : "pointer",
                opacity: linking ? 0.7 : 1,
                transition: "all 0.15s",
              }}
            >
              {linking ? (
                <>
                  <Loader2 style={{ width: "14px", height: "14px" }} className="animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Wallet style={{ width: "14px", height: "14px" }} />
                  Connect MetaMask
                </>
              )}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
