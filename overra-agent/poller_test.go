package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
)

// fakeHeartbeats serves a queue of canned heartbeat responses.
type fakeHeartbeats struct {
	mu        sync.Mutex
	responses []HeartbeatResponse
	calls     int32
}

func (f *fakeHeartbeats) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// ReportResult also POSTs here; those calls must NOT consume heartbeat
		// responses or the next tick's heartbeat will see a depleted queue.
		if r.URL.Path != "/api/agent/heartbeat" {
			w.WriteHeader(http.StatusOK)
			return
		}
		atomic.AddInt32(&f.calls, 1)
		f.mu.Lock()
		defer f.mu.Unlock()
		if len(f.responses) == 0 {
			http.Error(w, "no canned response", 500)
			return
		}
		next := f.responses[0]
		f.responses = f.responses[1:]
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(next)
	})
}

// newTestPoller wires a Poller against a httptest server with the given fake
// heartbeats, and stubs all OS-touching action hooks with no-op spies.
type spies struct {
	executed       map[string]int
	reEnableCalls  int32
	unfreezeCalls  int32
	mu             sync.Mutex
}

func newSpies() *spies { return &spies{executed: map[string]int{}} }

func (s *spies) record(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.executed[id]++
}

func (s *spies) count(id string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.executed[id]
}

func newTestPoller(t *testing.T, hb *fakeHeartbeats, sp *spies) *Poller {
	t.Helper()
	srv := httptest.NewServer(hb.handler())
	t.Cleanup(srv.Close)

	cfg := &Config{AgentToken: "t", APIBase: srv.URL + "/api"}
	p, err := NewPoller(cfg)
	if err != nil {
		t.Fatalf("NewPoller: %v", err)
	}
	// Replace OS-touching hooks with spies — production functions would
	// disable interfaces, suspend processes, etc.
	p.actions = []action{
		{"screen_lock", func() error { sp.record("screen_lock"); return nil }, "screen locked"},
		{"network_disable", func() error { sp.record("network_disable"); return nil }, "network disabled"},
		{"sessions_revoke", func() error { sp.record("sessions_revoke"); return nil }, "sessions revoked"},
		{"extensions_freeze", func() error { sp.record("extensions_freeze"); return nil }, "processes frozen"},
	}
	p.reEnableNetwork = func() error { atomic.AddInt32(&sp.reEnableCalls, 1); return nil }
	p.unfreezeProcesses = func() error { atomic.AddInt32(&sp.unfreezeCalls, 1); return nil }
	return p
}

func TestTick_NormalStatus_RunsNoActions(t *testing.T) {
	hb := &fakeHeartbeats{responses: []HeartbeatResponse{{Status: "normal"}}}
	sp := newSpies()
	p := newTestPoller(t, hb, sp)

	status := p.tick("h", "", map[string]bool{})
	if status != "normal" {
		t.Errorf("expected status=normal, got %q", status)
	}
	for id := range sp.executed {
		t.Errorf("no action should have fired in 'normal' state, but %s did", id)
	}
}

func TestTick_ContainedStatus_RunsFlaggedActionsOnce(t *testing.T) {
	hb := &fakeHeartbeats{responses: []HeartbeatResponse{
		{Status: "contained", NetworkDisabled: true, ScreenLocked: true},
		// Same heartbeat repeated — actions must NOT fire again (dedup).
		{Status: "contained", NetworkDisabled: true, ScreenLocked: true},
	}}
	sp := newSpies()
	p := newTestPoller(t, hb, sp)
	applied := map[string]bool{}

	p.tick("h", "", applied)
	p.tick("h", "contained", applied)

	if got := sp.count("network_disable"); got != 1 {
		t.Errorf("network_disable should fire exactly once, got %d", got)
	}
	if got := sp.count("screen_lock"); got != 1 {
		t.Errorf("screen_lock should fire exactly once, got %d", got)
	}
	if got := sp.count("sessions_revoke"); got != 0 {
		t.Errorf("sessions_revoke not flagged, should be 0, got %d", got)
	}
	if got := sp.count("extensions_freeze"); got != 0 {
		t.Errorf("extensions_freeze not flagged, should be 0, got %d", got)
	}
}

