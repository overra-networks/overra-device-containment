#!/usr/bin/env python3
"""
Overra Agent — polls the portal for containment state and enforces it locally.
Config is read from ~/.config/overra/config.json or /etc/overra/config.json.
"""

import json
import os
import signal
import socket
import subprocess
import sys
import time

import requests

CONFIG_PATHS = [
    os.path.expanduser("~/.config/overra/config.json"),
    "/etc/overra/config.json",
]

POLL_INTERVAL = 10  # seconds


def load_config():
    for path in CONFIG_PATHS:
        if os.path.exists(path):
            with open(path) as f:
                return json.load(f)
    raise FileNotFoundError(
        f"No Overra config found. Checked: {CONFIG_PATHS}\n"
        "Run the installer first."
    )


def lock_screen():
    """Lock the screen using the first working method."""
    methods = [
        ["loginctl", "lock-sessions"],
        ["dbus-send", "--session",
         "--dest=org.freedesktop.ScreenSaver",
         "/org/freedesktop/ScreenSaver",
         "org.freedesktop.ScreenSaver.Lock"],
        ["xdg-screensaver", "lock"],
        ["gnome-screensaver-command", "--lock"],
        ["dm-tool", "lock"],
    ]
    for cmd in methods:
        try:
            r = subprocess.run(cmd, timeout=5, capture_output=True)
            if r.returncode == 0:
                return True, None
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
    return False, "No screen lock method succeeded"


def disable_network():
    """Try to disable network. May require elevated privileges."""
    methods = [
        ["nmcli", "networking", "off"],
    ]
    for cmd in methods:
        try:
            r = subprocess.run(cmd, timeout=5, capture_output=True)
            if r.returncode == 0:
                return True, None
            return False, r.stderr.decode().strip() or "Permission denied"
        except FileNotFoundError:
            continue
    return False, "nmcli not available"


def revoke_sessions():
    """Terminate all other login sessions for this user, skipping the current
    session so the agent daemon is not killed by its own action."""
    current_session = os.environ.get("XDG_SESSION_ID", "")
    user = os.environ.get("USER") or os.environ.get("LOGNAME") or ""

    if not user:
        return False, "Could not determine current user"

    try:
        r = subprocess.run(
            ["loginctl", "list-sessions", "--no-legend"],
            timeout=5, capture_output=True, text=True,
        )
        if r.returncode != 0:
            return False, r.stderr.strip() or "loginctl list-sessions failed"

        terminated = 0
        for line in r.stdout.splitlines():
            parts = line.split()
            if len(parts) < 3:
                continue
            session_id, _uid, session_user = parts[0], parts[1], parts[2]
            if session_user != user:
                continue
            if session_id == current_session:
                continue  # never terminate our own session
            try:
                subprocess.run(
                    ["loginctl", "terminate-session", session_id],
                    timeout=5, capture_output=True,
                )
                terminated += 1
            except (FileNotFoundError, subprocess.TimeoutExpired):
                pass

        return True, f"Terminated {terminated} other session(s)"
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        return False, str(e)


def _browser_pids(stopped_only: bool = False) -> list[int]:
    """Return PIDs of browser-related processes, optionally only those in
    stopped (T) state (used when deciding what to SIGCONT on release)."""
    browsers = ["chrome", "chromium", "firefox", "brave"]
    pids = []
    try:
        r = subprocess.run(
            ["ps", "ax", "-o", "pid,stat,comm"],
            capture_output=True, text=True,
        )
        for line in r.stdout.splitlines():
            parts = line.strip().split(None, 2)
            if len(parts) != 3:
                continue
            pid_s, stat, comm = parts
            if stopped_only and "T" not in stat:
                continue
            if any(b in comm.lower() for b in browsers):
                try:
                    pids.append(int(pid_s))
                except ValueError:
                    pass
    except Exception:
        pass
    return pids


