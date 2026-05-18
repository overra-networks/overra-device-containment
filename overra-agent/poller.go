package main

import (
	"errors"
	"log"
	"os"
	"sync"
	"time"
)

const (
	pollInterval     = 10 * time.Second
	unauthorizedWait = 5 * time.Minute // back off hard on 401 — token is revoked
)

// watchdogFailThreshold is the number of consecutive non-401 heartbeat
// failures that triggers a local force-release when prevStatus == "contained".
//
// Rationale: today's DisableNetwork brings every non-loopback interface down,
// which kills the agent's own path to the portal. Without this watchdog, once
// the agent observes "contained + network_disabled" and runs DisableNetwork,
// it can never observe a release — the machine is bricked until someone with
// physical access runs `ip link set <iface> up`. The watchdog detects "we've
// been contained AND haven't heard from the portal for a long time" and
// assumes we contained ourselves, then runs the local release path.
//
// 30 * 10s pollInterval = 5 minutes. Long enough that a brief portal hiccup
// during legitimate containment doesn't auto-lift; short enough that a real
// brick scenario recovers in minutes, not hours.
//
// IMPORTANT caveat for the next reader: when the watchdog fires, the agent
// re-enables network and unfreezes browsers, but the portal still says
// "contained" until an operator releases. The next heartbeat that succeeds
// will see status=contained again and re-apply DisableNetwork, creating a
// ~5-minute oscillation between offline and online until the operator
// releases. This is the trade-off until we replace interface-down with
// firewall-based containment (see [[agent-cross-platform-workstream]]).
//
// Declared as a var (not const) so tests can lower the threshold without
// hammering an httptest server 30 times per case.
var watchdogFailThreshold = 30

// action pairs a containment flag with the function that enforces it.
type action struct {
	id    string // dedup key stored in applied set
	fn    func() error
	label string // event name sent to portal
}

// allActions is the ordered list of containment actions the agent can execute.
// Order matters: lock screen first (visible), then network (stops exfil),
// then sessions (prevent lateral movement), then freeze extensions.
var allActions = []action{
	{"screen_lock", LockScreen, "Agent: screen locked"},
	{"network_disable", DisableNetwork, "Agent: network interfaces disabled"},
	{"sessions_revoke", RevokeSessions, "Agent: sessions revoked"},
	{"extensions_freeze", FreezeProcesses, "Agent: extensions frozen"},
}

// Poller manages the heartbeat loop and containment state machine.
type Poller struct {
	cfg     *Config
	client  *Client
	stopCh  chan struct{}
	once    sync.Once
	actions []action
	// reEnableNetwork / unfreezeProcesses are pluggable so tests can run
	// release() without touching real OS state. Production sets them to the
	// real OS-specific functions from actions_*.go.
	reEnableNetwork   func() error
	unfreezeProcesses func() error
	// consecutiveFails counts non-401 heartbeat errors in a row. Used by the
	// brick-recovery watchdog (see watchdogFailThreshold). Reset on any
	// successful heartbeat or after the watchdog fires.
	consecutiveFails int
}

func NewPoller(cfg *Config) (*Poller, error) {
	client, err := NewClient(cfg)
	if err != nil {
		return nil, err
	}
	return &Poller{
		cfg:               cfg,
		client:            client,
		stopCh:            make(chan struct{}),
		actions:           allActions,
		reEnableNetwork:   EnableNetwork,
		unfreezeProcesses: UnfreezeProcesses,
	}, nil
}

// Stop signals the polling loop to exit cleanly.
func (p *Poller) Stop() {
	p.once.Do(func() { close(p.stopCh) })
}

// Run is the main loop. Blocks until Stop is called.
func (p *Poller) Run() {
	hostname, _ := os.Hostname()
	log.Printf("[overra-agent] started  api=%s  host=%s", p.cfg.APIBase, hostname)

	applied := make(map[string]bool)
	prevStatus := ""

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	// Poll immediately on startup, then once per tick.
	prevStatus = p.tick(hostname, prevStatus, applied)
	for {
		select {
		case <-p.stopCh:
			log.Println("[overra-agent] stopped")
			return
		case <-ticker.C:
			prevStatus = p.tick(hostname, prevStatus, applied)
		}
	}
}

