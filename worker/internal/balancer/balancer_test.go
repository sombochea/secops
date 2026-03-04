package balancer

import (
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func makeBackends(n int) ([]*httptest.Server, []string) {
	servers := make([]*httptest.Server, n)
	urls := make([]string, n)
	for i := range servers {
		servers[i] = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/health" {
				w.WriteHeader(200)
				return
			}
			w.WriteHeader(202)
			w.Write([]byte(`{"queued":1}`))
		}))
		urls[i] = servers[i].URL
	}
	return servers, urls
}

func closeAll(servers []*httptest.Server) {
	for _, s := range servers {
		s.Close()
	}
}

func TestRoundRobin(t *testing.T) {
	servers, urls := makeBackends(3)
	defer closeAll(servers)

	lb := New(urls, RoundRobin)
	ts := httptest.NewServer(lb)
	defer ts.Close()

	for i := 0; i < 9; i++ {
		resp, err := http.Post(ts.URL+"/api/webhook", "application/json", nil)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != 202 {
			t.Fatalf("expected 202, got %d", resp.StatusCode)
		}
	}
}

func TestLeastConn(t *testing.T) {
	servers, urls := makeBackends(2)
	defer closeAll(servers)

	lb := New(urls, LeastConnections)
	ts := httptest.NewServer(lb)
	defer ts.Close()

	for i := 0; i < 6; i++ {
		resp, err := http.Post(ts.URL+"/api/webhook", "application/json", nil)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != 202 {
			t.Fatalf("expected 202, got %d", resp.StatusCode)
		}
	}
}

func TestHashOrg(t *testing.T) {
	servers, urls := makeBackends(3)
	defer closeAll(servers)

	lb := New(urls, ConsistentHashOrg)
	ts := httptest.NewServer(lb)
	defer ts.Close()

	// Same key should always hit the same backend
	for i := 0; i < 5; i++ {
		req, _ := http.NewRequest("POST", ts.URL+"/api/webhook", nil)
		req.Header.Set("X-Webhook-Secret", "whk_test_key_123")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != 202 {
			t.Fatalf("expected 202, got %d", resp.StatusCode)
		}
	}
}

func TestHealthEndpoint(t *testing.T) {
	servers, urls := makeBackends(2)
	defer closeAll(servers)

	lb := New(urls, RoundRobin)
	ts := httptest.NewServer(lb)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}
}

func TestBackendDown(t *testing.T) {
	servers, urls := makeBackends(2)
	// Kill one backend
	servers[0].Close()

	lb := New(urls, RoundRobin)
	// Mark first as down
	lb.backends[0].SetAlive(false)

	ts := httptest.NewServer(lb)
	defer ts.Close()
	defer servers[1].Close()

	// All requests should go to the alive backend
	for i := 0; i < 5; i++ {
		resp, err := http.Post(ts.URL+"/api/webhook", "application/json", nil)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != 202 {
			t.Fatalf("expected 202, got %d", resp.StatusCode)
		}
	}
}

func TestAllBackendsDown(t *testing.T) {
	_, urls := makeBackends(0)
	lb := New(urls, RoundRobin)
	ts := httptest.NewServer(lb)
	defer ts.Close()

	resp, err := http.Post(ts.URL+"/api/webhook", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 503 {
		t.Fatalf("expected 503, got %d", resp.StatusCode)
	}
}

// ─── Benchmarks ──────────────────────────────────────────────────────────────

func BenchmarkRoundRobin(b *testing.B) {
	servers, urls := makeBackends(3)
	defer closeAll(servers)

	lb := New(urls, RoundRobin)
	ts := httptest.NewServer(lb)
	defer ts.Close()

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		resp, _ := http.Post(ts.URL+"/api/webhook", "application/json", nil)
		if resp != nil {
			resp.Body.Close()
		}
	}
}

func BenchmarkLeastConn(b *testing.B) {
	servers, urls := makeBackends(3)
	defer closeAll(servers)

	lb := New(urls, LeastConnections)
	ts := httptest.NewServer(lb)
	defer ts.Close()

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		resp, _ := http.Post(ts.URL+"/api/webhook", "application/json", nil)
		if resp != nil {
			resp.Body.Close()
		}
	}
}

func BenchmarkParallelRoundRobin(b *testing.B) {
	servers, urls := makeBackends(4)
	defer closeAll(servers)

	lb := New(urls, RoundRobin)
	ts := httptest.NewServer(lb)
	defer ts.Close()

	var count atomic.Int64
	b.ResetTimer()
	b.ReportAllocs()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			resp, _ := http.Post(ts.URL+"/api/webhook", "application/json", nil)
			if resp != nil {
				resp.Body.Close()
				count.Add(1)
			}
		}
	})
}
