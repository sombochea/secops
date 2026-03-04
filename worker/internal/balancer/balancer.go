package balancer

import (
	"context"
	"hash/fnv"
	"io"
	"log"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

// Strategy defines how requests are distributed.
type Strategy string

const (
	RoundRobin        Strategy = "round-robin"
	LeastConnections  Strategy = "least-conn"
	ConsistentHashOrg Strategy = "hash-org" // hash on x-webhook-secret → same org always hits same backend
)

// Backend represents a single worker instance.
type Backend struct {
	URL         string
	alive       atomic.Bool
	activeConns atomic.Int64
}

func (b *Backend) IsAlive() bool      { return b.alive.Load() }
func (b *Backend) SetAlive(v bool)    { b.alive.Store(v) }
func (b *Backend) Conns() int64       { return b.activeConns.Load() }
func (b *Backend) ConnAdd()           { b.activeConns.Add(1) }
func (b *Backend) ConnDone()          { b.activeConns.Add(-1) }

// Balancer distributes webhook requests across backends.
type Balancer struct {
	backends []*Backend
	strategy Strategy
	counter  atomic.Uint64
	client   *http.Client
	mu       sync.RWMutex
}

// New creates a balancer with the given backends and strategy.
func New(urls []string, strategy Strategy) *Balancer {
	backends := make([]*Backend, len(urls))
	for i, u := range urls {
		b := &Backend{URL: u}
		b.SetAlive(true)
		backends[i] = b
	}

	lb := &Balancer{
		backends: backends,
		strategy: strategy,
		client: &http.Client{
			Timeout: 15 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        200,
				MaxIdleConnsPerHost: 50,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}

	// Start health checks
	go lb.healthLoop()

	return lb
}

func (lb *Balancer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/health" {
		lb.handleHealth(w)
		return
	}

	backend := lb.pick(r)
	if backend == nil {
		http.Error(w, `{"error":"no healthy backends"}`, http.StatusServiceUnavailable)
		return
	}

	lb.proxy(w, r, backend)
}

func (lb *Balancer) pick(r *http.Request) *Backend {
	alive := lb.aliveBackends()
	if len(alive) == 0 {
		return nil
	}

	switch lb.strategy {
	case LeastConnections:
		return lb.pickLeastConn(alive)
	case ConsistentHashOrg:
		return lb.pickHash(alive, r.Header.Get("X-Webhook-Secret"))
	default: // RoundRobin
		idx := lb.counter.Add(1) - 1
		return alive[idx%uint64(len(alive))]
	}
}

func (lb *Balancer) pickLeastConn(alive []*Backend) *Backend {
	best := alive[0]
	for _, b := range alive[1:] {
		if b.Conns() < best.Conns() {
			best = b
		}
	}
	return best
}

func (lb *Balancer) pickHash(alive []*Backend, key string) *Backend {
	if key == "" {
		return alive[0]
	}
	h := fnv.New32a()
	h.Write([]byte(key))
	return alive[h.Sum32()%uint32(len(alive))]
}

func (lb *Balancer) aliveBackends() []*Backend {
	lb.mu.RLock()
	defer lb.mu.RUnlock()
	var alive []*Backend
	for _, b := range lb.backends {
		if b.IsAlive() {
			alive = append(alive, b)
		}
	}
	return alive
}

func (lb *Balancer) proxy(w http.ResponseWriter, r *http.Request, b *Backend) {
	b.ConnAdd()
	defer b.ConnDone()

	target := b.URL + r.URL.Path
	proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, target, r.Body)
	if err != nil {
		http.Error(w, `{"error":"proxy error"}`, http.StatusBadGateway)
		return
	}

	// Copy headers
	for k, vv := range r.Header {
		for _, v := range vv {
			proxyReq.Header.Add(k, v)
		}
	}

	resp, err := lb.client.Do(proxyReq)
	if err != nil {
		b.SetAlive(false)
		http.Error(w, `{"error":"backend unavailable"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Copy response
	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func (lb *Balancer) handleHealth(w http.ResponseWriter) {
	alive := lb.aliveBackends()
	total := len(lb.backends)
	w.Header().Set("Content-Type", "application/json")
	if len(alive) == 0 {
		w.WriteHeader(503)
	}
	w.Write([]byte(`{"alive":` + itoa(len(alive)) + `,"total":` + itoa(total) + `,"strategy":"` + string(lb.strategy) + `"}`))
}

func (lb *Balancer) healthLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		lb.checkAll()
	}
}

func (lb *Balancer) checkAll() {
	var wg sync.WaitGroup
	for _, b := range lb.backends {
		b := b
		wg.Add(1)
		go func() {
			defer wg.Done()
			alive := lb.checkOne(b)
			was := b.IsAlive()
			b.SetAlive(alive)
			if was != alive {
				state := "UP"
				if !alive {
					state = "DOWN"
				}
				log.Printf("[balancer] %s → %s", b.URL, state)
			}
		}()
	}
	wg.Wait()
}

func (lb *Balancer) checkOne(b *Backend) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", b.URL+"/health", nil)
	resp, err := lb.client.Do(req)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == 200
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
}
