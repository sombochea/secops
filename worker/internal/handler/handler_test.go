package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sombochea/secops/worker/internal/queue"
)

// mockHandler creates a handler with a WAL but no real DB (key validation bypassed).
type testHandler struct {
	wal *queue.WAL
}

func (h *testHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/health" {
		w.WriteHeader(200)
		return
	}
	if r.URL.Path != "/api/webhook" || r.Method != http.MethodPost {
		http.Error(w, "not found", 404)
		return
	}

	// Skip key validation for benchmarks — just parse and queue
	body := make([]byte, r.ContentLength)
	r.Body.Read(body)

	var raw []json.RawMessage
	if len(body) > 0 && body[0] == '[' {
		json.Unmarshal(body, &raw)
	} else {
		raw = []json.RawMessage{body}
	}

	events := make([]queue.Event, 0, len(raw))
	for _, rm := range raw {
		var e struct {
			Event     string `json:"event"`
			Status    string `json:"status"`
			SourceIP  string `json:"source_ip"`
			Host      string `json:"host"`
			User      string `json:"user"`
			Service   string `json:"service"`
			Timestamp string `json:"timestamp"`
		}
		if json.Unmarshal(rm, &e) != nil {
			continue
		}
		events = append(events, queue.Event{
			OrgID:     "bench-org",
			Event:     e.Event,
			Status:    e.Status,
			SourceIP:  e.SourceIP,
			Host:      e.Host,
			User:      e.User,
			Service:   e.Service,
			Timestamp: e.Timestamp,
		})
	}

	h.wal.Append(events)
	w.WriteHeader(202)
	json.NewEncoder(w).Encode(map[string]int{"queued": len(events)})
}

func singleEventJSON() []byte {
	b, _ := json.Marshal(map[string]string{
		"event": "ssh_attempt", "status": "failed", "source_ip": "203.0.113.42",
		"host": "prod-web-01", "user": "root", "service": "sshd",
		"timestamp": "2026-03-04T08:00:00Z",
	})
	return b
}

func batchEventJSON(n int) []byte {
	events := make([]map[string]string, n)
	for i := range events {
		events[i] = map[string]string{
			"event": "ssh_attempt", "status": "failed", "source_ip": "203.0.113.42",
			"host": "prod-web-01", "user": "root", "service": "sshd",
			"timestamp": "2026-03-04T08:00:00Z",
		}
	}
	b, _ := json.Marshal(events)
	return b
}

func BenchmarkHTTPSingle(b *testing.B) {
	dir := b.TempDir()
	wal, _ := queue.NewWAL(dir, 100000)
	defer wal.Close()
	h := &testHandler{wal: wal}
	srv := httptest.NewServer(h)
	defer srv.Close()

	body := singleEventJSON()
	b.ResetTimer()
	b.ReportAllocs()
	b.SetBytes(int64(len(body)))

	for i := 0; i < b.N; i++ {
		resp, _ := http.Post(srv.URL+"/api/webhook", "application/json", bytes.NewReader(body))
		resp.Body.Close()
	}
}

func BenchmarkHTTPBatch50(b *testing.B) {
	dir := b.TempDir()
	wal, _ := queue.NewWAL(dir, 100000)
	defer wal.Close()
	h := &testHandler{wal: wal}
	srv := httptest.NewServer(h)
	defer srv.Close()

	body := batchEventJSON(50)
	b.ResetTimer()
	b.ReportAllocs()
	b.SetBytes(int64(len(body)))

	for i := 0; i < b.N; i++ {
		resp, _ := http.Post(srv.URL+"/api/webhook", "application/json", bytes.NewReader(body))
		resp.Body.Close()
	}
}

func BenchmarkHTTPBatch500(b *testing.B) {
	dir := b.TempDir()
	wal, _ := queue.NewWAL(dir, 100000)
	defer wal.Close()
	h := &testHandler{wal: wal}
	srv := httptest.NewServer(h)
	defer srv.Close()

	body := batchEventJSON(500)
	b.ResetTimer()
	b.ReportAllocs()
	b.SetBytes(int64(len(body)))

	for i := 0; i < b.N; i++ {
		resp, _ := http.Post(srv.URL+"/api/webhook", "application/json", bytes.NewReader(body))
		resp.Body.Close()
	}
}

func BenchmarkHTTPParallel(b *testing.B) {
	dir := b.TempDir()
	wal, _ := queue.NewWAL(dir, 1000000)
	defer wal.Close()
	h := &testHandler{wal: wal}
	srv := httptest.NewServer(h)
	defer srv.Close()

	body := batchEventJSON(10)
	b.ResetTimer()
	b.ReportAllocs()

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			resp, _ := http.Post(srv.URL+"/api/webhook", "application/json", bytes.NewReader(body))
			if resp != nil {
				resp.Body.Close()
			}
		}
	})
}
