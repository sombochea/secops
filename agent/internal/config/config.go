package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type FormatParser struct {
	Pattern   string            `yaml:"pattern"`    // Go regex with named groups
	Event     string            `yaml:"event"`      // static event name or "{{group_name}}"
	Mapping   map[string]string `yaml:"mapping"`    // field -> regex group name
}

type LogSource struct {
	Path         string            `yaml:"path"`
	Format       string            `yaml:"format"` // syslog, json, csv, nginx, mysql, postgres, custom
	Host         string            `yaml:"host"`
	Tags         map[string]string `yaml:"tags"`
	FormatParser *FormatParser     `yaml:"format_parser"` // required when format=custom
}

type Config struct {
	Endpoint    string      `yaml:"endpoint"`
	WebhookKey  string      `yaml:"webhook_key"`
	Hostname    string      `yaml:"hostname"`
	BatchSize   int         `yaml:"batch_size"`
	FlushSec    int         `yaml:"flush_sec"`
	AutoUpdate  bool        `yaml:"auto_update"`
	UpdateRepo  string      `yaml:"update_repo"` // default: sombochea/secops
	Sources     []LogSource `yaml:"sources"`
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
