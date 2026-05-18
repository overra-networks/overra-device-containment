package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestClient(t *testing.T, handler http.Handler) *Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	c, err := NewClient(&Config{
		AgentToken: "test-token",
		APIBase:    srv.URL + "/api",
	})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	return c
}

func TestNewClient_RequiresHTTPSForNonLocalhost(t *testing.T) {
	cases := []struct {
		name      string
		apiBase   string
		wantError bool
	}{
		{"https remote OK", "https://overra.example.com/api", false},
		{"https uppercase scheme OK", "HTTPS://overra.example.com/api", false},
		{"http localhost OK", "http://localhost:3000/api", false},
		{"http 127.0.0.1 OK", "http://127.0.0.1:3000/api", false},
		{"http 127.x loopback OK", "http://127.5.6.7:3000/api", false},
		{"http ipv6 loopback OK", "http://[::1]:3000/api", false},
		{"http remote rejected", "http://overra.example.com/api", true},
		{"http with localhost in path is rejected", "http://example.com/localhost/api", true},
		// Prefix-match bypasses: these all start with "http://localhost"
		// or "http://127.0.0.1" but resolve to attacker-controlled hosts.
		{"localhost subdomain bypass rejected", "http://localhost.attacker.com/api", true},
		{"127.0.0.1 subdomain bypass rejected", "http://127.0.0.1.attacker.com/api", true},
		{"localhost userinfo masks real host rejected", "http://localhost@evil.com/api", true},
		{"non-http scheme rejected", "ftp://localhost/api", true},
		{"garbage rejected", "not-a-url", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := NewClient(&Config{AgentToken: "t", APIBase: tc.apiBase})
			if tc.wantError && err == nil {
				t.Fatalf("expected error for %s, got nil", tc.apiBase)
			}
			if !tc.wantError && err != nil {
				t.Fatalf("expected success for %s, got: %v", tc.apiBase, err)
			}
		})
	}
}

func TestClient_Heartbeat_HappyPath(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/agent/heartbeat" {
			t.Errorf("unexpected path %q", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Errorf("missing/wrong Authorization header: %q", got)
		}
		if got := r.Header.Get("Content-Type"); got != "application/json" {
			t.Errorf("missing/wrong Content-Type: %q", got)
		}
		body, _ := io.ReadAll(r.Body)
		var parsed map[string]any
		_ = json.Unmarshal(body, &parsed)
		if status, ok := parsed["status_report"].(map[string]any); !ok || status["hostname"] != "alice-mbp" {
			t.Errorf("expected status_report.hostname=alice-mbp, got: %v", parsed)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"status": "contained",
			"network_disabled": true,
			"sessions_revoked": false,
			"extensions_frozen": true,
			"screen_locked": false
		}`))
	}))

	hb, err := c.Heartbeat("alice-mbp")
	if err != nil {
		t.Fatalf("heartbeat error: %v", err)
	}
	if hb.Status != "contained" {
		t.Errorf("expected status=contained, got %q", hb.Status)
	}
	if !hb.NetworkDisabled || !hb.ExtensionsFrozen {
		t.Errorf("expected network_disabled and extensions_frozen, got %+v", hb)
	}
	if hb.SessionsRevoked || hb.ScreenLocked {
		t.Errorf("did not expect sessions_revoked or screen_locked: %+v", hb)
	}
}

func TestClient_Heartbeat_Returns401AsErrUnauthorized(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	}))

	_, err := c.Heartbeat("h")
	if !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expected ErrUnauthorized, got %v", err)
	}
}

func TestClient_Heartbeat_NonOKStatus(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))

	_, err := c.Heartbeat("h")
	if err == nil {
		t.Fatal("expected error on 500, got nil")
	}
	if errors.Is(err, ErrUnauthorized) {
		t.Fatal("500 should not map to ErrUnauthorized")
	}
	if !strings.Contains(err.Error(), "500") {
		t.Errorf("expected error to mention status 500, got %q", err.Error())
	}
}

func TestClient_Heartbeat_MalformedJSON(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{not json`))
	}))

	_, err := c.Heartbeat("h")
	if err == nil {
		t.Fatal("expected decode error, got nil")
	}
	if !strings.Contains(err.Error(), "decode") {
		t.Errorf("expected decode error, got %q", err.Error())
	}
}

func TestClient_ReportResult_SendsExpectedPayload(t *testing.T) {
	var got map[string]any
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/agent/action/result" {
			t.Errorf("unexpected path %q", r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &got)
		w.WriteHeader(http.StatusOK)
	}))

	c.ReportResult("Agent: screen locked", "executed", "")
	if got["action"] != "Agent: screen locked" || got["result"] != "executed" {
		t.Errorf("payload mismatch: %v", got)
	}
}

func TestClient_URL_HandlesTrailingSlashInAPIBase(t *testing.T) {
	c := &Client{cfg: &Config{APIBase: "https://overra.example.com/api/"}}
	if got := c.url("/agent/heartbeat"); got != "https://overra.example.com/api/agent/heartbeat" {
		t.Errorf("unexpected URL: %q", got)
	}
}
