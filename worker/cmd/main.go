package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sombochea/secops/worker/internal/balancer"
	"github.com/sombochea/secops/worker/internal/handler"
	"github.com/sombochea/secops/worker/internal/inserter"
	"github.com/sombochea/secops/worker/internal/queue"
)

func main() {
	addr := flag.String("addr", ":4000", "listen address")
	dbURL := flag.String("db", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	walDir := flag.String("wal-dir", os.Getenv("WAL_DIR"), "WAL directory (default: /tmp/secops-wal)")
	workers := flag.Int("workers", 4, "number of insert workers")
	batchSize := flag.Int("batch", 500, "max rows per INSERT statement")
	flushInterval := flag.Duration("flush", 2*time.Second, "max time before flushing WAL segment")
	segmentSize := flag.Int("segment-size", 10000, "max events per WAL segment file")

	mode := flag.String("mode", "worker", "run mode: worker | balancer")
	backends := flag.String("backends", os.Getenv("BACKENDS"), "comma-separated backend URLs (balancer mode)")
	strategy := flag.String("strategy", "round-robin", "balancer strategy: round-robin | least-conn | hash-org")
	flag.Parse()

	if *mode == "balancer" {
		runBalancer(*addr, *backends, *strategy)
		return
	}
	runWorker(*addr, *dbURL, *walDir, *workers, *batchSize, *flushInterval, *segmentSize)
}

// ─── Balancer Mode ───────────────────────────────────────────────────────────

func runBalancer(addr, backendsStr, strategyStr string) {
	if backendsStr == "" {
		log.Fatal("BACKENDS is required in balancer mode (comma-separated URLs)")
	}
	urls := strings.Split(backendsStr, ",")
	for i := range urls {
		urls[i] = strings.TrimSpace(urls[i])
	}

	s := balancer.RoundRobin
	switch strategyStr {
	case "least-conn":
		s = balancer.LeastConnections
	case "hash-org":
		s = balancer.ConsistentHashOrg
	}

	lb := balancer.New(urls, s)
	srv := &http.Server{
		Addr:         addr,
		Handler:      lb,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("[balancer] strategy=%s backends=%v addr=%s", s, urls, addr)
	go func() {
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("http: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	log.Println("shutting down balancer...")
	srv.Shutdown(context.Background())
}

// ─── Worker Mode ─────────────────────────────────────────────────────────────

func runWorker(addr, dbURL, walDir string, numWorkers, batchSize int, flushInterval time.Duration, segmentSize int) {
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required (flag -db or env)")
	}
	if walDir == "" {
		walDir = "/tmp/secops-wal"
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	poolCfg, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		log.Fatalf("parse db url: %v", err)
	}
	poolCfg.MaxConns = int32(numWorkers * 2)
	poolCfg.MinConns = int32(numWorkers)

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		log.Fatalf("connect to db: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("ping db: %v", err)
	}
	log.Printf("connected to PostgreSQL (pool: %d-%d conns)", poolCfg.MinConns, poolCfg.MaxConns)

	wal, err := queue.NewWAL(walDir, segmentSize)
	if err != nil {
		log.Fatalf("init WAL: %v", err)
	}
	defer wal.Close()
	log.Printf("WAL dir: %s (segment size: %d)", walDir, segmentSize)

	ins := inserter.New(pool, batchSize)
	done := make(chan struct{})

	for i := 0; i < numWorkers; i++ {
		go consumer(ctx, i, wal, ins, flushInterval, done)
	}
	log.Printf("started %d insert workers (batch: %d, flush: %s)", numWorkers, batchSize, flushInterval)

	go func() {
		ticker := time.NewTicker(flushInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				wal.ForceRotate()
			}
		}
	}()

	h := handler.New(wal, pool)
	srv := &http.Server{
		Addr:         addr,
		Handler:      h,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("listening on %s", addr)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("http: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	log.Println("shutting down...")

	cancel()
	srv.Shutdown(context.Background())
	wal.ForceRotate()
	drainSegments(context.Background(), wal, ins)
	close(done)
	log.Println("shutdown complete")
}

// ─── Consumer ────────────────────────────────────────────────────────────────

func consumer(ctx context.Context, id int, wal *queue.WAL, ins *inserter.Inserter, flushInterval time.Duration, done chan struct{}) {
	tag := fmt.Sprintf("[worker-%d]", id)
	for {
		select {
		case <-ctx.Done():
			return
		case <-wal.Notify():
			processSegments(ctx, tag, wal, ins)
		case <-time.After(flushInterval):
			processSegments(ctx, tag, wal, ins)
		}
	}
}

func processSegments(ctx context.Context, tag string, wal *queue.WAL, ins *inserter.Inserter) {
	segs, err := wal.ReadSegments()
	if err != nil {
		log.Printf("%s read segments: %v", tag, err)
		return
	}
	for _, seg := range segs {
		if ctx.Err() != nil {
			return
		}
		events, err := queue.ReadEvents(seg)
		if err != nil {
			log.Printf("%s read %s: %v", tag, seg, err)
			continue
		}
		if len(events) == 0 {
			queue.Remove(seg)
			continue
		}
		n, err := ins.InsertBatch(ctx, events)
		if err != nil {
			log.Printf("%s insert %s (%d events): %v", tag, seg, len(events), err)
			continue
		}
		queue.Remove(seg)
		log.Printf("%s inserted %d events from %s", tag, n, seg)
	}
}

func drainSegments(ctx context.Context, wal *queue.WAL, ins *inserter.Inserter) {
	segs, _ := wal.ReadSegments()
	for _, seg := range segs {
		events, err := queue.ReadEvents(seg)
		if err != nil || len(events) == 0 {
			queue.Remove(seg)
			continue
		}
		n, err := ins.InsertBatch(ctx, events)
		if err != nil {
			log.Printf("[drain] failed %s: %v", seg, err)
			continue
		}
		queue.Remove(seg)
		log.Printf("[drain] inserted %d events from %s", n, seg)
	}
}
