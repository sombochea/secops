package sender

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/sombochea/secops/agent/internal/parser"
)

type Sender struct {
	endpoint   string
	webhookKey string
	batchSize  int
	flushSec   int
	client     *http.Client
	mu         sync.Mutex
	buf        []parser.Event
	done       chan struct{}
}

func New(endpoint, webhookKey string, batchSize, flushSec int) *Sender {
	return &Sender{
		endpoint:   endpoint,
		webhookKey: webhookKey,
		batchSize:  batchSize,
		flushSec:   flushSec,
		client:     &http.Client{Timeout: 10 * time.Second},
		done:       make(chan struct{}),
	}
}

func (s *Sender) Send(ev *parser.Event) {
	s.mu.Lock()
	s.buf = append(s.buf, *ev)
	shouldFlush := len(s.buf) >= s.batchSize
	s.mu.Unlock()
	if shouldFlush {
		s.Flush()
	}
}

// SendUrgent adds ev to the buffer and immediately flushes the entire buffer.
// Use this for suspicious/high-priority events that must not wait for the
// normal batch interval.
func (s *Sender) SendUrgent(ev *parser.Event) {
	s.mu.Lock()
	s.buf = append(s.buf, *ev)
	s.mu.Unlock()
	s.Flush()
}

func (s *Sender) Start() {
	ticker := time.NewTicker(time.Duration(s.flushSec) * time.Second)
	go func() {
		for {
			select {
			case <-ticker.C:
				s.Flush()
			case <-s.done:
				ticker.Stop()
				s.Flush()
				return
			}
		}
	}()
}

func (s *Sender) Stop() {
	close(s.done)
}

func (s *Sender) Flush() {
	s.mu.Lock()
	if len(s.buf) == 0 {
		s.mu.Unlock()
		return
	}
	batch := s.buf
	s.buf = nil
	s.mu.Unlock()

	body, err := json.Marshal(batch)
	if err != nil {
		log.Printf("[sender] marshal error: %v", err)
		return
	}

	req, err := http.NewRequest("POST", s.endpoint, bytes.NewReader(body))
	if err != nil {
		log.Printf("[sender] request error: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Secret", s.webhookKey)
	req.Header.Set("User-Agent", "SecOps-Agent/1.0")

	resp, err := s.client.Do(req)
	if err != nil {
		log.Printf("[sender] send error (%d events): %v", len(batch), err)
		return
	}
	resp.Body.Close()

	if resp.StatusCode >= 300 {
		log.Printf("[sender] server returned %d for %d events", resp.StatusCode, len(batch))
	} else {
		log.Printf("[sender] sent %d events", len(batch))
	}
}

func (s *Sender) Stats() string {
	s.mu.Lock()
	n := len(s.buf)
	s.mu.Unlock()
	return fmt.Sprintf("buffered=%d", n)
}