def freeze_extensions():
    """Send SIGSTOP to browser processes to suspend extension activity."""
    stopped = 0
    for pid in _browser_pids(stopped_only=False):
        try:
            os.kill(pid, signal.SIGSTOP)
            stopped += 1
        except (ProcessLookupError, PermissionError):
            pass
    return True, f"Froze {stopped} browser process(es)"


def unfreeze_extensions():
    """Send SIGCONT to browser processes that are currently in stopped state.
    Called automatically when containment is released so browsers don't remain
    suspended indefinitely."""
    continued = 0
    for pid in _browser_pids(stopped_only=True):
        try:
            os.kill(pid, signal.SIGCONT)
            continued += 1
        except (ProcessLookupError, PermissionError):
            pass
    return True, f"Resumed {continued} stopped browser process(es)"


ACTION_MAP = {
    "screen_locked":       ("screen_lock",        lock_screen,        "Agent: screen locked"),
    "network_disabled":    ("network_disable",     disable_network,    "Agent: network interfaces disabled"),
    "sessions_revoked":    ("sessions_revoke",     revoke_sessions,    "Agent: sessions revoked"),
    "extensions_frozen":   ("extensions_freeze",   freeze_extensions,  "Agent: extensions frozen"),
}


def report(http: requests.Session, api_base: str, token: str,
           action: str, result: str, error: str | None = None):
    try:
        http.post(
            f"{api_base}/agent/action/result",
            json={"action": action, "result": result,
                  **({"error": error} if error else {})},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
    except Exception:
        pass


def main():
    try:
        config = load_config()
    except FileNotFoundError as e:
        print(f"[overra-agent] {e}", file=sys.stderr)
        sys.exit(1)

    token = config["agent_token"]
    api_base = config["api_base"].rstrip("/")
    hostname = socket.gethostname()

    http = requests.Session()
    applied: set[str] = set()
    prev_status = None

    print(f"[overra-agent] Started. API={api_base} host={hostname}")
    sys.stdout.flush()

    while True:
        try:
            resp = http.post(
                f"{api_base}/agent/heartbeat",
                json={"status_report": {"hostname": hostname}},
                headers={"Authorization": f"Bearer {token}"},
                timeout=15,
            )

            if resp.status_code == 401:
                print("[overra-agent] Token rejected — re-install required.", file=sys.stderr)
                sys.exit(1)

            if resp.status_code != 200:
                print(f"[overra-agent] Heartbeat returned {resp.status_code}", file=sys.stderr)
                time.sleep(POLL_INTERVAL)
                continue

            state = resp.json()
            status = state.get("status", "normal")

            if status != prev_status:
                print(f"[overra-agent] Status changed: {prev_status} → {status}")
                sys.stdout.flush()

            # Containment lifted: reset applied set and SIGCONT any frozen browsers
            if prev_status == "contained" and status != "contained":
                applied.clear()
                print("[overra-agent] Containment released — unfreezing browser processes")
                sys.stdout.flush()
                ok, msg = unfreeze_extensions()
                report(http, api_base, token,
                       "Agent: extensions unfrozen",
                       "executed" if ok else "failed",
                       None if ok else msg)
                print(f"[overra-agent]   → {msg}")
                sys.stdout.flush()

            prev_status = status

            if status == "contained":
                for flag_key, (action_id, fn, event_name) in ACTION_MAP.items():
                    if state.get(flag_key) and action_id not in applied:
                        applied.add(action_id)
                        print(f"[overra-agent] Executing: {event_name}")
                        sys.stdout.flush()
                        ok, err = fn()
                        report(http, api_base, token, event_name,
                               "executed" if ok else "failed", err)
                        print(f"[overra-agent]   → {'ok' if ok else 'failed: ' + str(err)}")
                        sys.stdout.flush()

        except requests.exceptions.RequestException as e:
            print(f"[overra-agent] Network error: {e}", file=sys.stderr)

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
