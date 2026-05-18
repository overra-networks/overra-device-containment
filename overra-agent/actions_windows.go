//go:build windows

package main

import (
	"fmt"
	"net"
	"os/exec"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

// user32 / kernel32 / ntdll lazy-loaded DLLs.
var (
	user32               = windows.NewLazySystemDLL("user32.dll")
	procLockWorkStation  = user32.NewProc("LockWorkStation")

	wtsapi32                  = windows.NewLazySystemDLL("wtsapi32.dll")
	procWTSEnumerateSessions  = wtsapi32.NewProc("WTSEnumerateSessionsW")
	procWTSLogoffSession      = wtsapi32.NewProc("WTSLogoffSession")
	procWTSFreeMemory         = wtsapi32.NewProc("WTSFreeMemory")

	ntdll                 = windows.NewLazySystemDLL("ntdll.dll")
	procNtSuspendProcess  = ntdll.NewProc("NtSuspendProcess")
	procNtResumeProcess   = ntdll.NewProc("NtResumeProcess")
)

// wtsSessionInfo mirrors WTS_SESSION_INFOW.
type wtsSessionInfo struct {
	SessionID      uint32
	WinStationName *uint16
	State          uint32
}

const wtsActive uint32 = 0 // WTSActive

// LockScreen locks the active interactive desktop.
//
// When the agent runs as a LocalSystem service it lives in session 0, which
// is non-interactive on Vista+ (Session 0 Isolation). Calling LockWorkStation
// directly from session 0 succeeds but locks nothing — there is no desktop in
// session 0 to lock. The fix is to find the active console session, obtain a
// user token for it via WTSQueryUserToken, and use CreateProcessAsUser to
// spawn rundll32.exe user32.dll,LockWorkStation in the user's own session
// where LockWorkStation actually has a desktop to act on.
//
// When the agent runs interactively (e.g., during development under a user
// account), the LocalSystem branch is skipped and the direct API call works.
func LockScreen() error {
	inSession0, err := isSessionZero()
	if err != nil {
		// If we can't tell, assume non-zero — at worst, the direct call locks
		// nothing on a misconfigured machine, which matches today's behaviour.
		inSession0 = false
	}
	if !inSession0 {
		r, _, callErr := procLockWorkStation.Call()
		if r == 0 {
			return fmt.Errorf("LockWorkStation: %w", callErr)
		}
		return nil
	}
	return lockViaUserSession()
}

// isSessionZero returns true if the current process's session ID is 0.
// LocalSystem services on Vista+ start in session 0; interactive logons start
// in session 1 or higher.
func isSessionZero() (bool, error) {
	pid := windows.GetCurrentProcessId()
	var sessionID uint32
	if err := windows.ProcessIdToSessionId(pid, &sessionID); err != nil {
		return false, fmt.Errorf("ProcessIdToSessionId: %w", err)
	}
	return sessionID == 0, nil
}

// lockViaUserSession spawns rundll32.exe user32.dll,LockWorkStation as the
// user logged into the active console session. The spawned process runs in
// the user's session and so LockWorkStation has a desktop to lock.
//
// 0xFFFFFFFF returned by WTSGetActiveConsoleSessionId means no user is logged
// in at the console — in that case there is nothing to lock, so we return
// nil (a locked-out machine is the desired end state regardless).
func lockViaUserSession() error {
	sessionID := windows.WTSGetActiveConsoleSessionId()
	if sessionID == 0xFFFFFFFF {
		return nil
	}

	var userToken windows.Token
	if err := windows.WTSQueryUserToken(sessionID, &userToken); err != nil {
		return fmt.Errorf("WTSQueryUserToken(session=%d): %w", sessionID, err)
	}
	defer userToken.Close() //nolint:errcheck

	cmdLine, err := windows.UTF16PtrFromString(`rundll32.exe user32.dll,LockWorkStation`)
	if err != nil {
		return fmt.Errorf("UTF16PtrFromString: %w", err)
	}

	var si windows.StartupInfo
	si.Cb = uint32(unsafe.Sizeof(si))
	// Desktop must be the interactive winsta0\default desktop, otherwise the
	// spawned rundll32 has no desktop to talk to.
	desktop, err := windows.UTF16PtrFromString(`winsta0\default`)
	if err != nil {
		return fmt.Errorf("UTF16PtrFromString(desktop): %w", err)
	}
	si.Desktop = desktop

	var pi windows.ProcessInformation
	if err := windows.CreateProcessAsUser(
		userToken,
		nil,      // appName (taken from cmdLine)
		cmdLine,  // commandLine
		nil, nil, // process/thread security attrs
		false, // inheritHandles
		0,     // creationFlags
		nil,   // environment
		nil,   // currentDir
		&si,
		&pi,
	); err != nil {
		return fmt.Errorf("CreateProcessAsUser: %w", err)
	}
	windows.CloseHandle(pi.Thread)  //nolint:errcheck
	windows.CloseHandle(pi.Process) //nolint:errcheck
	return nil
}

// DisableNetwork disables every non-loopback network adapter via netsh.
// Running as LocalSystem gives sufficient privilege.
func DisableNetwork() error {
	ifaces, err := net.Interfaces()
	if err != nil {
		return fmt.Errorf("enumerate interfaces: %w", err)
	}

	var errs []string
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		if err := exec.Command(
			"netsh", "interface", "set", "interface", iface.Name, "disabled",
		).Run(); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", iface.Name, err))
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("partial failure: %s", strings.Join(errs, "; "))
	}
	return nil
}

