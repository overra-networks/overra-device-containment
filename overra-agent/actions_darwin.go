//go:build darwin

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

// LockScreen locks the active macOS GUI session.
//
// The legacy CGSession binary path
// (/System/Library/CoreServices/Menu Extras/User.menu/.../CGSession -suspend)
// was REMOVED in macOS 11 (Big Sur, 2020), so any code targeting it is dead
// on every Mac shipped in the last ~5 years. There is no first-party CLI on
// modern macOS that locks the screen from a root daemon without prerequisites.
//
// Best practical path from a LaunchDaemon running as root:
//   1. Identify the GUI user via the owner of /dev/console.
//   2. Pre-set `askForPassword` on the screensaver in that user's prefs so
//      pmset's display-sleep actually locks (otherwise sleeping the display
//      may not require a password on resume).
//   3. Use `launchctl asuser <uid> osascript -e ...` to send Ctrl+Cmd+Q to
//      System Events. This is the modern "lock screen" hotkey on macOS 10.13+.
//   4. Fall back to `pmset displaysleepnow` (system-wide, no user context),
//      which locks if step 2 succeeded.
//
// Caveat (documented for future reader): step 3 requires the user to have
// granted Accessibility permission to osascript OR to the parent agent
// process — macOS will not prompt for this from a daemon. If it has not been
// granted, osascript exits 0 but no keystroke is delivered. Step 4 is the
// reliable fallback, which is why we always run it on osascript failure.
func LockScreen() error {
	uid, err := currentConsoleUID()
	if err == nil {
		// Best-effort: make sure a display-sleep actually locks for this user.
		// Errors are deliberately ignored — these are belt-and-braces.
		_ = exec.Command(
			"launchctl", "asuser", strconv.Itoa(int(uid)),
			"/usr/bin/defaults", "-currentHost", "write",
			"com.apple.screensaver", "askForPassword", "-int", "1",
		).Run()
		_ = exec.Command(
			"launchctl", "asuser", strconv.Itoa(int(uid)),
			"/usr/bin/defaults", "-currentHost", "write",
			"com.apple.screensaver", "askForPasswordDelay", "-int", "0",
		).Run()

		// Ctrl+Cmd+Q — the system-wide lock-screen hotkey on modern macOS.
		// Needs Accessibility permission for osascript (or the agent).
		hotkey := exec.Command(
			"launchctl", "asuser", strconv.Itoa(int(uid)),
			"/usr/bin/osascript", "-e",
			`tell application "System Events" to keystroke "q" using {control down, command down}`,
		)
		if err := hotkey.Run(); err == nil {
			return nil
		}
	}

	// Fallback: sleep the display. Locks immediately because step 2 just set
	// askForPassword=1 with zero delay. If we never got a UID (no GUI user
	// logged in), there's nothing visible to lock anyway.
	if err := exec.Command("pmset", "displaysleepnow").Run(); err == nil {
		return nil
	}
	return fmt.Errorf("no macOS screen lock method succeeded")
}

// currentConsoleUID returns the UID of the user owning /dev/console — i.e.,
// the user logged into the GUI. Returns an error if root (no one logged in)
// or stat fails. Uses syscall.Stat_t to avoid CGO, which keeps cross-compile
// from Linux working (os/user.LookupId needs CGO on macOS for OpenDirectory).
func currentConsoleUID() (uint32, error) {
	info, err := os.Stat("/dev/console")
	if err != nil {
		return 0, fmt.Errorf("stat /dev/console: %w", err)
	}
	st, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return 0, fmt.Errorf("stat sys cast failed")
	}
	if st.Uid == 0 {
		return 0, fmt.Errorf("no GUI user (console owned by root)")
	}
	return st.Uid, nil
}

// DisableNetwork disables every network service reported by networksetup.
// Requires root.
func DisableNetwork() error {
	out, err := exec.Command("networksetup", "-listallnetworkservices").Output()
	if err != nil {
		return fmt.Errorf("networksetup -listallnetworkservices: %w", err)
	}

	// Also disable interfaces via `ifconfig` in case networksetup misses something.
	ifaces, _ := net.Interfaces()
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		exec.Command("ifconfig", iface.Name, "down").Run() //nolint:errcheck
	}

	lines := strings.Split(string(out), "\n")
	var errs []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "*") || strings.HasPrefix(line, "An asterisk") {
			continue
		}
		if err := exec.Command("networksetup", "-setnetworkserviceenabled", line, "off").Run(); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", line, err))
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("partial failure: %s", strings.Join(errs, "; "))
	}
	return nil
}

// EnableNetwork re-enables every network service that DisableNetwork turned off.
// Mirrors DisableNetwork — called on containment release.
func EnableNetwork() error {
	out, err := exec.Command("networksetup", "-listallnetworkservices").Output()
	if err != nil {
		return fmt.Errorf("networksetup -listallnetworkservices: %w", err)
	}

	// Also bring interfaces back up via `ifconfig`.
	ifaces, _ := net.Interfaces()
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		exec.Command("ifconfig", iface.Name, "up").Run() //nolint:errcheck
	}

	lines := strings.Split(string(out), "\n")
	var errs []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "*") || strings.HasPrefix(line, "An asterisk") {
			continue
		}
		if err := exec.Command("networksetup", "-setnetworkserviceenabled", line, "on").Run(); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", line, err))
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("partial failure: %s", strings.Join(errs, "; "))
	}
	return nil
}

// RevokeSessions logs out all GUI sessions using launchctl.
// Running as root lets us target other users' sessions.
func RevokeSessions() error {
	// List user sessions via `who` and kill their window server / loginwindow.
	out, err := exec.Command("who").Output()
	if err != nil {
		return fmt.Errorf("who: %w", err)
	}

	terminated := 0
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		// who output: username tty date ...
		if len(fields) < 1 || fields[0] == "root" {
			continue
		}
		// Use pkill to kill loginwindow for this user (forces logout).
		exec.Command("pkill", "-u", fields[0], "loginwindow").Run() //nolint:errcheck
		terminated++
	}

	if terminated == 0 {
		return fmt.Errorf("no user sessions found to terminate")
	}
	return nil
}

var browserNames = []string{"Google Chrome", "Chromium", "Firefox", "Brave Browser", "Safari", "Microsoft Edge"}

// FreezeProcesses sends SIGSTOP to browser processes.
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

// UnfreezeProcesses sends SIGCONT to any stopped browser processes.
func UnfreezeProcesses() error {
	pids, err := browserpids(true)
	if err != nil {
		return err
	}
	for _, pid := range pids {
		syscall.Kill(pid, syscall.SIGCONT) //nolint:errcheck
	}
	return nil
}

// browserpids uses `ps` to find browser PIDs.
// If stoppedOnly, filters to processes in stopped state (stat contains 'T').
func browserpids(stoppedOnly bool) ([]int, error) {
	args := []string{"ax", "-o", "pid,stat,comm"}
	out, err := exec.Command("ps", args...).Output()
	if err != nil {
		return nil, fmt.Errorf("ps: %w", err)
	}

	var pids []int
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		pid, err := strconv.Atoi(fields[0])
		if err != nil {
			continue
		}
		stat := fields[1]
		comm := strings.ToLower(strings.Join(fields[2:], " "))

		if stoppedOnly && !strings.Contains(stat, "T") {
			continue
		}

		for _, b := range browserNames {
			if strings.Contains(comm, strings.ToLower(b)) {
				pids = append(pids, pid)
				break
			}
		}
	}
	return pids, nil
}
