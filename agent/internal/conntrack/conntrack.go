// Package conntrack periodically scans active TCP connections using ss (Linux)
// or netstat (macOS/BSD), cross-references remote IPs against a suspicious-IP
// registry built from parsed log events, and emits parser.Event values for the
// SOC dashboard.
//
// Normal connection events are batched; connections from suspicious sources
// produce "suspicious_connection" events that are promoted to urgent delivery
// (immediate flush) by the sender.
package conntrack

import (
	"bufio"
	"bytes"
	"fmt"
	"log"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/sombochea/secops/agent/internal/parser"
)

// Connection represents a single active TCP connection observed on the host.
type Connection struct {
	LocalAddr  string
	LocalPort  int
	RemoteAddr string
	RemotePort int
	State      string
	BytesSent  uint64
	BytesRecv  uint64
	Program    string // process name when available (ss -p)
	Pid        string
}

// Config controls connection-tracking behaviour.
type Config struct {
	// IntervalSec is how often to run a connection scan (default: 30).
	IntervalSec int
	// WatchPorts restricts tracking to connections involving these local ports.
	// Empty means watch all ports.
	WatchPorts []int
	// SuspiciousThreshold is the minimum bad-event score for an IP to be
	// considered suspicious (default: 3).
	SuspiciousThreshold int
}

// Tracker maintains the suspicious-IP registry and drives periodic scans.
type Tracker struct {
	cfg      Config
	hostname string

	mu            sync.RWMutex
	suspiciousIPs map[string]int       // ip → bad-event count
	firstSeen     map[string]time.Time // connKey → first observed time
}

// New returns a ready-to-use Tracker. Call Run to start scanning.
func New(hostname string, cfg Config) *Tracker {
	if cfg.IntervalSec <= 0 {
		cfg.IntervalSec = 30
	}
	if cfg.SuspiciousThreshold <= 0 {
		cfg.SuspiciousThreshold = 3
	}
	return &Tracker{
		cfg:           cfg,
		hostname:      hostname,
		suspiciousIPs: make(map[string]int),
		firstSeen:     make(map[string]time.Time),
	}
}

// ObserveEvent updates the suspicious-IP registry from a parsed log event.
// Call this for every event coming through the log-tailing pipeline.
func (t *Tracker) ObserveEvent(ev *parser.Event) {
	if ev == nil || ev.SourceIP == "" {
		return
	}
	switch ev.Status {
	case "failed", "warning", "blocked", "error":
		t.mu.Lock()
		t.suspiciousIPs[ev.SourceIP]++
		t.mu.Unlock()
	}
}

// SuspicionScore returns the accumulated bad-event count for ip (0 = clean).
func (t *Tracker) SuspicionScore(ip string) int {
	t.mu.RLock()
	s := t.suspiciousIPs[ip]
	t.mu.RUnlock()
	return s
}

// IsSuspicious returns true when the IP score meets the configured threshold.
func (t *Tracker) IsSuspicious(ip string) bool {
	return t.SuspicionScore(ip) >= t.cfg.SuspiciousThreshold
}

// Run starts the periodic scan loop. Normal connection events are sent on
// normalCh; suspicious-connection events are sent on urgentCh for immediate
// flushing. Blocks until done is closed.
func (t *Tracker) Run(done <-chan struct{}, normalCh chan<- *parser.Event, urgentCh chan<- *parser.Event) {
	ticker := time.NewTicker(time.Duration(t.cfg.IntervalSec) * time.Second)
	defer ticker.Stop()

	log.Printf("[conntrack] started: interval=%ds watch_ports=%v suspicious_threshold=%d",
		t.cfg.IntervalSec, t.cfg.WatchPorts, t.cfg.SuspiciousThreshold)

	// Initial scan immediately so the dashboard gets data right away.
	t.scanAndDispatch(normalCh, urgentCh)

	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			t.scanAndDispatch(normalCh, urgentCh)
		}
	}
}

func (t *Tracker) scanAndDispatch(normalCh, urgentCh chan<- *parser.Event) {
	for _, ev := range t.Scan() {
		if ev.Status == "warning" || ev.Status == "critical" {
			select {
			case urgentCh <- ev:
			default:
				log.Printf("[conntrack] urgent channel full, dropping suspicious_connection from %s", ev.SourceIP)
			}
		} else {
			select {
			case normalCh <- ev:
			default:
			}
		}
	}
}

