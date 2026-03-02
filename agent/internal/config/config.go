package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type LogSource struct {
	Path   string `yaml:"path"`
	Format string `yaml:"format"` // syslog, json, csv, nginx, mysql, postgres
	Host   string `yaml:"host"`   // override hostname
	Tags   map[string]string `yaml:"tags"`
}

type Config struct {
	Endpoint   string      `yaml:"endpoint"`    // e.g. https://secops.example.com/api/webhook
	WebhookKey string      `yaml:"webhook_key"` // whk_...
	Hostname   string      `yaml:"hostname"`    // auto-detected if empty
	BatchSize  int         `yaml:"batch_size"`  // default 50
	FlushSec   int         `yaml:"flush_sec"`   // default 5
	Sources    []LogSource `yaml:"sources"`
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
	for i := range c.Sources {
		if c.Sources[i].Host == "" {
			c.Sources[i].Host = c.Hostname
		}
	}
	return &c, nil
}
