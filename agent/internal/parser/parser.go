package parser

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// Event is the webhook payload sent to the SOC dashboard.
type Event struct {
	Event      string            `json:"event"`
	Status     string            `json:"status,omitempty"`
	AuthMethod string            `json:"auth_method,omitempty"`
	Host       string            `json:"host,omitempty"`
	User       string            `json:"user,omitempty"`
	Ruser      string            `json:"ruser,omitempty"`
	SourceIP   string            `json:"source_ip,omitempty"`
	Service    string            `json:"service,omitempty"`
	Tty        string            `json:"tty,omitempty"`
	PamType    string            `json:"pam_type,omitempty"`
	Timestamp  string            `json:"timestamp"`
	UA         string            `json:"ua,omitempty"`
	Metadata   map[string]string `json:"metadata,omitempty"`
}

// --- Syslog ---
// Traditional BSD syslog: "Mon  2 15:04:05 host service[pid]: message"
var syslogRe = regexp.MustCompile(`^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+?)(?:\[\d+\])?:\s+(.*)`)

// RFC3339 / systemd-journal syslog: "2006-01-02T15:04:05.999999+07:00 host service[pid]: message"
var syslogRFC3339Re = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))\s+(\S+)\s+(\S+?)(?:\[\d+\])?:\s+(.*)`)

// SSH-specific patterns
var (
	sshFailedRe  = regexp.MustCompile(`Failed (\S+) for (?:invalid user )?(\S+) from ([\da-fA-F.:]+) port \d+`)
	sshAcceptRe  = regexp.MustCompile(`Accepted (\S+) for (\S+) from ([\da-fA-F.:]+) port \d+`)
	sshInvalidRe = regexp.MustCompile(`Invalid user (\S+) from ([\da-fA-F.:]+)`)
	sshSessionRe = regexp.MustCompile(`pam_unix\(\S+:session\): session (opened|closed) for user (\S+)`)
)

func ParseSyslog(line, host string) *Event {
	var ts, logHost, service, msg string

	if m := syslogRFC3339Re.FindStringSubmatch(line); m != nil {
		ts = parseRFC3339Time(m[1])
		logHost = m[2]
		service = m[3]
		msg = m[4]
	} else if m := syslogRe.FindStringSubmatch(line); m != nil {
		ts = parseSyslogTime(m[1])
		logHost = m[2]
		service = m[3]
		msg = m[4]
	} else {
		return nil
	}
	if host == "" {
		host = logHost
	}

	ev := &Event{
		Host:      host,
		Service:   service,
		Timestamp: ts,
	}

	if sm := sshFailedRe.FindStringSubmatch(msg); sm != nil {
		ev.Event = "ssh_attempt"
		ev.AuthMethod = sm[1]
		ev.User = sm[2]
		ev.SourceIP = sm[3]
		ev.Status = "failed"
		if strings.Contains(line, "invalid user") {
			ev.AuthMethod = "invalid_user"
		}
		return ev
	}
	if sm := sshAcceptRe.FindStringSubmatch(msg); sm != nil {
		ev.Event = "ssh_session_open"
		ev.AuthMethod = sm[1]
		ev.User = sm[2]
		ev.SourceIP = sm[3]
		ev.Status = "success"
		return ev
	}
	if sm := sshInvalidRe.FindStringSubmatch(msg); sm != nil {
		ev.Event = "ssh_attempt"
		ev.AuthMethod = "invalid_user"
		ev.User = sm[1]
		ev.SourceIP = sm[2]
		ev.Status = "failed"
		return ev
	}
	if sm := sshSessionRe.FindStringSubmatch(msg); sm != nil {
		if sm[1] == "opened" {
			ev.Event = "ssh_session_open"
		} else {
			ev.Event = "ssh_session_close"
		}
		ev.User = sm[2]
		ev.Status = sm[1]
		ev.PamType = "session"
		return ev
	}

	// Generic syslog event
	ev.Event = service + "_log"
	ev.Metadata = map[string]string{"message": truncate(msg, 500)}
	return ev
}

// --- JSON ---
func ParseJSON(line, host string) *Event {
	line = strings.TrimSpace(line)
	line = strings.TrimRight(line, ",")
	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(line), &raw); err != nil {
		return nil
	}
	ev := &Event{Host: host, Timestamp: time.Now().UTC().Format(time.RFC3339)}
	if v, ok := raw["event"].(string); ok {
		ev.Event = v
	} else if v, ok := raw["type"].(string); ok {
		ev.Event = v
	} else if v, ok := raw["action"].(string); ok {
		ev.Event = v
	} else {
		ev.Event = "json_event"
	}
	if v, ok := raw["status"].(string); ok {
		ev.Status = v
	}
	if v, ok := raw["user"].(string); ok {
		ev.User = v
	}
	if v, ok := raw["source_ip"].(string); ok {
		ev.SourceIP = v
	}
	if v, ok := raw["ip"].(string); ok && ev.SourceIP == "" {
		ev.SourceIP = v
	}
	if v, ok := raw["service"].(string); ok {
		ev.Service = v
	}
	if v, ok := raw["host"].(string); ok && host == "" {
		ev.Host = v
	}
	if v, ok := raw["auth_method"].(string); ok {
		ev.AuthMethod = v
	}
	if v, ok := raw["timestamp"].(string); ok {
		ev.Timestamp = v
	}
	if v, ok := raw["ua"].(string); ok {
		ev.UA = v
	}
	return ev
}

// --- CSV ---
// Expects header: event,status,user,source_ip,host,service,timestamp
func ParseCSV(line, host string, headers []string) *Event {
	r := csv.NewReader(strings.NewReader(line))
	fields, err := r.Read()
	if err != nil || len(fields) == 0 {
		return nil
	}
	ev := &Event{Host: host, Timestamp: time.Now().UTC().Format(time.RFC3339)}
	for i, h := range headers {
		if i >= len(fields) {
			break
		}
		v := strings.TrimSpace(fields[i])
		switch strings.ToLower(h) {
		case "event", "type":
			ev.Event = v
		case "status":
			ev.Status = v
		case "user":
			ev.User = v
		case "source_ip", "ip":
			ev.SourceIP = v
		case "host":
			if host == "" {
				ev.Host = v
			}
		case "service":
			ev.Service = v
		case "timestamp":
			ev.Timestamp = v
		case "auth_method":
			ev.AuthMethod = v
		}
	}
	if ev.Event == "" {
		ev.Event = "csv_event"
	}
	return ev
}

// --- Nginx ---
// Combined log: 1.2.3.4 - user [02/Jan/2006:15:04:05 +0000] "GET /path HTTP/1.1" 200 1234 "ref" "ua"
var nginxRe = regexp.MustCompile(`^([\da-fA-F.:]+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+\S+"\s+(\d+)\s+\d+\s+"[^"]*"\s+"([^"]*)"`)