// Scan performs one connection scan and returns the resulting events.
// Safe to call directly (e.g. for testing).
func (t *Tracker) Scan() []*parser.Event {
	conns, err := listConnections()
	if err != nil {
		log.Printf("[conntrack] scan error: %v", err)
		return nil
	}

	now := time.Now().UTC()
	var events []*parser.Event

	for _, conn := range conns {
		if !t.matchesWatchPorts(conn.LocalPort, conn.RemotePort) {
			continue
		}

		key := fmt.Sprintf("%s:%d->%s:%d",
			conn.RemoteAddr, conn.RemotePort,
			conn.LocalAddr, conn.LocalPort)

		t.mu.Lock()
		fs, exists := t.firstSeen[key]
		if !exists {
			t.firstSeen[key] = now
			fs = now
		}
		t.mu.Unlock()

		duration := now.Sub(fs)
		score := t.SuspicionScore(conn.RemoteAddr)
		suspicious := score >= t.cfg.SuspiciousThreshold

		meta := map[string]string{
			"local_addr":   conn.LocalAddr,
			"local_port":   strconv.Itoa(conn.LocalPort),
			"remote_port":  strconv.Itoa(conn.RemotePort),
			"state":        conn.State,
			"duration_sec": fmt.Sprintf("%.0f", duration.Seconds()),
		}
		if conn.BytesSent > 0 {
			meta["bytes_sent"] = strconv.FormatUint(conn.BytesSent, 10)
		}
		if conn.BytesRecv > 0 {
			meta["bytes_recv"] = strconv.FormatUint(conn.BytesRecv, 10)
		}
		if conn.Program != "" {
			meta["program"] = conn.Program
		}
		if suspicious {
			meta["suspicious_score"] = strconv.Itoa(score)
		}

		eventType := "connection_established"
		status := "info"
		if suspicious {
			eventType = "suspicious_connection"
			status = "warning"
		}

		events = append(events, &parser.Event{
			Event:     eventType,
			Status:    status,
			Host:      t.hostname,
			SourceIP:  conn.RemoteAddr,
			Service:   "conntrack",
			Timestamp: now.Format(time.RFC3339),
			Metadata:  meta,
		})
	}

	t.pruneFirstSeen(conns)
	return events
}

func (t *Tracker) matchesWatchPorts(localPort, remotePort int) bool {
	if len(t.cfg.WatchPorts) == 0 {
		return true
	}
	for _, p := range t.cfg.WatchPorts {
		if p == localPort || p == remotePort {
			return true
		}
	}
	return false
}

func (t *Tracker) pruneFirstSeen(active []Connection) {
	alive := make(map[string]bool, len(active))
	for _, c := range active {
		key := fmt.Sprintf("%s:%d->%s:%d", c.RemoteAddr, c.RemotePort, c.LocalAddr, c.LocalPort)
		alive[key] = true
	}
	t.mu.Lock()
	for k := range t.firstSeen {
		if !alive[k] {
			delete(t.firstSeen, k)
		}
	}
	t.mu.Unlock()
}

// ---------------------------------------------------------------------------
// Platform-level connection listing
// ---------------------------------------------------------------------------

func listConnections() ([]Connection, error) {
	if runtime.GOOS == "linux" {
		// ss -tnai: TCP, numeric, all states, with TCP info (bytes_sent/received)
		out, err := exec.Command("ss", "-tnai").Output()
		if err == nil {
			return parseSS(out), nil
		}
		log.Printf("[conntrack] ss unavailable (%v); falling back to netstat", err)
	}
	// macOS / BSD fallback
	out, err := exec.Command("netstat", "-an", "-p", "tcp").Output()
	if err != nil {
		return nil, fmt.Errorf("neither ss nor netstat available: %v", err)
	}
	return parseNetstat(out), nil
}

// ---------------------------------------------------------------------------
// ss parser
// ---------------------------------------------------------------------------

var (
	ssProgRe  = regexp.MustCompile(`users:\(\("([^"]+)".*?pid=(\d+)`)
	ssBSentRe = regexp.MustCompile(`bytes_sent:(\d+)`)
	ssBRecvRe = regexp.MustCompile(`bytes_received:(\d+)`)
)

