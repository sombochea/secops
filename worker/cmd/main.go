package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
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
	flag.Parse()

	if *dbURL == "" {
		log.Fatal("DATABASE_URL is required (flag -db or env)")
	}
	if *walDir == "" {
		*walDir = "/tmp/secops-wal"
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// PostgreSQL connection pool
	poolCfg, err := pgxpool.ParseConfig(*dbURL)
	if err != nil {
		log.Fatalf("parse db url: %v", err)
	}
	poolCfg.MaxConns = int32(*workers * 2)
	poolCfg.MinConns = int32(*workers)

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		log.Fatalf("connect to db: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("ping db: %v", err)
	}
	log.Printf("connected to PostgreSQL (pool: %d-%d conns)", poolCfg.MinConns, poolCfg.MaxConns)

	// WAL
	wal, err := queue.NewWAL(*walDir, *segmentSize)
	if err != nil {
		log.Fatalf("init WAL: %v", err)
	}
	defer wal.Close()
	log.Printf("WAL dir: %s (segment size: %d)", *walDir, *segmentSize)

	// Start consumer workers
	ins := inserter.New(pool, *batchSize)
	done := make(chan struct{})

	for i := 0; i < *workers; i++ {
		go consumer(ctx, i, wal, ins, *flushInterval, done)
	}
	log.Printf("started %d insert workers (batch: %d, flush: %s)", *workers, *batchSize, *flushInterval)

	// Flush ticker — rotates WAL segment periodically so consumers can pick it up
	go func() {
		ticker := time.NewTicker(*flushInterval)
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

	// HTTP server
	h := handler.New(wal, pool)
	srv := &http.Server{
		Addr:         *addr,
		Handler:      h,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("listening on %s", *addr)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("http: %v", err)
		}
	}()

	// Graceful shutdown
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	log.Println("shutting down...")

	cancel()
	srv.Shutdown(context.Background())
	wal.ForceRotate()

	// Drain remaining segments
	drainSegments(context.Background(), wal, ins)

	close(done)
	log.Println("shutdown complete")
}

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
			// Don't remove — will retry on next pass
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
