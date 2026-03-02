package tailer

import (
	"bufio"
	"io"
	"log"
	"os"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
)

func Tail(path string, lines chan<- string, done <-chan struct{}) {
	f, err := os.Open(path)
	if err != nil {
		log.Printf("[tailer] cannot open %s: %v", path, err)
		return
	}
	defer f.Close()

	f.Seek(0, io.SeekEnd)
	reader := bufio.NewReader(f)

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("[tailer] fsnotify error: %v, using poll", err)
		pollTail(reader, lines, done)
		return
	}
	defer watcher.Close()

	if err := watcher.Add(path); err != nil {
		log.Printf("[tailer] watch error for %s: %v, using poll", path, err)
		pollTail(reader, lines, done)
		return
	}

	log.Printf("[tailer] watching %s", path)

	// Hybrid: fsnotify + poll every 2s (macOS kqueue can miss appends)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

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
				// Log rotation — reopen
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
		case <-ticker.C:
			readLines(reader, lines)
		}
	}
}

func pollTail(reader *bufio.Reader, lines chan<- string, done <-chan struct{}) {
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
		line = strings.TrimRight(line, "\r\n")
		if len(line) > 0 {
			lines <- line
		}
		if err != nil {
			return
		}
	}
}
