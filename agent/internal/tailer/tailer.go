package tailer

import (
	"bufio"
	"io"
	"log"
	"os"
	"time"

	"github.com/fsnotify/fsnotify"
)

// Tail watches a file and sends new lines to the channel.
// Starts from the end of the file (like tail -f).
func Tail(path string, lines chan<- string, done <-chan struct{}) {
	f, err := os.Open(path)
	if err != nil {
		log.Printf("[tailer] cannot open %s: %v", path, err)
		return
	}
	defer f.Close()

	// Seek to end
	f.Seek(0, io.SeekEnd)

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("[tailer] fsnotify error: %v", err)
		// Fallback to polling
		pollTail(f, lines, done)
		return
	}
	defer watcher.Close()

	if err := watcher.Add(path); err != nil {
		log.Printf("[tailer] watch error for %s: %v, falling back to poll", path, err)
		pollTail(f, lines, done)
		return
	}

	reader := bufio.NewReader(f)
	log.Printf("[tailer] watching %s", path)

	for {
		select {
		case <-done:
			return
		case ev, ok := <-watcher.Events:
			if !ok {
				return
			}
			if ev.Op&(fsnotify.Write|fsnotify.Create) != 0 {
				readLines(reader, lines)
			}
			if ev.Op&fsnotify.Create != 0 {
				// File was rotated — reopen
				f.Close()
				time.Sleep(100 * time.Millisecond)
				f2, err := os.Open(path)
				if err != nil {
					log.Printf("[tailer] reopen failed %s: %v", path, err)
					return
				}
				f = f2
				reader = bufio.NewReader(f)
			}
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Printf("[tailer] watch error: %v", err)
		}
	}
}

func pollTail(f *os.File, lines chan<- string, done <-chan struct{}) {
	reader := bufio.NewReader(f)
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			readLines(reader, lines)
		}
	}
}

func readLines(r *bufio.Reader, lines chan<- string) {
	for {
		line, err := r.ReadString('\n')
		if len(line) > 0 {
			// Trim trailing newline
			if line[len(line)-1] == '\n' {
				line = line[:len(line)-1]
			}
			if len(line) > 0 {
				lines <- line
			}
		}
		if err != nil {
			return
		}
	}
}
