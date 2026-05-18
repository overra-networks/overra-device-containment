package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// Config holds the minimum state the agent needs to operate.
// Written by the installer, never modified at runtime.
type Config struct {
	AgentToken string `json:"agent_token"`
	APIBase    string `json:"api_base"`
}

// configPaths returns candidate locations for the config file, most preferred first.
func configPaths() []string {
	switch runtime.GOOS {
	case "windows":
		return []string{
			filepath.Join(os.Getenv("ProgramData"), "Overra", "config.json"),
		}
	default: // linux, darwin
		return []string{
			"/etc/overra/config.json",
			filepath.Join(homeDir(), ".config", "overra", "config.json"),
		}
	}
}

// LoadConfig reads the first valid config file it finds.
func LoadConfig() (*Config, error) {
	for _, path := range configPaths() {
		// Skip paths we can't stat — they don't exist or we lack access.
		if _, err := os.Stat(path); err != nil {
			continue
		}
		cfg, err := loadConfigFromPath(path)
		if err != nil {
			return nil, err
		}
		return cfg, nil
	}
	return nil, fmt.Errorf("no config found (checked: %v) — run the installer first", configPaths())
}

// loadConfigFromPath parses a single config file and validates it.
// Extracted so tests can exercise the read + parse + permission-check path
// against a temp file without going through configPaths().
//
// Fail-closed on bad permissions: the config file contains the agent JWT,
// which authenticates the device to the portal. If the file is readable by
// other local users, a malicious one can copy the JWT and impersonate this
// device until the operator revokes it server-side. Refusing to load with a
// clear error is better than silently running with a leaked credential.
func loadConfigFromPath(path string) (*Config, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("stat %s: %w", path, err)
	}
	if err := verifyConfigPerms(path, info); err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("malformed config at %s: %w", path, err)
	}
	if cfg.AgentToken == "" {
		return nil, fmt.Errorf("config at %s is missing agent_token", path)
	}
	if cfg.APIBase == "" {
		return nil, fmt.Errorf("config at %s is missing api_base", path)
	}
	return &cfg, nil
}

// verifyConfigPerms refuses to load a config whose POSIX mode bits expose the
// agent JWT to other local users. The installer writes the file with mode
// 0600 (owner read+write only); anything looser indicates manual tampering
// or a botched restore.
//
// Windows is exempt because file permissions there are governed by ACLs, not
// POSIX mode bits — os.FileInfo.Mode() returns synthesized bits that don't
// reflect actual access control. The installer's `Set-Acl` step is the
// authoritative restriction on Windows. A future revision could call into
// the WinAPI ACL helpers to verify only SYSTEM and Administrators have
// access; for now the runtime check is a no-op on Windows.
func verifyConfigPerms(path string, info os.FileInfo) error {
	if runtime.GOOS == "windows" {
		return nil
	}
	mode := info.Mode().Perm()
	if mode&0o077 != 0 {
		return fmt.Errorf(
			"config at %s has too-loose permissions %#o — agent JWT must not be readable by group or world; fix with: chmod 600 %s",
			path, mode, path,
		)
	}
	return nil
}

func homeDir() string {
	if h, err := os.UserHomeDir(); err == nil {
		return h
	}
	return os.Getenv("HOME")
}
