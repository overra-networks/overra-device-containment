package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"runtime"

	"github.com/kardianos/service"
)

const (
	svcName        = "overra-agent"
	svcDisplayName = "Overra Containment Agent"
	svcDescription = "Monitors and enforces endpoint containment policies."
)

// linuxSystemdScript is a hardened systemd unit template.
// kardianos/service accepts this via the SystemdScript option and renders it
// with the service's Name, Description, and Path variables.
const linuxSystemdScript = `[Unit]
Description={{.Description}}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart={{.Path}}{{range .Arguments}} {{.|cmd}}{{end}}
Restart=on-failure
RestartSec=15
StandardOutput=journal
StandardError=journal

# The agent runs as root: loginctl session management and ip-link network
# control require privileges beyond what an ambient capability set on a
# non-root user can provide.
NoNewPrivileges=yes
ProtectSystem=strict
PrivateTmp=yes
ReadOnlyPaths=/etc/overra

[Install]
WantedBy=multi-user.target
`

type program struct {
	poller *Poller
}

func (p *program) Start(_ service.Service) error {
	go p.poller.Run()
	return nil
}

func (p *program) Stop(_ service.Service) error {
	p.poller.Stop()
	return nil
}

func main() {
	var (
		install   = flag.Bool("install", false, "Install and enable the agent as a system service")
		uninstall = flag.Bool("uninstall", false, "Stop and remove the agent system service")
		runDirect = flag.Bool("run", false, "Run the agent directly in the foreground (not via service manager)")
	)
	flag.Parse()

	cfg, err := LoadConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[overra-agent] config error: %v\n", err)
		os.Exit(1)
	}

	svcCfg := &service.Config{
		Name:        svcName,
		DisplayName: svcDisplayName,
		Description: svcDescription,
	}
	if runtime.GOOS == "linux" {
		svcCfg.Option = service.KeyValue{
			"SystemdScript": linuxSystemdScript,
		}
	}

	poller, err := NewPoller(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[overra-agent] init error: %v\n", err)
		os.Exit(1)
	}
	prg := &program{poller: poller}

	svc, err := service.New(prg, svcCfg)
	if err != nil {
		log.Fatalf("[overra-agent] service init: %v", err)
	}

	switch {
	case *install:
		if err := service.Control(svc, "install"); err != nil {
			log.Fatalf("[overra-agent] install: %v", err)
		}
		if err := service.Control(svc, "start"); err != nil {
			log.Fatalf("[overra-agent] start: %v", err)
		}
		fmt.Println("[overra-agent] installed and started.")

	case *uninstall:
		_ = service.Control(svc, "stop")
		if err := service.Control(svc, "uninstall"); err != nil {
			log.Fatalf("[overra-agent] uninstall: %v", err)
		}
		fmt.Println("[overra-agent] uninstalled.")

	case *runDirect:
		poller.Run()

	default:
		// Called by the service manager — hand control to kardianos/service.
		logger, err := svc.Logger(nil)
		if err != nil {
			log.Fatal(err)
		}
		if err := svc.Run(); err != nil {
			_ = logger.Error(err)
		}
	}
}