func ParseNginx(line, host string) *Event {
	m := nginxRe.FindStringSubmatch(line)
	if m == nil {
		return nil
	}
	ts, _ := time.Parse("02/Jan/2006:15:04:05 -0700", m[3])
	status := "success"
	code := m[6]
	if code >= "400" {
		status = "failed"
	}
	user := m[2]
	if user == "-" {
		user = ""
	}
	return &Event{
		Event:     "http_" + strings.ToLower(m[4]),
		Status:    status,
		Host:      host,
		User:      user,
		SourceIP:  m[1],
		Service:   "nginx",
		UA:        m[7],
		Timestamp: ts.UTC().Format(time.RFC3339),
		Metadata:  map[string]string{"path": m[5], "status_code": code},
	}
}

// --- MySQL ---
// General/error log: "2024-01-15T10:30:00.000000Z 123 [Note] Access denied for user 'root'@'1.2.3.4'"
var mysqlRe = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s+\d+\s+\[(\w+)\]\s+(.*)`)
var mysqlAccessDenied = regexp.MustCompile(`Access denied for user '([^']*)'@'([^']*)'`)
var mysqlConnect = regexp.MustCompile(`Connect\s+(\S+)@(\S+)`)

func ParseMySQL(line, host string) *Event {
	m := mysqlRe.FindStringSubmatch(line)
	if m == nil {
		return nil
	}
	ev := &Event{Host: host, Service: "mysql", Timestamp: m[1]}

	if sm := mysqlAccessDenied.FindStringSubmatch(m[3]); sm != nil {
		ev.Event = "mysql_auth"
		ev.Status = "failed"
		ev.User = sm[1]
		ev.SourceIP = sm[2]
		return ev
	}
	if sm := mysqlConnect.FindStringSubmatch(m[3]); sm != nil {
		ev.Event = "mysql_connect"
		ev.Status = "success"
		ev.User = sm[1]
		ev.SourceIP = sm[2]
		return ev
	}

	ev.Event = "mysql_" + strings.ToLower(m[2])
	ev.Metadata = map[string]string{"message": truncate(m[3], 500)}
	return ev
}

// --- PostgreSQL ---
// "2024-01-15 10:30:00.000 UTC [12345] user@db LOG:  connection authorized"
var pgRe = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}\s+[\d:.]+\s+\S+)\s+\[\d+\]\s+(?:(\S+)@\S+\s+)?(\w+):\s+(.*)`)
var pgAuthFailed = regexp.MustCompile(`(?:authentication failed|no pg_hba.conf entry) for user "([^"]*)".*?(\d+\.\d+\.\d+\.\d+)?`)
var pgConnection = regexp.MustCompile(`connection (?:authorized|received).*?(\d+\.\d+\.\d+\.\d+)?`)

func ParsePostgres(line, host string) *Event {
	m := pgRe.FindStringSubmatch(line)
	if m == nil {
		return nil
	}
	ev := &Event{Host: host, Service: "postgresql", User: m[2], Timestamp: m[1]}

	if sm := pgAuthFailed.FindStringSubmatch(m[4]); sm != nil {
		ev.Event = "pg_auth"
		ev.Status = "failed"
		ev.User = sm[1]
		if sm[2] != "" {
			ev.SourceIP = sm[2]
		}
		return ev
	}
	if sm := pgConnection.FindStringSubmatch(m[4]); sm != nil {
		ev.Event = "pg_connection"
		ev.Status = "success"
		if sm[1] != "" {
			ev.SourceIP = sm[1]
		}
		return ev
	}

	ev.Event = fmt.Sprintf("pg_%s", strings.ToLower(m[3]))
	ev.Metadata = map[string]string{"message": truncate(m[4], 500)}
	return ev
}

// --- Helpers ---

func parseSyslogTime(s string) string {
	now := time.Now()
	t, err := time.Parse("Jan  2 15:04:05", s)
	if err != nil {
		t, err = time.Parse("Jan 2 15:04:05", s)
	}
	if err != nil {
		return now.UTC().Format(time.RFC3339)
	}
	// Assign current year; if the resulting time is in the future, use previous year.
	t = t.AddDate(now.Year(), 0, 0)
	if t.After(now.Add(24 * time.Hour)) {
		t = t.AddDate(-1, 0, 0)
	}
	return t.UTC().Format(time.RFC3339)
}

func parseRFC3339Time(s string) string {
	// Try full RFC3339 with sub-seconds and timezone.
	formats := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.999999999Z07:00",
		"2006-01-02T15:04:05Z",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t.UTC().Format(time.RFC3339)
		}
	}
	return time.Now().UTC().Format(time.RFC3339)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// --- Custom (regex with named groups) ---

