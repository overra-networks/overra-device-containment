//go:build contract

// Contract test: drives the real HTTP path between the Go agent and the
// Next.js portal. Invoked by tests/agent-contract/run.sh, which boots the
// portal on :3001, seeds a device + agent JWT, and exports four env vars:
//
//   OVERRA_API_URL      e.g. http://localhost:3001/api
//   OVERRA_AGENT_TOKEN  HS256 JWT signed with the portal's JWT_SECRET
//   OVERRA_DEVICE_ID    UUID of the seeded device row
//   DATABASE_URL        postgres://... pointing at overra_test
//
// The test reuses newSpies() and the action-stub pattern from poller_test.go,
// but the Poller's *Client* is unmodified — every Heartbeat / ReportResult
// call is a real HTTP round trip against the real Next.js handler.

package main

import (
	"database/sql"
	"errors"
	"net/url"
	"os"
	"sync/atomic"
	"testing"
	"time"

	_ "github.com/lib/pq"
)

// localPGURL ensures sslmode=disable for local Postgres. lib/pq defaults to
// requiring SSL when sslmode is unspecified, which a vanilla local cluster
// doesn't have configured. Prisma transparently tolerates this; we don't.
// The agent's production deployments connect via the portal's HTTPS API, not
// directly to Postgres, so this normalization is test-scope only.
func localPGURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	q := u.Query()
	if q.Get("sslmode") == "" {
		q.Set("sslmode", "disable")
		u.RawQuery = q.Encode()
	}
	return u.String()
}

type portalEnv struct {
	apiURL   string
	token    string
	deviceID string
	dbURL    string
}

func loadPortalEnv(t *testing.T) portalEnv {
	t.Helper()
	e := portalEnv{
		apiURL:   os.Getenv("OVERRA_API_URL"),
		token:    os.Getenv("OVERRA_AGENT_TOKEN"),
		deviceID: os.Getenv("OVERRA_DEVICE_ID"),
		dbURL:    os.Getenv("DATABASE_URL"),
	}
	missing := []string{}
	if e.apiURL == "" {
		missing = append(missing, "OVERRA_API_URL")
	}
	if e.token == "" {
		missing = append(missing, "OVERRA_AGENT_TOKEN")
	}
	if e.deviceID == "" {
		missing = append(missing, "OVERRA_DEVICE_ID")
	}
	if e.dbURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if len(missing) > 0 {
		t.Skipf("contract test env not set (%v) — run via tests/agent-contract/run.sh", missing)
	}
	return e
}

// setContainmentState flips status + per-action flags on the seeded device.
// Mirrors what the portal does when an operator clicks "Activate" or "Release".
func setContainmentState(t *testing.T, db *sql.DB, deviceID, status string, networkDisabled, screenLocked, sessionsRevoked, extensionsFrozen bool) {
	t.Helper()
	_, err := db.Exec(`
		UPDATE devices
		   SET status = $1,
		       network_disabled = $2,
		       screen_locked = $3,
		       sessions_revoked = $4,
		       extensions_frozen = $5,
		       updated_at = NOW()
		 WHERE id = $6
	`, status, networkDisabled, screenLocked, sessionsRevoked, extensionsFrozen, deviceID)
	if err != nil {
		t.Fatalf("setContainmentState: %v", err)
	}
}

func revokeAgentToken(t *testing.T, db *sql.DB, deviceID string) {
	t.Helper()
	_, err := db.Exec(`UPDATE devices SET agent_token_hash = NULL WHERE id = $1`, deviceID)
	if err != nil {
		t.Fatalf("revokeAgentToken: %v", err)
	}
}

