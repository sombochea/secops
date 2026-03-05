package queue

import (
	"os"
	"testing"
)

func tempWAL(t *testing.T) *WAL {
	t.Helper()
	dir := t.TempDir()
	w, err := NewWAL(dir, 1000)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { w.Close() })
	return w
}

func makeEvents(n int) []Event {
	events := make([]Event, n)
	for i := range events {
		events[i] = Event{
			OrgID:     "org-1",
			Event:     "ssh_attempt",
			Status:    "failed",
			SourceIP:  "203.0.113.42",
			Host:      "prod-web-01",
			User:      "root",
			Service:   "sshd",
			Timestamp: "2026-03-04T08:00:00Z",
		}
	}
	return events
}

func TestWALAppendAndRead(t *testing.T) {
	w := tempWAL(t)

	if err := w.Append(makeEvents(10)); err != nil {
		t.Fatal(err)
	}

	// Force rotate so the segment becomes readable
	if err := w.ForceRotate(); err != nil {
		t.Fatal(err)
	}

	segs, err := w.ReadSegments()
	if err != nil {
		t.Fatal(err)
	}
	if len(segs) == 0 {
		t.Fatal("expected at least 1 segment")
	}

	events, err := ReadEvents(segs[0])
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 10 {
		t.Fatalf("expected 10 events, got %d", len(events))
	}
	if events[0].Event != "ssh_attempt" {
		t.Fatalf("expected ssh_attempt, got %s", events[0].Event)
	}
}

func TestWALRotation(t *testing.T) {
	dir := t.TempDir()
	// Segment size of 5 — should auto-rotate
	w, err := NewWAL(dir, 5)
	if err != nil {
		t.Fatal(err)
	}
	defer w.Close()

	// Write 3 batches of 5 — each triggers rotation after append
	for i := 0; i < 3; i++ {
		if err := w.Append(makeEvents(5)); err != nil {
			t.Fatal(err)
		}
	}

	segs, _ := w.ReadSegments()
	if len(segs) < 3 {
		t.Fatalf("expected at least 3 completed segments, got %d", len(segs))
	}

	total := 0
	for _, s := range segs {
		evs, _ := ReadEvents(s)
		total += len(evs)
	}
	if total != 15 {
		t.Fatalf("expected 15 events in completed segments, got %d", total)
	}
}

func TestWALRemove(t *testing.T) {
	w := tempWAL(t)
	w.Append(makeEvents(3))
	w.ForceRotate()

	segs, _ := w.ReadSegments()
	if len(segs) == 0 {
		t.Fatal("no segments")
	}

	Remove(segs[0])
	if _, err := os.Stat(segs[0]); !os.IsNotExist(err) {
		t.Fatal("segment should be deleted")
	}
}

func TestWALDurability(t *testing.T) {
	dir := t.TempDir()
	w, _ := NewWAL(dir, 10000)

	// Write and close (simulates crash after fsync)
	w.Append(makeEvents(50))
	w.Close()

	// Reopen and verify data survived
	w2, _ := NewWAL(dir, 10000)
	defer w2.Close()

	segs, _ := w2.ReadSegments()
	total := 0
	for _, s := range segs {
		evs, _ := ReadEvents(s)
		total += len(evs)
	}
	if total != 50 {
		t.Fatalf("expected 50 events after reopen, got %d", total)
	}
}

// ─── Benchmarks ──────────────────────────────────────────────────────────────

func BenchmarkWALAppend1(b *testing.B) {
	dir := b.TempDir()
	w, _ := NewWAL(dir, 100000)
	defer w.Close()
	events := makeEvents(1)

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		w.Append(events)
	}
}

func BenchmarkWALAppend10(b *testing.B) {
	dir := b.TempDir()
	w, _ := NewWAL(dir, 100000)
	defer w.Close()
	events := makeEvents(10)

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		w.Append(events)
	}
}

func BenchmarkWALAppend100(b *testing.B) {
	dir := b.TempDir()
	w, _ := NewWAL(dir, 100000)
	defer w.Close()
	events := makeEvents(100)

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		w.Append(events)
	}
}

func BenchmarkWALAppend1000(b *testing.B) {
	dir := b.TempDir()
	w, _ := NewWAL(dir, 100000)
	defer w.Close()
	events := makeEvents(1000)

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		w.Append(events)
	}
}

func BenchmarkWALReadSegment(b *testing.B) {
	dir := b.TempDir()
	w, _ := NewWAL(dir, 100000)
	w.Append(makeEvents(5000))
	w.ForceRotate()
	w.Close()

	w2, _ := NewWAL(dir, 100000)
	defer w2.Close()
	segs, _ := w2.ReadSegments()
	if len(segs) == 0 {
		b.Fatal("no segments")
	}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		ReadEvents(segs[0])
	}
}

func BenchmarkWALAppendParallel(b *testing.B) {
	dir := b.TempDir()
	w, _ := NewWAL(dir, 1000000)
	defer w.Close()

	b.ResetTimer()
	b.ReportAllocs()
	b.RunParallel(func(pb *testing.PB) {
		events := makeEvents(10)
		for pb.Next() {
			w.Append(events)
		}
	})
}
