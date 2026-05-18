package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
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
// Returns an error if APIBase does not use HTTPS — the agent JWT is sent as a
// Bearer token on every request and must not be transmitted in plaintext.
// Exception: http://localhost and http://127.0.0.1 are permitted for local dev.
func NewClient(cfg *Config) (*Client, error) {
	if !strings.HasPrefix(cfg.APIBase, "https://") {
		isLocal := strings.HasPrefix(cfg.APIBase, "http://localhost") ||
			strings.HasPrefix(cfg.APIBase, "http://127.0.0.1")
		if !isLocal {
			return nil, fmt.Errorf(
				"APIBase must use HTTPS (got %q): the agent token would be exposed in plaintext",
				cfg.APIBase,
			)
		}
		log.Printf("[overra-agent] WARNING: plain HTTP in use (%s) — switch to HTTPS in production", cfg.APIBase)
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