func countAuditLogs(t *testing.T, db *sql.DB, deviceID string) int {
	t.Helper()
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM audit_logs WHERE device_id = $1`, deviceID).Scan(&n); err != nil {
		t.Fatalf("countAuditLogs: %v", err)
	}
	return n
}

// newContractPoller wires a Poller against the real portal, replacing the
// OS-touching action functions with spies — identical pattern to poller_test.go.
func newContractPoller(t *testing.T, env portalEnv, sp *spies) *Poller {
	t.Helper()
	cfg := &Config{AgentToken: env.token, APIBase: env.apiURL}
	p, err := NewPoller(cfg)
	if err != nil {
		t.Fatalf("NewPoller: %v", err)
	}
	p.actions = []action{
		{"screen_lock", func() error { sp.record("screen_lock"); return nil }, "Agent: screen locked"},
		{"network_disable", func() error { sp.record("network_disable"); return nil }, "Agent: network interfaces disabled"},
		{"sessions_revoke", func() error { sp.record("sessions_revoke"); return nil }, "Agent: sessions revoked"},
		{"extensions_freeze", func() error { sp.record("extensions_freeze"); return nil }, "Agent: extensions frozen"},
	}
	p.reEnableNetwork = func() error { atomic.AddInt32(&sp.reEnableCalls, 1); return nil }
	p.unfreezeProcesses = func() error { atomic.AddInt32(&sp.unfreezeCalls, 1); return nil }
	return p
}

// TestAgentPortalContract exercises the full lifecycle against a running portal.
func TestAgentPortalContract(t *testing.T) {
	env := loadPortalEnv(t)

	db, err := sql.Open("postgres", localPGURL(env.dbURL))
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	defer db.Close()
	db.SetConnMaxLifetime(30 * time.Second)
	if err := db.Ping(); err != nil {
		t.Fatalf("db.Ping: %v", err)
	}

	sp := newSpies()
	p := newContractPoller(t, env, sp)
	applied := map[string]bool{}
	const host = "contract-host"

	auditBefore := countAuditLogs(t, db, env.deviceID)

	// 1) Initial heartbeat: device is "normal", no actions should fire.
	prev := p.tick(host, "", applied)
	if prev != "normal" {
		t.Fatalf("step 1: expected status=normal, got %q", prev)
	}
	if len(sp.executed) != 0 {
		t.Fatalf("step 1: no actions should fire on normal status, got %v", sp.executed)
	}

	// 2) Flip to contained with network_disable + screen_lock flagged.
	setContainmentState(t, db, env.deviceID, "contained", true, true, false, false)
	prev = p.tick(host, prev, applied)
	if prev != "contained" {
		t.Fatalf("step 2: expected status=contained, got %q", prev)
	}
	if got := sp.count("network_disable"); got != 1 {
		t.Errorf("step 2: network_disable should fire once, got %d", got)
	}
	if got := sp.count("screen_lock"); got != 1 {
		t.Errorf("step 2: screen_lock should fire once, got %d", got)
	}
	if got := sp.count("sessions_revoke"); got != 0 {
		t.Errorf("step 2: sessions_revoke not flagged, expected 0, got %d", got)
	}
	if got := sp.count("extensions_freeze"); got != 0 {
		t.Errorf("step 2: extensions_freeze not flagged, expected 0, got %d", got)
	}

	// 3) Repeated tick on same state — actions must NOT re-fire (dedup via applied set).
	prev = p.tick(host, prev, applied)
	if prev != "contained" {
		t.Fatalf("step 3: expected status=contained, got %q", prev)
	}
	if got := sp.count("network_disable"); got != 1 {
		t.Errorf("step 3: network_disable should still be 1 (dedup), got %d", got)
	}
	if got := sp.count("screen_lock"); got != 1 {
		t.Errorf("step 3: screen_lock should still be 1 (dedup), got %d", got)
	}

	// 4) Flip back to normal — release hooks fire only for previously-applied actions.
	setContainmentState(t, db, env.deviceID, "normal", false, false, false, false)
	prev = p.tick(host, prev, applied)
	if prev != "normal" {
		t.Fatalf("step 4: expected status=normal, got %q", prev)
	}
	if got := atomic.LoadInt32(&sp.reEnableCalls); got != 1 {
		t.Errorf("step 4: reEnableNetwork should be called once (network_disable was applied), got %d", got)
	}
	if got := atomic.LoadInt32(&sp.unfreezeCalls); got != 0 {
		t.Errorf("step 4: unfreezeProcesses should NOT be called (extensions_freeze was not applied), got %d", got)
	}
	if len(applied) != 0 {
		t.Errorf("step 4: applied set should be cleared after release, got %v", applied)
	}

	// 5) Audit logs should have grown — ReportResult sends one row per action.
	//    We assert ">before" rather than an exact count because the portal may
	//    also write heartbeat-driven log rows we don't want to pin.
	auditAfter := countAuditLogs(t, db, env.deviceID)
	if auditAfter <= auditBefore {
		t.Errorf("step 5: expected audit log rows to grow (before=%d after=%d) — ReportResult may be silently failing", auditBefore, auditAfter)
	}

	// 6) Revoke the token server-side; next Heartbeat must return ErrUnauthorized.
	//    Call the Client directly to bypass the Poller's 5-minute 401 backoff sleep.
	revokeAgentToken(t, db, env.deviceID)
	_, err = p.client.Heartbeat(host)
	if !errors.Is(err, ErrUnauthorized) {
		t.Errorf("step 6: expected ErrUnauthorized after agent_token_hash=NULL, got %v", err)
	}
}
