package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type FormatParser struct {
	Pattern string            `yaml:"pattern"` // Go regex with named groups
	Event   string            `yaml:"event"`   // static event name or "{{group_name}}"
	Mapping map[string]string `yaml:"mapping"` // field -> regex group name
}

type LogSource struct {
	Path         string            `yaml:"path"`
	Format       string            `yaml:"format"` // syslog, json, csv, nginx, mysql, postgres, custom
	Host         string            `yaml:"host"`
	Tags         map[string]string `yaml:"tags"`
	FormatParser *FormatParser     `yaml:"format_parser"` // required when format=custom
}

// ConnectionTracking configures the built-in TCP connection tracker.
type ConnectionTracking struct {
	// Enabled turns connection tracking on or off.
	Enabled bool `yaml:"enabled"`
	// IntervalSec is how often (in seconds) to snapshot active connections.
	// Default: 30.
	IntervalSec int `yaml:"interval_sec"`
	// WatchPorts limits tracking to connections whose local port is in this
	// list.  Leave empty to track all ports.
	WatchPorts []int `yaml:"watch_ports"`
	// SuspiciousThreshold is the minimum accumulated bad-event count (failed
	// auth, blocked, etc.) for a source IP to be considered suspicious.
	// Default: 3.
	SuspiciousThreshold int `yaml:"suspicious_threshold"`
}

type Config struct {
	Endpoint           string             `yaml:"endpoint"`
	WebhookKey         string             `yaml:"webhook_key"`
	Hostname           string             `yaml:"hostname"`
	BatchSize          int                `yaml:"batch_size"`
	FlushSec           int                `yaml:"flush_sec"`
	AutoUpdate         bool               `yaml:"auto_update"`
	UpdateRepo         string             `yaml:"update_repo"` // default: sombochea/secops
	Sources            []LogSource        `yaml:"sources"`
	ConnectionTracking ConnectionTracking `yaml:"connection_tracking"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var c Config
	if err := yaml.Unmarshal(data, &c); err != nil {
		return nil, err
	}
	if c.BatchSize <= 0 {
		c.BatchSize = 50
	}
	if c.FlushSec <= 0 {
		c.FlushSec = 5
	}
	if c.Hostname == "" {
		c.Hostname, _ = os.Hostname()
	}
	if c.UpdateRepo == "" {
		c.UpdateRepo = "sombochea/secops"
	}
	for i := range c.Sources {
		if c.Sources[i].Host == "" {
			c.Sources[i].Host = c.Hostname
		}
	}
	return &c, nil
}