// tick performs one heartbeat and updates containment state.
// Returns the current status string so the caller can track transitions.
func (p *Poller) tick(hostname, prevStatus string, applied map[string]bool) string {
	hb, err := p.client.Heartbeat(hostname)
	if err != nil {
		if errors.Is(err, ErrUnauthorized) {
			// Token revoked server-side. Stop trying rapidly — sleep long and
			// let the service manager keep us alive for potential re-config.
			log.Printf("[overra-agent] ERROR: %v", err)
			log.Printf("[overra-agent] sleeping %v before next attempt", unauthorizedWait)
			select {
			case <-time.After(unauthorizedWait):
			case <-p.stopCh:
			}
			return prevStatus
		}
		p.consecutiveFails++
		log.Printf("[overra-agent] heartbeat error (consecutive %d): %v", p.consecutiveFails, err)

		// Brick-recovery watchdog. If we are contained AND haven't reached the
		// portal for `watchdogFailThreshold` ticks, assume DisableNetwork (or
		// another containment action) severed our own backchannel. Run the
		// local release path so the machine recovers without physical access.
		if prevStatus == "contained" && p.consecutiveFails >= watchdogFailThreshold {
			log.Printf("[overra-agent] WATCHDOG: %d consecutive heartbeat failures while contained — force-releasing locally", p.consecutiveFails)
			p.release(applied)
			p.consecutiveFails = 0
			return "normal"
		}
		return prevStatus
	}
	p.consecutiveFails = 0

	status := hb.Status
	if status != prevStatus {
		log.Printf("[overra-agent] status  %q → %q", prevStatus, status)
	}

	// Containment was lifted — clear applied set and SIGCONT any frozen processes.
	if prevStatus == "contained" && status != "contained" {
		p.release(applied)
	}

	if status == "contained" {
		p.enforce(hb, applied)
	}

	return status
}

// enforce runs any containment actions that are flagged but not yet applied.
func (p *Poller) enforce(hb *HeartbeatResponse, applied map[string]bool) {
	flags := map[string]bool{
		"screen_lock":      hb.ScreenLocked,
		"network_disable":  hb.NetworkDisabled,
		"sessions_revoke":  hb.SessionsRevoked,
		"extensions_freeze": hb.ExtensionsFrozen,
	}

	for _, a := range p.actions {
		if !flags[a.id] || applied[a.id] {
			continue
		}
		applied[a.id] = true
		log.Printf("[overra-agent] executing: %s", a.label)
		if err := a.fn(); err != nil {
			log.Printf("[overra-agent]   → failed: %v", err)
			p.client.ReportResult(a.label, "failed", err.Error())
		} else {
			log.Printf("[overra-agent]   → ok")
			p.client.ReportResult(a.label, "executed", "")
		}
	}
}

// release clears the applied set and reverses reversible containment actions.
// Network is re-enabled only if the agent disabled it. Frozen processes are
// resumed. Session termination and screen lock are not reversible.
func (p *Poller) release(applied map[string]bool) {
	networkWasDisabled := applied["network_disable"]
	processesWereFrozen := applied["extensions_freeze"]

	for k := range applied {
		delete(applied, k)
	}

	log.Println("[overra-agent] containment released")

	if networkWasDisabled {
		log.Println("[overra-agent] re-enabling network interfaces")
		if err := p.reEnableNetwork(); err != nil {
			log.Printf("[overra-agent] network re-enable error: %v", err)
			p.client.ReportResult("Agent: network re-enabled", "failed", err.Error())
		} else {
			p.client.ReportResult("Agent: network re-enabled", "executed", "")
		}
	}

	if processesWereFrozen {
		log.Println("[overra-agent] unfreezing browser processes")
		if err := p.unfreezeProcesses(); err != nil {
			log.Printf("[overra-agent] unfreeze error: %v", err)
			p.client.ReportResult("Agent: extensions unfrozen", "failed", err.Error())
		} else {
			p.client.ReportResult("Agent: extensions unfrozen", "executed", "")
		}
	}
}
