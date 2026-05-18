import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/downloads/:token — serve the agent package
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const download = await prisma.agentDownload.findUnique({
      where: { downloadToken: token },
    });

    if (!download) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Return a minimal shell script that acts as the "agent installer"
    // In production this would be a real compiled binary
    const installScript = generateInstallScript(
      download.platform,
      token,
      `${process.env.NEXTAUTH_URL}/api`
    );

    const filename =
      download.platform === "windows"
        ? "overra-agent-installer.ps1"
        : "overra-agent-install.sh";

    const contentType =
      download.platform === "windows"
        ? "application/x-powershell"
        : "text/x-sh";

    return new NextResponse(installScript, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/downloads/:token error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

function generateInstallScript(
  platform: string,
  token: string,
  apiBase: string
): string {
  if (platform === "windows") {
    return `# Overra Agent Installer (Windows)
# Run as Administrator in PowerShell

$API_BASE = "${apiBase}"
$DOWNLOAD_TOKEN = "${token}"
$HOSTNAME_VAL = $env:COMPUTERNAME

Write-Host "[overra] Authenticating with portal..."

$body = @{
  download_token = $DOWNLOAD_TOKEN
  hostname       = $HOSTNAME_VAL
  os             = "windows"
  agent_version  = "v0.2"
} | ConvertTo-Json

try {
  $response = Invoke-RestMethod -Uri "$API_BASE/agent/authenticate" \`
    -Method POST -Body $body -ContentType "application/json"
} catch {
  Write-Host "[overra] Authentication failed: $_"
  exit 1
}

$AGENT_TOKEN = $response.agent_token

# Write config before installing the service so the binary can find it.
# Use .NET directly to write UTF-8 WITHOUT a BOM — PowerShell 5.x's
# -Encoding utf8 writes a BOM that breaks Go's json.Unmarshal.
$configDir = "$env:ProgramData\\Overra"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
$configJson = (@{ agent_token = $AGENT_TOKEN; api_base = $API_BASE } | ConvertTo-Json -Compress)
[System.IO.File]::WriteAllText("$configDir\\config.json", "$configJson\`n", [System.Text.UTF8Encoding]::new($false))
Write-Host "[overra] Config written to $configDir\\config.json"

# Restrict config to SYSTEM and Administrators only — it contains the agent JWT.
$acl = Get-Acl "$configDir\\config.json"
$acl.SetAccessRuleProtection($true, $false)
$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new("SYSTEM", "FullControl", "Allow"))
$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new("Administrators", "FullControl", "Allow"))
Set-Acl -Path "$configDir\\config.json" -AclObject $acl
Write-Host "[overra] Config permissions set (SYSTEM + Administrators only)."

# Download the pre-built Go binary.
$binaryDir = "$env:ProgramFiles\\Overra"
New-Item -ItemType Directory -Force -Path $binaryDir | Out-Null
$binaryPath = "$binaryDir\\overra-agent.exe"

Write-Host "[overra] Downloading agent binary (windows/amd64)..."
Invoke-WebRequest \`
  -Uri "$API_BASE/agent/binary?os=windows&arch=amd64" \`
  -Headers @{ Authorization = "Bearer $AGENT_TOKEN" } \`
  -OutFile $binaryPath

# Register as a Windows Service via kardianos/service.
Write-Host "[overra] Installing system service..."
& $binaryPath --install

Write-Host "[overra] Installation complete."
`;
  }

  // Linux / macOS bash installer — must be run as root for system service.
  // Earlier versions used `curl -s` + python3 + 2>/dev/null which hid three
  // failure modes at once (network error, python3 absent on macOS, JSON parse
  // error). This version checks HTTP status explicitly, parses JSON without
  // python, and prints diagnostic info on every failure path.
  return `#!/bin/bash
# Overra Agent Installer (${platform})
# Run as root: sudo bash overra-agent-install.sh

set -euo pipefail

API_BASE="${apiBase}"
DOWNLOAD_TOKEN="${token}"
HOSTNAME_VAL=$(hostname -s)
BINARY_PATH="/usr/local/bin/overra-agent"
CONFIG_DIR="/etc/overra"

log()  { printf '[overra] %s\\n' "$*"; }
warn() { printf '[overra] WARN: %s\\n' "$*" >&2; }
die()  { printf '[overra] ERROR: %s\\n' "$*" >&2; exit 1; }

# Surface silent set -e exits with a line number so future regressions
# can't hide the same way the python3 path did.
trap 'rc=$?; if [ $rc -ne 0 ]; then printf "[overra] ERROR: installer aborted at line $LINENO (exit $rc)\\n" >&2; fi' ERR

# Detect architecture.
ARCH_RAW=$(uname -m)
case "$ARCH_RAW" in
  x86_64)        ARCH_VAL="amd64" ;;
  aarch64|arm64) ARCH_VAL="arm64" ;;
  *) die "Unsupported architecture: $ARCH_RAW" ;;
esac

OS_VAL=$(uname -s | tr '[:upper:]' '[:lower:]')

log "Overra agent installer"
log "  target:   $OS_VAL/$ARCH_VAL on $HOSTNAME_VAL"
log "  portal:   $API_BASE"
log "  binary:   $BINARY_PATH"
log "  config:   $CONFIG_DIR/config.json"
log ""
log "[1/4] Authenticating with portal..."

AUTH_BODY='{"download_token":"'"$DOWNLOAD_TOKEN"'","hostname":"'"$HOSTNAME_VAL"'","os":"'"$OS_VAL"'","agent_version":"v0.2"}'

AUTH_RESPONSE_FILE=$(mktemp -t overra-auth.XXXXXX)
trap 'rm -f "$AUTH_RESPONSE_FILE"' EXIT

# --connect-timeout fails fast on unreachable host. We deliberately do NOT
# use -f so we can see the body of a non-2xx response.
HTTP_STATUS=$(curl -sS --connect-timeout 10 --max-time 30 \\
  -o "$AUTH_RESPONSE_FILE" \\
  -w "%{http_code}" \\
  -X POST "$API_BASE/agent/authenticate" \\
  -H "Content-Type: application/json" \\
  -d "$AUTH_BODY" \\
  || true)

# "000" is curl's convention for "no HTTP response at all" (TCP refused, DNS
# failure, timeout).
if [ -z "$HTTP_STATUS" ] || [ "$HTTP_STATUS" = "000" ]; then
  warn "Could not reach $API_BASE"
  warn "  - Is the portal running?"
  warn "  - Is that URL reachable from THIS machine? (localhost won't work across machines.)"
  warn "  - If using ngrok or another tunnel, confirm the tunnel is up and matches the portal's NEXTAUTH_URL."
  die  "Aborting before any files were written."
fi

AUTH_BODY_RESPONSE=$(cat "$AUTH_RESPONSE_FILE")

if [ "$HTTP_STATUS" != "200" ]; then
  warn "Portal returned HTTP $HTTP_STATUS at POST $API_BASE/agent/authenticate"
  warn "Response body:"
  printf '%s\\n' "$AUTH_BODY_RESPONSE" >&2
  die  "Authentication rejected. The download token may be expired or already used."
fi

# Portable JSON extraction — no python required. The agent_token value is a
# compact JWT (base64url, no embedded quotes), so a single regex is safe.
AGENT_TOKEN=$(printf '%s' "$AUTH_BODY_RESPONSE" | sed -nE 's/.*"agent_token"[[:space:]]*:[[:space:]]*"([^"]+)".*/\\1/p')

if [ -z "$AGENT_TOKEN" ]; then
  warn "Portal returned HTTP 200 but the response did not contain an agent_token field."
  warn "Response body:"
  printf '%s\\n' "$AUTH_BODY_RESPONSE" >&2
  die  "Cannot continue without an agent token."
fi

AGENT_TOKEN_LEN=$(printf '%s' "$AGENT_TOKEN" | wc -c | tr -d ' ')
log "  ok - agent token received (length: $AGENT_TOKEN_LEN)"

log "[2/4] Writing config to $CONFIG_DIR/config.json..."
mkdir -p "$CONFIG_DIR"
printf '{"agent_token":"%s","api_base":"%s"}\\n' "$AGENT_TOKEN" "$API_BASE" > "$CONFIG_DIR/config.json"
chmod 600 "$CONFIG_DIR/config.json"
log "  ok - config written (chmod 600)"

log "[3/4] Downloading agent binary ($OS_VAL/$ARCH_VAL)..."
BIN_STATUS=$(curl -sS --connect-timeout 10 --max-time 120 \\
  -w "%{http_code}" \\
  -H "Authorization: Bearer $AGENT_TOKEN" \\
  "$API_BASE/agent/binary?os=$OS_VAL&arch=$ARCH_VAL" \\
  -o "$BINARY_PATH" \\
  || true)

if [ -z "$BIN_STATUS" ] || [ "$BIN_STATUS" = "000" ]; then
  die "Binary download failed: could not reach $API_BASE."
fi

if [ "$BIN_STATUS" != "200" ]; then
  warn "Binary download failed with HTTP $BIN_STATUS."
  if [ -s "$BINARY_PATH" ]; then
    warn "Server response (first 500 bytes):"
    head -c 500 "$BINARY_PATH" >&2 || true
  fi
  rm -f "$BINARY_PATH"
  die "Aborting."
fi

chmod +x "$BINARY_PATH"
BIN_SIZE=$(wc -c < "$BINARY_PATH" | tr -d ' ')
log "  ok - binary installed at $BINARY_PATH ($BIN_SIZE bytes)"

log "[4/4] Registering system service..."
if ! "$BINARY_PATH" --install; then
  die "Agent binary refused to install itself as a system service. Run '$BINARY_PATH --install' manually to see the error."
fi
log "  ok - service registered"

log ""
log "Installation complete."
case "$OS_VAL" in
  darwin)
    log "Verify on macOS:  sudo launchctl list | grep overra"
    log "View logs:        log show --predicate 'process == \\"overra-agent\\"' --last 5m"
    ;;
  linux)
    log "Verify on Linux:  systemctl status overra-agent"
    log "View logs:        journalctl -u overra-agent -f"
    ;;
esac
`;
}
