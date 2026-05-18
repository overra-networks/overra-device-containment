package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ErrUnauthorized is returned when the server rejects the agent JWT.
// The token has been revoked or was never valid — re-installation is required.
var ErrUnauthorized = errors.New("agent token rejected (401) — re-installation required")

// Client wraps the authenticated HTTP connection to the portal.
type Client struct {
	cfg  *Config
	http *http.Client
}

// NewClient creates a Client with sane timeouts and TLS verification enabled.
// It hard-fails unless APIBase is HTTPS, or HTTP pointed at a genuine
// loopback host (localhost, 127.0.0.0/8, ::1) for local development. The
// agent JWT is a Bearer token on every request and must never cross the
// network in plaintext.
func NewClient(cfg *Config) (*Client, error) {
	if err := validateAPIBase(cfg.APIBase); err != nil {
		return nil, err
	}
	if strings.HasPrefix(strings.ToLower(cfg.APIBase), "http://") {
		log.Printf("[overra-agent] WARNING: plain HTTP in use (%s) — permitted only for local development", cfg.APIBase)
	}
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
		ResponseHeaderTimeout: 15 * time.Second,
	}
	return &Client{
		cfg: cfg,
		http: &http.Client{
			Transport: transport,
			Timeout:   20 * time.Second,
		},
	}, nil
}

// validateAPIBase enforces HTTPS for the portal connection. Plain HTTP is
// tolerated ONLY when the host is a real loopback address. String-prefix
// checks like strings.HasPrefix(url, "http://localhost") are deliberately
// avoided: "http://localhost.attacker.com" would slip past them and leak
// the Bearer token to an attacker-controlled host.
func validateAPIBase(apiBase string) error {
	u, err := url.Parse(apiBase)
	if err != nil {
		return fmt.Errorf("APIBase is not a valid URL (%q): %w", apiBase, err)
	}
	switch strings.ToLower(u.Scheme) {
	case "https":
		return nil
	case "http":
		if isLoopbackHost(u.Hostname()) {
			return nil
		}
		return fmt.Errorf(
			"APIBase must use HTTPS (got %q): the agent token would be exposed in plaintext",
			apiBase,
		)
	default:
		return fmt.Errorf("APIBase must be http or https (got scheme %q in %q)", u.Scheme, apiBase)
	}
}

// isLoopbackHost reports whether host is exactly "localhost" or an IP in
// the loopback range (127.0.0.0/8, ::1). host must already have any port
// stripped — pass url.URL.Hostname(), which also unwraps IPv6 brackets.
func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback()
	}
	return false
}

// HeartbeatResponse mirrors the portal's heartbeat JSON response.
type HeartbeatResponse struct {
	Status           string `json:"status"`
	NetworkDisabled  bool   `json:"network_disabled"`
	SessionsRevoked  bool   `json:"sessions_revoked"`
	ExtensionsFrozen bool   `json:"extensions_frozen"`
	ScreenLocked     bool   `json:"screen_locked"`
}

// Heartbeat posts a heartbeat to the portal and returns the current
// containment state. Returns ErrUnauthorized if the JWT is rejected.
func (c *Client) Heartbeat(hostname string) (*HeartbeatResponse, error) {
	body, _ := json.Marshal(map[string]any{
		"status_report": map[string]any{"hostname": hostname},
	})

	req, err := http.NewRequest(http.MethodPost, c.url("/agent/heartbeat"), bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build heartbeat request: %w", err)
	}
	c.auth(req)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("heartbeat: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, ErrUnauthorized
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("heartbeat: server returned %d", resp.StatusCode)
	}

	var hb HeartbeatResponse
	if err := json.NewDecoder(resp.Body).Decode(&hb); err != nil {
		return nil, fmt.Errorf("decode heartbeat response: %w", err)
	}
	return &hb, nil
}

// ReportResult tells the portal about the outcome of an executed action.
// Errors here are swallowed — a failed report is not fatal.
func (c *Client) ReportResult(action, result, errMsg string) {
	body, _ := json.Marshal(map[string]any{
		"action": action,
		"result": result,
		"error":  errMsg,
	})

	req, err := http.NewRequest(http.MethodPost, c.url("/agent/action/result"), bytes.NewReader(body))
	if err != nil {
		return
	}
	c.auth(req)

	resp, err := c.http.Do(req)
	if err != nil {
		return
	}
	resp.Body.Close()
}

// auth sets the Authorization and Content-Type headers on a request.
func (c *Client) auth(req *http.Request) {
	req.Header.Set("Authorization", "Bearer "+c.cfg.AgentToken)
	req.Header.Set("Content-Type", "application/json")
}

func (c *Client) url(path string) string {
	return strings.TrimRight(c.cfg.APIBase, "/") + path
}
