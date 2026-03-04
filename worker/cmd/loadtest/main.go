package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

func main() {
	url := flag.String("url", "http://localhost:4000/api/webhook", "worker webhook URL")
	key := flag.String("key", os.Getenv("WEBHOOK_KEY"), "webhook secret key")
	total := flag.Int("n", 10000, "total events to send")
	concurrency := flag.Int("c", 50, "concurrent requests")
	batchSize := flag.Int("batch", 50, "events per request")
	flag.Parse()

	if *key == "" {
		fmt.Fprintln(os.Stderr, "WEBHOOK_KEY env or -key flag required")
		os.Exit(1)
	}

	attackers := []string{"203.0.113.42", "198.51.100.7", "185.220.101.33", "45.155.205.99", "91.240.118.172"}
	hosts := []string{"prod-web-01", "prod-db-01", "prod-api-02", "staging-app-01", "bastion-01"}
	users := []string{"root", "admin", "test", "deploy", "ubuntu", "guest"}
	events := []string{"ssh_attempt", "http_request", "ssh_session_open", "pg_auth", "mysql_auth"}
	statuses := []string{"failed", "success", "failed", "failed", "suspicious"}

	makeBatch := func(n int) []byte {
		batch := make([]map[string]interface{}, n)
		for i := range batch {
			batch[i] = map[string]interface{}{
				"event":     events[rand.Intn(len(events))],
				"status":    statuses[rand.Intn(len(statuses))],
				"source_ip": attackers[rand.Intn(len(attackers))],
				"host":      hosts[rand.Intn(len(hosts))],
				"user":      users[rand.Intn(len(users))],
				"service":   "sshd",
				"timestamp": time.Now().UTC().Format(time.RFC3339),
			}
		}
		b, _ := json.Marshal(batch)
		return b
	}

	client := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        *concurrency * 2,
			MaxIdleConnsPerHost: *concurrency * 2,
			IdleConnTimeout:     90 * time.Second,
		},
	}

	requests := *total / *batchSize
	if requests == 0 {
		requests = 1
	}

	var (
		sent     atomic.Int64
		failed   atomic.Int64
		queued   atomic.Int64
		totalMs  atomic.Int64
	)

	sem := make(chan struct{}, *concurrency)
	var wg sync.WaitGroup

	fmt.Printf("Load test: %d events, %d events/batch, %d concurrent, %d requests\n",
		*total, *batchSize, *concurrency, requests)
	fmt.Printf("Target: %s\n\n", *url)

	start := time.Now()

	for i := 0; i < requests; i++ {
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()

			body := makeBatch(*batchSize)
			req, _ := http.NewRequest("POST", *url, bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Webhook-Secret", *key)

			t0 := time.Now()
			resp, err := client.Do(req)
			latency := time.Since(t0).Milliseconds()
			totalMs.Add(latency)

			if err != nil {
				failed.Add(1)
				return
			}
			defer resp.Body.Close()

			sent.Add(1)
			if resp.StatusCode == 202 {
				var result struct {
					Queued int `json:"queued"`
				}
				json.NewDecoder(resp.Body).Decode(&result)
				queued.Add(int64(result.Queued))
			} else {
				failed.Add(1)
			}
		}()
	}

	// Progress
	go func() {
		for {
			time.Sleep(time.Second)
			s := sent.Load()
			f := failed.Load()
			q := queued.Load()
			if s+f >= int64(requests) {
				return
			}
			elapsed := time.Since(start).Seconds()
			fmt.Printf("  [%.0fs] requests=%d/%d failed=%d queued=%d rate=%.0f events/s\n",
				elapsed, s, requests, f, q, float64(q)/elapsed)
		}
	}()

	wg.Wait()
	elapsed := time.Since(start)

	s := sent.Load()
	f := failed.Load()
	q := queued.Load()
	avgMs := float64(0)
	if s > 0 {
		avgMs = float64(totalMs.Load()) / float64(s)
	}

	fmt.Printf("\n── Results ─────────────────────────────────────\n")
	fmt.Printf("Duration:       %s\n", elapsed.Round(time.Millisecond))
	fmt.Printf("Requests:       %d sent, %d failed\n", s, f)
	fmt.Printf("Events queued:  %d\n", q)
	fmt.Printf("Throughput:     %.0f events/sec\n", float64(q)/elapsed.Seconds())
	fmt.Printf("Req throughput: %.0f req/sec\n", float64(s)/elapsed.Seconds())
	fmt.Printf("Avg latency:    %.1f ms\n", avgMs)
	fmt.Printf("────────────────────────────────────────────────\n")
}
