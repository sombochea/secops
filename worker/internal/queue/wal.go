package queue

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Event is the raw webhook event with org context.
type Event struct {
	OrgID      string                 `json:"org_id"`
	Event      string                 `json:"event"`
	Status     string                 `json:"status,omitempty"`
	AuthMethod string                 `json:"auth_method,omitempty"`
	Host       string                 `json:"host,omitempty"`
	User       string                 `json:"user,omitempty"`
	Ruser      string                 `json:"ruser,omitempty"`
	SourceIP   string                 `json:"source_ip,omitempty"`
	Service    string                 `json:"service,omitempty"`
	Tty        string                 `json:"tty,omitempty"`
	PamType    string                 `json:"pam_type,omitempty"`
	UA         string                 `json:"ua,omitempty"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
	Timestamp  string                 `json:"timestamp"`
	ReceivedAt time.Time              `json:"received_at"`
}

// WAL is a write-ahead log backed by append-only JSONL files.
// Events are persisted to disk before being acknowledged.
type WAL struct {
	dir       string
	mu        sync.Mutex
	file      *os.File
	writer    *bufio.Writer
	count     int
	maxPerSeg int
	notify    chan struct{} // signals new data available
}

func NewWAL(dir string, maxPerSegment int) (*WAL, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create WAL dir: %w", err)
	}
	w := &WAL{
		dir:       dir,
		maxPerSeg: maxPerSegment,
		notify:    make(chan struct{}, 1),
	}
	if err := w.rotate(); err != nil {
		return nil, err
	}
	return w, nil
}

// Append writes events to the WAL. Returns after fsync.
func (w *WAL) Append(events []Event) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	for i := range events {
		events[i].ReceivedAt = time.Now().UTC()
		data, err := json.Marshal(&events[i])
		if err != nil {
			log.Printf("[wal] marshal error: %v", err)
			continue
		}
		w.writer.Write(data)
		w.writer.WriteByte('\n')
		w.count++
	}

	// Flush + fsync for durability
	if err := w.writer.Flush(); err != nil {
		return fmt.Errorf("wal flush: %w", err)
	}
	if err := w.file.Sync(); err != nil {
		return fmt.Errorf("wal sync: %w", err)
	}

	// Rotate if segment is large enough
	if w.count >= w.maxPerSeg {
		if err := w.rotate(); err != nil {
			return fmt.Errorf("wal rotate: %w", err)
		}
	}

	// Signal consumer
	select {
	case w.notify <- struct{}{}:
	default:
	}

	return nil
}

// Notify returns a channel that receives a signal when new data is available.
func (w *WAL) Notify() <-chan struct{} {
	return w.notify
}

// ReadSegments returns all completed (non-active) segment file paths, sorted.
func (w *WAL) ReadSegments() ([]string, error) {
	w.mu.Lock()
	activeName := ""
	if w.file != nil {
		activeName = w.file.Name()
	}
	w.mu.Unlock()

	entries, err := os.ReadDir(w.dir)
	if err != nil {
		return nil, err
	}

	var segs []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		full := filepath.Join(w.dir, e.Name())
		if full != activeName && filepath.Ext(e.Name()) == ".wal" {
			segs = append(segs, full)
		}
	}
	return segs, nil
}

// ClaimSegment atomically renames a segment to .processing so no other worker picks it up.
// Returns the new path, or empty string if already claimed.
func ClaimSegment(path string) string {
	claimed := path + ".processing"
	if err := os.Rename(path, claimed); err != nil {
		return "" // another worker got it first
	}
	return claimed
}

// ReadEvents reads all events from a segment file.
func ReadEvents(path string) ([]Event, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var events []Event
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024) // 1MB line buffer
	for scanner.Scan() {
		var ev Event
		if err := json.Unmarshal(scanner.Bytes(), &ev); err != nil {
			log.Printf("[wal] corrupt line in %s: %v", path, err)
			continue
		}
		events = append(events, ev)
	}
	return events, scanner.Err()
}

// Remove deletes a processed segment file.
func Remove(path string) error {
	return os.Remove(path)
}

// ForceRotate closes the current segment so it can be consumed.
func (w *WAL) ForceRotate() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.count == 0 {
		return nil
	}
	return w.rotate()
}

func (w *WAL) rotate() error {
	if w.writer != nil {
		w.writer.Flush()
	}
	if w.file != nil {
		w.file.Sync()
		w.file.Close()
	}

	name := fmt.Sprintf("%d.wal", time.Now().UnixNano())
	path := filepath.Join(w.dir, name)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return fmt.Errorf("create segment %s: %w", path, err)
	}

	w.file = f
	w.writer = bufio.NewWriterSize(f, 256*1024) // 256KB write buffer
	w.count = 0
	return nil
}

// Close flushes and closes the WAL.
func (w *WAL) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.writer != nil {
		w.writer.Flush()
	}
	if w.file != nil {
		w.file.Sync()
		return w.file.Close()
	}
	return nil
}