func TestTick_TransitionToNormal_TriggersReleaseHooks(t *testing.T) {
	hb := &fakeHeartbeats{responses: []HeartbeatResponse{
		{Status: "contained", NetworkDisabled: true, ExtensionsFrozen: true},
		{Status: "normal"},
	}}
	sp := newSpies()
	p := newTestPoller(t, hb, sp)
	applied := map[string]bool{}

	prev := p.tick("h", "", applied)
	if prev != "contained" {
		t.Fatalf("expected contained after first tick, got %q", prev)
	}
	if !applied["network_disable"] || !applied["extensions_freeze"] {
		t.Fatalf("expected applied flags after enforce: %v", applied)
	}

	prev = p.tick("h", "contained", applied)
	if prev != "normal" {
		t.Errorf("expected normal after release, got %q", prev)
	}
	if atomic.LoadInt32(&sp.reEnableCalls) != 1 {
		t.Errorf("expected reEnableNetwork called once, got %d", sp.reEnableCalls)
	}
	if atomic.LoadInt32(&sp.unfreezeCalls) != 1 {
		t.Errorf("expected unfreezeProcesses called once, got %d", sp.unfreezeCalls)
	}
	if len(applied) != 0 {
		t.Errorf("applied map should be cleared after release, got %v", applied)
	}
}

func TestTick_ReleaseSkipsHooksThatNeverFired(t *testing.T) {
	// Contained with only screen_lock — release should not call reEnableNetwork
	// or unfreezeProcesses since neither was applied.
	hb := &fakeHeartbeats{responses: []HeartbeatResponse{
		{Status: "contained", ScreenLocked: true},
		{Status: "normal"},
	}}
	sp := newSpies()
	p := newTestPoller(t, hb, sp)
	applied := map[string]bool{}

	p.tick("h", "", applied)
	p.tick("h", "contained", applied)

	if atomic.LoadInt32(&sp.reEnableCalls) != 0 {
		t.Errorf("reEnableNetwork should NOT have been called, got %d", sp.reEnableCalls)
	}
	if atomic.LoadInt32(&sp.unfreezeCalls) != 0 {
		t.Errorf("unfreezeProcesses should NOT have been called, got %d", sp.unfreezeCalls)
	}
}

func TestTick_HeartbeatErrorPreservesPrevStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "down", http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	cfg := &Config{AgentToken: "t", APIBase: srv.URL + "/api"}
	p, err := NewPoller(cfg)
	if err != nil {
		t.Fatalf("NewPoller: %v", err)
	}
	// No-op hooks
	p.actions = nil
	p.reEnableNetwork = func() error { return nil }
	p.unfreezeProcesses = func() error { return nil }

	prev := p.tick("h", "contained", map[string]bool{})
	if prev != "contained" {
		t.Errorf("expected prev status preserved on heartbeat error, got %q", prev)
	}
}

// withLowWatchdogThreshold temporarily lowers the package-level watchdog
// threshold so tests don't have to make 30 HTTP requests per case.
func withLowWatchdogThreshold(t *testing.T, n int) {
	t.Helper()
	orig := watchdogFailThreshold
	watchdogFailThreshold = n
	t.Cleanup(func() { watchdogFailThreshold = orig })
}

// brokenServer returns 500 on every heartbeat — used to drive the watchdog.
func brokenServer(t *testing.T) string {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "down", http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)
	return srv.URL + "/api"
}

