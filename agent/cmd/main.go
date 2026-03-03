package main

import (
	"bufio"
	"encoding/csv"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"regexp"
	"strings"
	"syscall"

	"github.com/sombochea/secops/agent/internal/config"
	"github.com/sombochea/secops/agent/internal/parser"
	"github.com/sombochea/secops/agent/internal/sender"
	"github.com/sombochea/secops/agent/internal/tailer"
	"github.com/sombochea/secops/agent/internal/updater"
	"github.com/sombochea/secops/agent/internal/version"
)

func main() {
	cfgPath := flag.String("config", "/etc/secops-agent/config.yaml", "config file path")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Printf("secops-agent %s (commit: %s, built: %s)\n", version.Version, version.Commit, version.BuildDate)
		os.Exit(0)
	}

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	log.Printf("SecOps Agent %s (commit: %s, built: %s)", version.Version, version.Commit, version.BuildDate)
	log.Printf("endpoint=%s host=%s sources=%d batch=%d flush=%ds",
		cfg.Endpoint, cfg.Hostname, len(cfg.Sources), cfg.BatchSize, cfg.FlushSec)

	// Auto-update check
	if cfg.AutoUpdate {
		updater.CheckAndUpdate(cfg.UpdateRepo)
	}

	s := sender.New(cfg.Endpoint, cfg.WebhookKey, cfg.BatchSize, cfg.FlushSec)
	s.Start()

	done := make(chan struct{})
	lines := make(chan taggedLine, 1000)

	for _, src := range cfg.Sources {
		var csvHeaders []string
		if src.Format == "csv" {
			csvHeaders = readCSVHeaders(src.Path)
		}
		var customRe *regexp.Regexp
		if src.Format == "custom" && src.FormatParser != nil {
			customRe, err = regexp.Compile(src.FormatParser.Pattern)
			if err != nil {
				log.Fatalf("invalid regex for %s: %v", src.Path, err)
			}
		}
		go func() {
			raw := make(chan string, 500)
			go tailer.Tail(src.Path, raw, done)
			for line := range raw {
				lines <- taggedLine{line: line, src: src, csvHeaders: csvHeaders, customRe: customRe}
			}
		}()
	}

	go func() {
		for tl := range lines {
			ev := parseLine(tl)
			if ev == nil {
				log.Printf("[parser] failed to parse (%s): %s", tl.src.Format, truncateLine(tl.line, 120))
				continue
			}
			if ev.Metadata == nil {
				ev.Metadata = make(map[string]string)
			}
			for k, v := range tl.src.Tags {
				ev.Metadata[k] = v
			}
			s.Send(ev)
		}
	}()

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
	customRe   *regexp.Regexp
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
	case "custom":
		if tl.customRe != nil && tl.src.FormatParser != nil {
			return parser.ParseCustom(tl.line, tl.src.Host, tl.customRe, tl.src.FormatParser.Event, tl.src.FormatParser.Mapping)
		}
		return nil
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

func truncateLine(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
