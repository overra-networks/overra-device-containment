//go:build linux

package main

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
)

// LockScreen tries multiple screen-lock mechanisms.
//
// When the agent runs as a systemd service (the kardianos default), it executes
// as root in a system context with no DBUS_SESSION_BUS_ADDRESS set, so the
// user-session methods (loginctl lock-session, qdbus, xdg-screensaver,
// gnome-screensaver-command) cannot reach the user's D-Bus and silently fail.
// Order matters: when running as root, try the system-bus method
// (`loginctl lock-sessions`, plural) FIRST. As a regular user (development),
// try the user-session methods first.
//
// `loginctl lock-sessions` talks to systemd-logind over the system bus and
// instructs it to broadcast a Lock signal to every active session — it does
// not need any per-session D-Bus address, and is the canonical answer for a
// privileged daemon.
func LockScreen() error {
	userBusMethods := [][]string{
		{"loginctl", "lock-session"},
		{"qdbus", "org.kde.screensaver", "/ScreenSaver", "Lock"},
		{"xdg-screensaver", "lock"},
		{"gnome-screensaver-command", "--lock"},
		{"dm-tool", "lock"},
	}
	rootMethods := [][]string{
		{"loginctl", "lock-sessions"},
		{"dm-tool", "lock"},
	}

	var methods [][]string
	if os.Geteuid() == 0 {
		methods = append(methods, rootMethods...)
		// Fall through anyway: some configurations forward the user bus via
		// XDG_RUNTIME_DIR even to a root service.
		methods = append(methods, userBusMethods...)
	} else {
		methods = append(methods, userBusMethods...)
		methods = append(methods, []string{"loginctl", "lock-sessions"})
	}

	for _, cmd := range methods {
		if err := exec.Command(cmd[0], cmd[1:]...).Run(); err == nil {
			return nil
		}
	}
	return fmt.Errorf("no screen lock method succeeded")
}

// setNetworkState brings every non-loopback, non-virtual interface up or down.
// state must be "up" or "down"; nmcliAction must be "on" or "off".
func setNetworkState(state, nmcliAction string) error {
	ifaces, err := net.Interfaces()
	if err != nil {
		return fmt.Errorf("enumerate interfaces: %w", err)
	}

	var errs []string
	attempted := 0
	for _, iface := range ifaces {
		// Skip loopback and virtual/container bridges.
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		name := iface.Name
		if strings.HasPrefix(name, "lo") ||
			strings.HasPrefix(name, "docker") ||
			strings.HasPrefix(name, "veth") ||
			strings.HasPrefix(name, "br-") {
			continue
		}
		attempted++
		if err := exec.Command("ip", "link", "set", name, state).Run(); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", name, err))
		}
	}

	// If `ip` failed on every attempted interface, try nmcli as a fallback.
	// Compare against attempted (not len(ifaces)) — loopback/virtual were skipped.
	if attempted > 0 && len(errs) == attempted {
		if err := exec.Command("nmcli", "networking", nmcliAction).Run(); err != nil {
			return fmt.Errorf("ip and nmcli both failed: %v", strings.Join(errs, "; "))
		}
	}
	return nil
}

// DisableNetwork brings every non-loopback, non-virtual interface down using
// the `ip` tool (requires CAP_NET_ADMIN). Falls back to nmcli if `ip` fails.
func DisableNetwork() error {
	return setNetworkState("down", "off")
}

// EnableNetwork brings every non-loopback, non-virtual interface back up.
// Mirrors DisableNetwork — called on containment release.
func EnableNetwork() error {
	return setNetworkState("up", "on")
}

// RevokeSessions terminates all loginctl sessions except the agent's own
// (identified by $XDG_SESSION_ID, which is empty for system services — so
// when running as a system service all sessions are safely terminated).
func RevokeSessions() error {
	currentSession := os.Getenv("XDG_SESSION_ID")

	out, err := exec.Command("loginctl", "list-sessions", "--no-legend").Output()
	if err != nil {
		return fmt.Errorf("loginctl list-sessions: %w", err)
	}

	terminated := 0
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 1 {
			continue
		}
		sessionID := fields[0]
		if sessionID == currentSession {
			continue // never terminate our own session
		}
		exec.Command("loginctl", "terminate-session", sessionID).Run() //nolint:errcheck
		terminated++
	}

	if terminated == 0 && strings.TrimSpace(string(out)) != "" {
		return fmt.Errorf("no sessions terminated")
	}
	return nil
}

// browserNames are substrings matched against /proc/<pid>/comm.
var browserNames = []string{"chrome", "chromium", "firefox", "brave", "msedge"}

// FreezeProcesses sends SIGSTOP to all browser-related processes.
// Uses /proc directly — no exec dependency, works as root or with CAP_KILL.
func FreezeProcesses() error {
	pids, err := browserpids(false)
	if err != nil {
		return err
	}
	var errs []string
	for _, pid := range pids {
		if err := syscall.Kill(pid, syscall.SIGSTOP); err != nil {
			errs = append(errs, fmt.Sprintf("pid %d: %v", pid, err))
		}
	}
	if len(errs) > 0 && len(errs) == len(pids) {
		return fmt.Errorf("all SIGSTOP calls failed: %s", strings.Join(errs, "; "))
	}
	return nil
}

// UnfreezeProcesses sends SIGCONT to any browser processes currently in the
// stopped state (stat field = 'T'). Safe to call on non-stopped processes.
func UnfreezeProcesses() error {
	pids, err := browserpids(true) // stopped only
	if err != nil {
		return err
	}
	for _, pid := range pids {
		syscall.Kill(pid, syscall.SIGCONT) //nolint:errcheck
	}
	return nil
}

// browserpids enumerates /proc for browser PIDs. If stoppedOnly is true,
// only returns PIDs whose stat state character is 'T' (stopped/traced).
func browserpids(stoppedOnly bool) ([]int, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, fmt.Errorf("read /proc: %w", err)
	}

	var pids []int
	for _, e := range entries {
		pid, err := strconv.Atoi(e.Name())
		if err != nil {
			continue // not a PID directory
		}

		if stoppedOnly {
			stat, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
			if err != nil {
				continue
			}
			// Format: "pid (comm) state ..."
			// Find the closing paren and read the state character after it.
			s := string(stat)
			rp := strings.LastIndex(s, ")")
			if rp < 0 || rp+2 >= len(s) {
				continue
			}
			if s[rp+2] != 'T' { // T = stopped, t = traced
				continue
			}
		}

		comm, err := os.ReadFile(fmt.Sprintf("/proc/%d/comm", pid))
		if err != nil {
			continue
		}
		name := strings.ToLower(strings.TrimSpace(string(comm)))
		for _, b := range browserNames {
			if strings.Contains(name, b) {
				pids = append(pids, pid)
				break
			}
		}
	}
	return pids, nil
}