func ParseCustom(line, host string, pattern *regexp.Regexp, eventName string, mapping map[string]string) *Event {
	m := pattern.FindStringSubmatch(line)
	if m == nil {
		return nil
	}
	groups := make(map[string]string)
	for i, name := range pattern.SubexpNames() {
		if i > 0 && name != "" {
			groups[name] = m[i]
		}
	}

	ev := &Event{Host: host, Timestamp: time.Now().UTC().Format(time.RFC3339)}

	// Resolve event name: static or "{{group}}"
	if strings.HasPrefix(eventName, "{{") && strings.HasSuffix(eventName, "}}") {
		key := strings.TrimSuffix(strings.TrimPrefix(eventName, "{{"), "}}")
		if v, ok := groups[key]; ok {
			ev.Event = v
		}
	}
	if ev.Event == "" {
		ev.Event = eventName
	}

	// Map fields from named groups
	for field, group := range mapping {
		v, ok := groups[group]
		if !ok || v == "" {
			continue
		}
		switch field {
		case "status":
			ev.Status = v
		case "user":
			ev.User = v
		case "source_ip":
			ev.SourceIP = v
		case "service":
			ev.Service = v
		case "auth_method":
			ev.AuthMethod = v
		case "timestamp":
			ev.Timestamp = v
		case "ua":
			ev.UA = v
		case "ruser":
			ev.Ruser = v
		case "tty":
			ev.Tty = v
		case "pam_type":
			ev.PamType = v
		default:
			if ev.Metadata == nil {
				ev.Metadata = make(map[string]string)
			}
			ev.Metadata[field] = v
		}
	}
	return ev
}