func TestTick_WatchdogForcesReleaseAfterConsecutiveFailures(t *testing.T) {
	withLowWatchdogThreshold(t, 3)
	cfg := &Config{AgentToken: "t", APIBase: brokenServer(t)}
	p, err := NewPoller(cfg)
	if err != nil {
		t.Fatalf("NewPoller: %v", err)
	}
	sp := newSpies()
	p.actions = nil
	p.reEnableNetwork = func() error { atomic.AddInt32(&sp.reEnableCalls, 1); return nil }
	p.unfreezeProcesses = func() error { atomic.AddInt32(&sp.unfreezeCalls, 1); return nil }

	// Simulate having previously enforced both network_disable and
	// extensions_freeze before the portal became unreachable.
	applied := map[string]bool{
		"network_disable":   true,
		"extensions_freeze": true,
	}

	prev := "contained"
	// First two failures: no watchdog yet.
	for i := 0; i < 2; i++ {
		prev = p.tick("h", prev, applied)
		if prev != "contained" {
			t.Fatalf("tick %d: expected status preserved as contained, got %q", i, prev)
		}
		if atomic.LoadInt32(&sp.reEnableCalls) != 0 {
			t.Fatalf("tick %d: watchdog fired too early (reEnableCalls=%d)", i, sp.reEnableCalls)
		}
	}

	// Third failure crosses the threshold.
	prev = p.tick("h", prev, applied)
	if prev != "normal" {
		t.Errorf("after watchdog: expected status=normal, got %q", prev)
	}
	if got := atomic.LoadInt32(&sp.reEnableCalls); got != 1 {
		t.Errorf("after watchdog: reEnableNetwork should have been called once, got %d", got)
	}
	if got := atomic.LoadInt32(&sp.unfreezeCalls); got != 1 {
		t.Errorf("after watchdog: unfreezeProcesses should have been called once, got %d", got)
	}
	if len(applied) != 0 {
		t.Errorf("after watchdog: applied should be cleared, got %v", applied)
	}
	if p.consecutiveFails != 0 {
		t.Errorf("after watchdog fires, consecutiveFails should reset, got %d", p.consecutiveFails)
	}
}

func TestTick_WatchdogDoesNotFireWhenNotContained(t *testing.T) {
	withLowWatchdogThreshold(t, 3)
	cfg := &Config{AgentToken: "t", APIBase: brokenServer(t)}
	p, err := NewPoller(cfg)
	if err != nil {
		t.Fatalf("NewPoller: %v", err)
	}
	sp := newSpies()
	p.actions = nil
	p.reEnableNetwork = func() error { atomic.AddInt32(&sp.reEnableCalls, 1); return nil }
	p.unfreezeProcesses = func() error { atomic.AddInt32(&sp.unfreezeCalls, 1); return nil }

	applied := map[string]bool{}
	prev := "normal"
	for i := 0; i < 10; i++ {
		prev = p.tick("h", prev, applied)
		if prev != "normal" {
			t.Fatalf("tick %d: prev should stay normal, got %q", i, prev)
		}
	}
	if atomic.LoadInt32(&sp.reEnableCalls) != 0 {
		t.Errorf("watchdog must not fire when prevStatus != contained, got reEnableCalls=%d", sp.reEnableCalls)
	}
}

func TestTick_WatchdogCounterResetsOnSuccess(t *testing.T) {
	withLowWatchdogThreshold(t, 3)

	// Server alternates: first 2 calls fail, 3rd succeeds, then 2 more fail.
	// After the success, the counter must reset, so 2 trailing failures must
	// NOT trip the watchdog (threshold is 3).
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/agent/heartbeat" {
			w.WriteHeader(200)
			return
		}
		n := atomic.AddInt32(&calls, 1)
		if n == 3 {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"status":"contained","network_disabled":true}`))
			return
		}
		http.Error(w, "down", 500)
	}))
	t.Cleanup(srv.Close)

	cfg := &Config{AgentToken: "t", APIBase: srv.URL + "/api"}
	p, err := NewPoller(cfg)
	if err != nil {
		t.Fatalf("NewPoller: %v", err)
	}
	sp := newSpies()
	p.actions = nil
	p.reEnableNetwork = func() error { atomic.AddInt32(&sp.reEnableCalls, 1); return nil }
	p.unfreezeProcesses = func() error { atomic.AddInt32(&sp.unfreezeCalls, 1); return nil }

	applied := map[string]bool{"network_disable": true}
	prev := "contained"

	for i := 0; i < 5; i++ {
		prev = p.tick("h", prev, applied)
	}
	if atomic.LoadInt32(&sp.reEnableCalls) != 0 {
		t.Errorf("watchdog fired despite a success resetting the counter (reEnableCalls=%d)", sp.reEnableCalls)
	}
	if p.consecutiveFails != 2 {
		t.Errorf("consecutiveFails should be 2 after success-then-2-failures, got %d", p.consecutiveFails)
	}
}
