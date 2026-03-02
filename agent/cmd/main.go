package main

import (
	"bufio"
	"encoding/csv"
	"flag"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/sombochea/secops/agent/internal/config"
	"github.com/sombochea/secops/agent/internal/parser"
	"github.com/sombochea/secops/agent/internal/sender"
	"github.com/sombochea/secops/agent/internal/tailer"
)

func main() {
	cfgPath := flag.String("config", "/etc/secops-agent/config.yaml", "config file path")
	flag.Parse()

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	log.Printf("SecOps Agent starting — endpoint=%s host=%s sources=%d batch=%d flush=%ds",
		cfg.Endpoint, cfg.Hostname, len(cfg.Sources), cfg.BatchSize, cfg.FlushSec)

	s := sender.New(cfg.Endpoint, cfg.WebhookKey, cfg.BatchSize, cfg.FlushSec)
	s.Start()

	done := make(chan struct{})
	lines := make(chan taggedLine, 1000)

	for _, src := range cfg.Sources {
		src := src
		// Read CSV headers from first line if format is csv
		var csvHeaders []string
		if src.Format == "csv" {
			csvHeaders = readCSVHeaders(src.Path)
		}
		go func() {
			raw := make(chan string, 500)
			go tailer.Tail(src.Path, raw, done)
			for line := range raw {
				lines <- taggedLine{line: line, src: src, csvHeaders: csvHeaders}
			}
		}()
	}

	// Process lines
	go func() {
		for tl := range lines {
			ev := parseLine(tl)
			if ev == nil {
				continue
			}
			// Apply tags
			if ev.Metadata == nil {
				ev.Metadata = make(map[string]string)
			}
			for k, v := range tl.src.Tags {
				ev.Metadata[k] = v
			}
			s.Send(ev)
		}
	}()

	// Wait for signal
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	log.Println("shutting down...")
	close(done)
	s.Stop()
}

type taggedLine struct {
	line       string
	src        config.LogSource
	csvHeaders []string
}

func parseLine(tl taggedLine) *parser.Event {
	switch tl.src.Format {
	case "syslog":
		return parser.ParseSyslog(tl.line, tl.src.Host)
	case "json":
		return parser.ParseJSON(tl.line, tl.src.Host)
	case "csv":
		return parser.ParseCSV(tl.line, tl.src.Host, tl.csvHeaders)
	case "nginx":
		return parser.ParseNginx(tl.line, tl.src.Host)
	case "mysql":
		return parser.ParseMySQL(tl.line, tl.src.Host)
	case "postgres":
		return parser.ParsePostgres(tl.line, tl.src.Host)
	default:
		return parser.ParseSyslog(tl.line, tl.src.Host)
	}
}

func readCSVHeaders(path string) []string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	r := csv.NewReader(bufio.NewReader(f))
	row, err := r.Read()
	if err != nil {
		return nil
	}
	for i := range row {
		row[i] = strings.TrimSpace(row[i])
	}
	return row
}