// EnableNetwork re-enables every non-loopback adapter disabled by DisableNetwork.
func EnableNetwork() error {
	ifaces, err := net.Interfaces()
	if err != nil {
		return fmt.Errorf("enumerate interfaces: %w", err)
	}

	var errs []string
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		if err := exec.Command(
			"netsh", "interface", "set", "interface", iface.Name, "enabled",
		).Run(); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", iface.Name, err))
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("partial failure: %s", strings.Join(errs, "; "))
	}
	return nil
}

// RevokeSessions enumerates active WTS sessions and logs them off.
func RevokeSessions() error {
	// Typed pointer (not uintptr) so go vet doesn't flag the
	// uintptr-to-unsafe.Pointer conversion further down. The OS writes the
	// address of an array of wtsSessionInfo here; we read it back as a slice.
	var pSessions *wtsSessionInfo
	var count uint32

	ret, _, err := procWTSEnumerateSessions.Call(
		0, // WTS_CURRENT_SERVER_HANDLE
		0, 1,
		uintptr(unsafe.Pointer(&pSessions)),
		uintptr(unsafe.Pointer(&count)),
	)
	if ret == 0 {
		return fmt.Errorf("WTSEnumerateSessionsW: %w", err)
	}
	defer procWTSFreeMemory.Call(uintptr(unsafe.Pointer(pSessions))) //nolint:errcheck

	sessions := unsafe.Slice(pSessions, count)

	loggedOff := 0
	for _, s := range sessions {
		if s.State != wtsActive {
			continue
		}
		// WTSLogoffSession(server, sessionId, bWait=FALSE)
		procWTSLogoffSession.Call(0, uintptr(s.SessionID), 0) //nolint:errcheck
		loggedOff++
	}

	if loggedOff == 0 {
		return fmt.Errorf("no active sessions found to log off")
	}
	return nil
}

var browserExeNames = []string{"chrome.exe", "chromium.exe", "firefox.exe", "brave.exe", "msedge.exe"}

// FreezeProcesses suspends all browser processes via NtSuspendProcess.
func FreezeProcesses() error {
	pids, err := browserPIDs()
	if err != nil {
		return err
	}
	var errs []string
	for _, pid := range pids {
		if err := suspendProcess(pid); err != nil {
			errs = append(errs, fmt.Sprintf("pid %d: %v", pid, err))
		}
	}
	if len(errs) > 0 && len(errs) == len(pids) {
		return fmt.Errorf("all suspend calls failed: %s", strings.Join(errs, "; "))
	}
	return nil
}

// UnfreezeProcesses resumes any currently suspended browser processes.
// NtResumeProcess on a non-suspended process is a no-op.
func UnfreezeProcesses() error {
	pids, err := browserPIDs()
	if err != nil {
		return err
	}
	for _, pid := range pids {
		resumeProcess(pid) //nolint:errcheck
	}
	return nil
}

func suspendProcess(pid uint32) error {
	handle, err := windows.OpenProcess(windows.PROCESS_SUSPEND_RESUME, false, pid)
	if err != nil {
		return fmt.Errorf("OpenProcess: %w", err)
	}
	defer windows.CloseHandle(handle) //nolint:errcheck

	r, _, _ := procNtSuspendProcess.Call(uintptr(handle))
	if r != 0 { // NTSTATUS 0 = success
		return fmt.Errorf("NtSuspendProcess NTSTATUS 0x%X", r)
	}
	return nil
}

func resumeProcess(pid uint32) error {
	handle, err := windows.OpenProcess(windows.PROCESS_SUSPEND_RESUME, false, pid)
	if err != nil {
		return fmt.Errorf("OpenProcess: %w", err)
	}
	defer windows.CloseHandle(handle) //nolint:errcheck

	r, _, _ := procNtResumeProcess.Call(uintptr(handle))
	if r != 0 {
		return fmt.Errorf("NtResumeProcess NTSTATUS 0x%X", r)
	}
	return nil
}

// browserPIDs returns the PIDs of known browser executables using Toolhelp32.
func browserPIDs() ([]uint32, error) {
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, fmt.Errorf("CreateToolhelp32Snapshot: %w", err)
	}
	defer windows.CloseHandle(snapshot) //nolint:errcheck

	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))

	if err := windows.Process32First(snapshot, &entry); err != nil {
		return nil, fmt.Errorf("Process32First: %w", err)
	}

	var pids []uint32
	for {
		name := strings.ToLower(windows.UTF16ToString(entry.ExeFile[:]))
		for _, b := range browserExeNames {
			if name == b {
				pids = append(pids, entry.ProcessID)
				break
			}
		}
		if err := windows.Process32Next(snapshot, &entry); err != nil {
			break
		}
	}
	return pids, nil
}
