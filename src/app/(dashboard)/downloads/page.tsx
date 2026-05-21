"use client";

import { useState, useEffect } from "react";
import { Download, Monitor, Apple, Terminal, Loader2, Copy, CheckCheck, ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { formatTimestamp } from "@/lib/utils";

type PlatformId = "windows" | "macos" | "linux";

interface InstallStep {
  title: string;
  body: string;
  code?: string;
}

const installInstructions: Record<PlatformId, { filename: string; runAs: string; steps: InstallStep[] }> = {
  windows: {
    filename: "overra-agent-installer.ps1",
    runAs: "Administrator (elevated PowerShell)",
    steps: [
      {
        title: "Generate an installer above",
        body: "Click Generate .ps1 in the Windows card, then copy the one-time download URL.",
      },
      {
        title: "Open elevated PowerShell on the target endpoint",
        body: "Right-click PowerShell and choose 'Run as Administrator'. The script registers a Windows service, which requires elevation.",
      },
      {
        title: "Download the installer",
        body: "Replace <URL> with the link you copied. The token is single-use and consumed on first authenticate call.",
        code: 'Invoke-WebRequest -Uri "<URL>" -OutFile "$env:TEMP\\overra-agent-installer.ps1"',
      },
      {
        title: "Allow the script to run for this session",
        body: "PowerShell blocks unsigned scripts by default. This relaxes the policy for the current process only.",
        code: "Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force",
      },
      {
        title: "Run the installer",
        body: "Authenticates, writes config to %ProgramData%\\Overra, downloads the agent binary, and installs the Windows service.",
        code: '& "$env:TEMP\\overra-agent-installer.ps1"',
      },
      {
        title: "Verify the service is running",
        body: "The agent registers itself as a Windows service named overra-agent.",
        code: "Get-Service overra-agent",
      },
    ],
  },
  macos: {
    filename: "overra-agent-install.sh",
    runAs: "root (sudo)",
    steps: [
      {
        title: "Generate an installer above",
        body: "Click Generate .sh in the macOS card, then copy the one-time download URL.",
      },
      {
        title: "Open Terminal on the target Mac",
        body: "The installer registers a launchd daemon, which requires sudo.",
      },
      {
        title: "Download the installer",
        body: "Replace <URL> with the link you copied. The token is single-use and consumed on first authenticate call.",
        code: 'curl -fsSL "<URL>" -o /tmp/overra-agent-install.sh',
      },
      {
        title: "Run the installer with sudo",
        body: "Writes config to /etc/overra, places the binary at /usr/local/bin/overra-agent, and installs the launchd service.",
        code: "sudo bash /tmp/overra-agent-install.sh",
      },
      {
        title: "Verify the daemon is loaded",
        body: "The agent registers itself with launchd on install.",
        code: "sudo launchctl list | grep overra",
      },
    ],
  },
  linux: {
    filename: "overra-agent-install.sh",
    runAs: "root (sudo)",
    steps: [
      {
        title: "Generate an installer above",
        body: "Click Generate .sh in the Linux card, then copy the one-time download URL.",
      },
      {
        title: "Open a shell on the target host",
        body: "The installer registers a systemd unit, which requires root.",
      },
      {
        title: "Download the installer",
        body: "Replace <URL> with the link you copied. The token is single-use and consumed on first authenticate call.",
        code: 'curl -fsSL "<URL>" -o /tmp/overra-agent-install.sh',
      },
      {
        title: "Run the installer with sudo",
        body: "Writes config to /etc/overra, places the binary at /usr/local/bin/overra-agent, and installs the systemd service.",
        code: "sudo bash /tmp/overra-agent-install.sh",
      },
      {
        title: "Verify the service is active",
        body: "systemd starts the agent automatically after install and on every boot.",
        code: "sudo systemctl status overra-agent",
      },
    ],
  },
};

const instructionTabs: { id: PlatformId; label: string; icon: typeof Monitor }[] = [
  { id: "windows", label: "Windows", icon: Monitor },
  { id: "macos", label: "macOS", icon: Apple },
  { id: "linux", label: "Linux", icon: Terminal },
];

interface DownloadRecord {
  id: string;
  platform: "windows" | "macos" | "linux";
  version: string;
  downloadToken: string;
  activated: boolean;
  createdAt: string;
}

const platforms = [
  {
    id: "windows",
    label: "Windows",
    icon: Monitor,
    ext: "ps1",
    desc: "PowerShell installer — Run as Administrator",
  },
  {
    id: "macos",
    label: "macOS",
    icon: Apple,
    ext: "sh",
    desc: "Shell installer — Requires sudo",
  },
  {
    id: "linux",
    label: "Linux",
    icon: Terminal,
    ext: "sh",
    desc: "Shell installer — Requires sudo",
  },
] as const;

export default function DownloadsPage() {
  const [generating, setGenerating] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeOs, setActiveOs] = useState<PlatformId>("windows");
  const [copiedCmdKey, setCopiedCmdKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/downloads/generate")
      .then((r) => r.json())
      .then((d) => setDownloads(d.downloads || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function generate(platform: string) {
    setGenerating(platform);
    try {
      const res = await fetch("/api/downloads/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Failed to generate installer", description: data.error, variant: "error" });
        return;
      }
      setDownloads((prev) => [
        {
          id: data.id,
          platform: platform as any,
          version: "v0.1",
          downloadToken: data.token,
          activated: false,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      toast({ title: "Installer generated", description: "Download link is ready", variant: "success" });
    } catch {
      toast({ title: "Error generating installer", variant: "error" });
    } finally {
      setGenerating(null);
    }
  }

  function copyUrl(token: string, id: string) {
    const url = `${window.location.origin}/api/downloads/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Download URL copied", variant: "success" });
  }

  function copyCommand(cmd: string, key: string) {
    navigator.clipboard.writeText(cmd);
    setCopiedCmdKey(key);
    setTimeout(() => setCopiedCmdKey(null), 2000);
    toast({ title: "Command copied", variant: "success" });
  }

  const activeInstructions = installInstructions[activeOs];

  // Pick the most recent unactivated installer for the active platform.
  // Tokens are single-use, so an already-activated one wouldn't work if
  // pasted into the example command.
  const latestUsableForOs = downloads.find(
    (d) => d.platform === activeOs && !d.activated
  );
  const installUrl =
    latestUsableForOs && typeof window !== "undefined"
      ? `${window.location.origin}/api/downloads/${latestUsableForOs.downloadToken}`
      : "<URL>";

  function renderCode(code: string): string {
    return code.replace(/<URL>/g, installUrl);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#0E1C29", marginBottom: "4px" }}>
          Downloads
        </h1>
        <p style={{ fontSize: "13px", color: "#5A7080" }}>
          Generate one-time install tokens for each endpoint
        </p>
      </div>

      {/* Platform cards — auto-fit so the 3-up desktop layout collapses to 2-up
          on tablets and 1-up on phones without a media query. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
        {platforms.map(({ id, label, icon: Icon, ext, desc }) => (
          <Card key={id} style={{ transition: "border-color 0.15s" }}>
            <CardContent
              style={{
                padding: "24px 20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "10px",
                  background: "#FFFFFF",
                  border: "1px solid #DDE3EA",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon style={{ width: "20px", height: "20px", color: "#5A7080" }} />
              </div>
              <div>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "#0E1C29", marginBottom: "4px" }}>
                  {label}
                </p>
                <p style={{ fontSize: "11px", color: "#8A9BAB" }}>{desc}</p>
              </div>
              <button
                onClick={() => generate(id)}
                disabled={generating === id}
                style={{
                  width: "100%",
                  height: "34px",
                  borderRadius: "6px",
                  border: "1px solid #DDE3EA",
                  background: generating === id ? "#FFFFFF" : "#0E1C29",
                  color: generating === id ? "#5A7080" : "white",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: generating === id ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  opacity: generating === id ? 0.7 : 1,
                  transition: "all 0.15s",
                }}
              >
                {generating === id ? (
                  <>
                    <Loader2 style={{ width: "12px", height: "12px" }} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download style={{ width: "12px", height: "12px" }} />
                    Generate .{ext}
                  </>
                )}
              </button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Installation instructions */}
      <Card>
        <CardHeader>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
            <CardTitle>How to install the agent</CardTitle>
            <div style={{ display: "flex", gap: "4px", padding: "3px", background: "#F4F6F8", borderRadius: "8px", border: "1px solid #DDE3EA" }}>
              {instructionTabs.map(({ id, label, icon: TabIcon }) => {
                const isActive = activeOs === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveOs(id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: 500,
                      borderRadius: "6px",
                      border: "1px solid",
                      borderColor: isActive ? "#DDE3EA" : "transparent",
                      background: isActive ? "#FFFFFF" : "transparent",
                      color: isActive ? "#0E1C29" : "#5A7080",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <TabIcon style={{ width: "13px", height: "13px" }} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 14px",
              background: "#F4F6F8",
              border: "1px solid #DDE3EA",
              borderRadius: "8px",
              marginBottom: "20px",
            }}
          >
            <ShieldCheck style={{ width: "16px", height: "16px", color: "#00875A", flexShrink: 0 }} />
            <div style={{ fontSize: "12px", color: "#5A7080", lineHeight: 1.5 }}>
              The installer file is{" "}
              <code
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "11px",
                  color: "#0E1C29",
                  background: "#FFFFFF",
                  border: "1px solid #DDE3EA",
                  borderRadius: "4px",
                  padding: "1px 6px",
                }}
              >
                {activeInstructions.filename}
              </code>{" "}
              and must be run as <strong style={{ color: "#0E1C29" }}>{activeInstructions.runAs}</strong>. The download token is one-time use and binds the endpoint to your account on first run.
            </div>
          </div>

          <ol style={{ display: "flex", flexDirection: "column", gap: "16px", margin: 0, padding: 0, listStyle: "none", counterReset: "step" }}>
            {activeInstructions.steps.map((step, idx) => {
              const cmdKey = `${activeOs}-${idx}`;
              return (
                <li
                  key={cmdKey}
                  style={{
                    display: "flex",
                    gap: "14px",
                    paddingBottom: idx === activeInstructions.steps.length - 1 ? 0 : "16px",
                    borderBottom: idx === activeInstructions.steps.length - 1 ? "none" : "1px solid #EEF1F4",
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      background: "#0E1C29",
                      color: "#FFFFFF",
                      fontSize: "11px",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "#0E1C29", marginBottom: "4px" }}>{step.title}</p>
                    <p style={{ fontSize: "12px", color: "#5A7080", lineHeight: 1.5, marginBottom: step.code ? "10px" : 0 }}>{step.body}</p>
                    {step.code && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "stretch",
                          background: "#0E1C29",
                          borderRadius: "6px",
                          overflow: "hidden",
                        }}
                      >
                        <pre
                          style={{
                            flex: 1,
                            margin: 0,
                            padding: "10px 14px",
                            fontFamily: "var(--font-mono, monospace)",
                            fontSize: "12px",
                            color: "#E8F0FF",
                            overflowX: "auto",
                            whiteSpace: "pre",
                          }}
                        >
                          {renderCode(step.code)}
                        </pre>
                        <button
                          onClick={() => copyCommand(renderCode(step.code!), cmdKey)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "0 12px",
                            background: "transparent",
                            border: "none",
                            borderLeft: "1px solid #1C2E4A",
                            color: copiedCmdKey === cmdKey ? "#00D68F" : "#8A9BAB",
                            cursor: "pointer",
                            transition: "color 0.15s",
                          }}
                          aria-label="Copy command"
                        >
                          {copiedCmdKey === cmdKey ? (
                            <CheckCheck style={{ width: "14px", height: "14px" }} />
                          ) : (
                            <Copy style={{ width: "14px", height: "14px" }} />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {/* History table */}
      <Card>
        <CardHeader>
          <CardTitle>Generated Installers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
              <Loader2 style={{ width: "18px", height: "18px", color: "#8A9BAB" }} className="animate-spin" />
            </div>
          ) : downloads.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 20px",
                fontSize: "12px",
                color: "#8A9BAB",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              No installers generated yet
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #DDE3EA" }}>
                    {["Platform", "Version", "Created", "Status", ""].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "10px 20px",
                          fontSize: "10px",
                          fontWeight: 600,
                          color: "#8A9BAB",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          fontFamily: "var(--font-mono, monospace)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {downloads.map((d) => (
                    <tr key={d.id} style={{ borderBottom: "1px solid #DDE3EA" }}>
                      <td
                        style={{
                          padding: "10px 20px",
                          color: "#0E1C29",
                          textTransform: "capitalize",
                          fontSize: "13px",
                        }}
                      >
                        {d.platform}
                      </td>
                      <td
                        style={{
                          padding: "10px 20px",
                          fontFamily: "var(--font-mono, monospace)",
                          fontSize: "12px",
                          color: "#5A7080",
                        }}
                      >
                        {d.version}
                      </td>
                      <td style={{ padding: "10px 20px", fontSize: "12px", color: "#5A7080" }}>
                        {formatTimestamp(d.createdAt)}
                      </td>
                      <td style={{ padding: "10px 20px" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 500,
                            color: d.activated ? "#00875A" : "#FFA800",
                          }}
                        >
                          {d.activated ? "Activated" : "Pending"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 20px", textAlign: "right" }}>
                        <button
                          onClick={() => copyUrl(d.downloadToken, d.id)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            fontSize: "11px",
                            color: copiedId === d.id ? "#00875A" : "#5A7080",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            transition: "color 0.15s",
                          }}
                        >
                          {copiedId === d.id ? (
                            <CheckCheck style={{ width: "12px", height: "12px" }} />
                          ) : (
                            <Copy style={{ width: "12px", height: "12px" }} />
                          )}
                          {copiedId === d.id ? "Copied" : "Copy URL"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
