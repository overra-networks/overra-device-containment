package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestConfig_JSONRoundTrip(t *testing.T) {
	original := Config{AgentToken: "tok-abc", APIBase: "https://overra.example.com/api"}
	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got Config
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got != original {
		t.Errorf("round-trip mismatch: %+v vs %+v", got, original)
	}
}

func TestConfig_JSONFieldNames(t *testing.T) {
	// The installer scripts write {"agent_token": "...", "api_base": "..."}.
	// If we ever rename JSON tags, all currently-deployed agents stop loading
	// their config. This test pins the wire format.
	raw := `{"agent_token":"t","api_base":"https://x.com"}`
	var cfg Config
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if cfg.AgentToken != "t" || cfg.APIBase != "https://x.com" {
		t.Errorf("field tag drift — installer-written config no longer parses: %+v", cfg)
	}
}

// LoadConfig reads OS-specific paths. We can exercise it by pointing the
// per-OS lookup at a temp dir. Since the path list is hardcoded, the most
// reliable cross-OS approach is to test the parsing branches directly via
// json.Unmarshal — done in TestConfig_JSONRoundTrip — and to test LoadConfig
// only for the "no file found" failure mode.

func TestLoadConfig_FailsWhenNoConfigExists(t *testing.T) {
	if runtime.GOOS == "windows" {
		// On Windows the path is %ProgramData%\Overra\config.json which we
		// can't reliably stub from a test without altering env vars; skip.
		t.Skip("LoadConfig path is hardcoded to %ProgramData% on Windows")
	}
	// Move HOME so the user-local fallback path doesn't accidentally exist.
	t.Setenv("HOME", t.TempDir())

	// /etc/overra/config.json is system-level; if it exists on the dev box,
	// skip the test (we can't guarantee a clean filesystem).
	if _, err := os.Stat("/etc/overra/config.json"); err == nil {
		t.Skip("/etc/overra/config.json exists on host; skipping no-config test")
	}

	_, err := LoadConfig()
	if err == nil {
		t.Fatal("expected error when no config exists, got nil")
	}
	if !strings.Contains(err.Error(), "no config found") {
		t.Errorf("expected 'no config found' error, got %q", err.Error())
	}
}

// The four parse-path tests below previously called a duplicated test-local
// helper. They now exercise the production loadConfigFromPath directly, so
// the read + perm + parse pipeline is covered as a single unit.

func TestLoadConfigFromPath_ParsesValidJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	_ = os.WriteFile(path, []byte(`{"agent_token":"abc","api_base":"https://example.com"}`), 0o600)

	cfg, err := loadConfigFromPath(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.AgentToken != "abc" || cfg.APIBase != "https://example.com" {
		t.Errorf("unexpected cfg: %+v", cfg)
	}
}

func TestLoadConfigFromPath_RejectsMalformedJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	_ = os.WriteFile(path, []byte(`{not json`), 0o600)

	_, err := loadConfigFromPath(path)
	if err == nil {
		t.Fatal("expected JSON error, got nil")
	}
}

func TestLoadConfigFromPath_RejectsMissingAgentToken(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	_ = os.WriteFile(path, []byte(`{"api_base":"https://example.com"}`), 0o600)

	_, err := loadConfigFromPath(path)
	if err == nil {
		t.Fatal("expected missing-token error, got nil")
	}
}

func TestLoadConfigFromPath_RejectsMissingAPIBase(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	_ = os.WriteFile(path, []byte(`{"agent_token":"abc"}`), 0o600)

	_, err := loadConfigFromPath(path)
	if err == nil {
		t.Fatal("expected missing-api_base error, got nil")
	}
}

func TestLoadConfigFromPath_RejectsWorldReadablePerms(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX mode bits don't apply to Windows ACLs")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	if err := os.WriteFile(path, []byte(`{"agent_token":"abc","api_base":"https://example.com"}`), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	// Belt-and-braces — some filesystems / umasks could downgrade 0644.
	if err := os.Chmod(path, 0o644); err != nil {
		t.Fatalf("chmod: %v", err)
	}

	_, err := loadConfigFromPath(path)
	if err == nil {
		t.Fatal("expected perm error on world-readable config, got nil")
	}
	if !strings.Contains(err.Error(), "too-loose permissions") {
		t.Errorf("expected too-loose-permissions error, got %q", err.Error())
	}
}

func TestLoadConfigFromPath_RejectsGroupReadablePerms(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX mode bits don't apply to Windows ACLs")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	if err := os.WriteFile(path, []byte(`{"agent_token":"abc","api_base":"https://example.com"}`), 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}
	// 0640: owner rw, group r — still leaks the JWT to other group members.
	if err := os.Chmod(path, 0o640); err != nil {
		t.Fatalf("chmod: %v", err)
	}

	_, err := loadConfigFromPath(path)
	if err == nil {
		t.Fatal("expected perm error on group-readable config, got nil")
	}
}

func TestLoadConfigFromPath_Accepts0600(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("perm check is a no-op on Windows")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	if err := os.WriteFile(path, []byte(`{"agent_token":"abc","api_base":"https://example.com"}`), 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := os.Chmod(path, 0o600); err != nil {
		t.Fatalf("chmod: %v", err)
	}

	cfg, err := loadConfigFromPath(path)
	if err != nil {
		t.Fatalf("0600 should be accepted, got error: %v", err)
	}
	if cfg.AgentToken != "abc" {
		t.Errorf("cfg parsed incorrectly: %+v", cfg)
	}
}