// parseSS parses output of `ss -tnai`.
// Each connection starts with a non-indented line; the following indented line
// contains TCP-level statistics including bytes_sent and bytes_received.
func parseSS(data []byte) []Connection {
	var (
		conns   []Connection
		current *Connection
	)

	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		line := scanner.Text()

		// Indented continuation line → TCP stats for the previous connection.
		if len(line) > 0 && (line[0] == '\t' || line[0] == ' ') {
			if current != nil {
				if m := ssBSentRe.FindStringSubmatch(line); m != nil {
					current.BytesSent, _ = strconv.ParseUint(m[1], 10, 64)
				}
				if m := ssBRecvRe.FindStringSubmatch(line); m != nil {
					current.BytesRecv, _ = strconv.ParseUint(m[1], 10, 64)
				}
			}
			continue
		}

		// Commit previous connection before starting the next.
		if current != nil {
			conns = append(conns, *current)
			current = nil
		}

		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}

		// Column layout detection:
		//   With Netid:    tcp  ESTAB  Recv-Q  Send-Q  Local  Peer  [Process]
		//   Without Netid: ESTAB  Recv-Q  Send-Q  Local  Peer  [Process]
		var stateIdx, localIdx, peerIdx int
		switch {
		case fields[0] == "Netid" || fields[0] == "State":
			continue // header row
		case fields[0] == "tcp" || fields[0] == "tcp6":
			stateIdx, localIdx, peerIdx = 1, 4, 5
		default:
			stateIdx, localIdx, peerIdx = 0, 3, 4
		}

		if len(fields) <= peerIdx {
			continue
		}

		if !strings.HasPrefix(fields[stateIdx], "ESTAB") {
			continue
		}

		localAddr, localPort := splitAddrPort(fields[localIdx])
		remoteAddr, remotePort := splitAddrPort(fields[peerIdx])
		if remoteAddr == "" || remoteAddr == "*" || remoteAddr == "0.0.0.0" || remoteAddr == "::" {
			continue
		}

		conn := &Connection{
			LocalAddr:  localAddr,
			LocalPort:  localPort,
			RemoteAddr: remoteAddr,
			RemotePort: remotePort,
			State:      "ESTABLISHED",
		}

		// Optional process name on the same line.
		rest := strings.Join(fields[peerIdx+1:], " ")
		if m := ssProgRe.FindStringSubmatch(rest); m != nil {
			conn.Program = m[1]
			conn.Pid = m[2]
		}
		current = conn
	}

	if current != nil {
		conns = append(conns, *current)
	}
	return conns
}

// ---------------------------------------------------------------------------
// netstat parser (macOS / BSD)
// ---------------------------------------------------------------------------

// Example line from `netstat -an -p tcp` on macOS:
//
//	tcp4  0  0  192.168.1.2.22   10.0.0.5.52311  ESTABLISHED
var netstatRe = regexp.MustCompile(`^tcp[46]?\s+\d+\s+\d+\s+(\S+)\s+(\S+)\s+ESTABLISHED`)

func parseNetstat(data []byte) []Connection {
	var conns []Connection
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		m := netstatRe.FindStringSubmatch(scanner.Text())
		if m == nil {
			continue
		}
		localAddr, localPort := splitAddrPort(m[1])
		remoteAddr, remotePort := splitAddrPort(m[2])
		if remoteAddr == "" || remoteAddr == "*" {
			continue
		}
		conns = append(conns, Connection{
			LocalAddr:  localAddr,
			LocalPort:  localPort,
			RemoteAddr: remoteAddr,
			RemotePort: remotePort,
			State:      "ESTABLISHED",
		})
	}
	return conns
}

// ---------------------------------------------------------------------------
// Address/port helpers
// ---------------------------------------------------------------------------

// splitAddrPort splits an address:port string into its parts.
// Handles IPv4 colon form ("1.2.3.4:22"), IPv6 bracket form ("[::1]:22"),
// and macOS/BSD dot notation ("1.2.3.4.22").
func splitAddrPort(s string) (addr string, port int) {
	// IPv6 bracket form: [addr]:port
	if strings.HasPrefix(s, "[") {
		if end := strings.LastIndex(s, "]:"); end >= 0 {
			addr = s[1:end]
			port, _ = strconv.Atoi(s[end+2:])
			return
		}
		return s, 0
	}

	// Colon form: addr:port
	if idx := strings.LastIndex(s, ":"); idx >= 0 {
		addr = s[:idx]
		port, _ = strconv.Atoi(s[idx+1:])
		return
	}

	// macOS dot notation: a.b.c.d.port (5 dot-separated segments)
	parts := strings.Split(s, ".")
	if len(parts) == 5 {
		port, _ = strconv.Atoi(parts[4])
		addr = strings.Join(parts[:4], ".")
		return
	}

	return s, 0
}
