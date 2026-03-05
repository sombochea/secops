package handler

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sombochea/secops/worker/internal/queue"
)

// cachedKey holds a validated webhook key → org mapping with TTL.
type cachedKey struct {
	orgID     string
	expiresAt time.Time
}

type Handler struct {
	wal      *queue.WAL
	pool     *pgxpool.Pool
	keyCache sync.Map // map[string]cachedKey
	keyTTL   time.Duration
}

func New(wal *queue.WAL, pool *pgxpool.Pool) *Handler {
	return &Handler{
		wal:    wal,
		pool:   pool,
		keyTTL: 60 * time.Second,
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/health" {
		w.WriteHeader(200)
		w.Write([]byte(`{"status":"ok"}`))
		return
	}

	if r.URL.Path != "/api/webhook" || r.Method != http.MethodPost {
		http.Error(w, `{"error":"not found"}`, 404)
		return
	}

	secret := r.Header.Get("X-Webhook-Secret")
	if secret == "" {
		secret = r.Header.Get("x-webhook-secret")
	}
	if secret == "" {
		http.Error(w, `{"error":"missing x-webhook-secret"}`, 401)
		return
	}

	orgID, err := h.resolveKey(secret)
	if err != nil || orgID == "" {
		http.Error(w, `{"error":"invalid webhook key"}`, 401)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 10*1024*1024)) // 10MB max
	if err != nil {
		http.Error(w, `{"error":"read body failed"}`, 400)
		return
	}

	// Parse events
	var raw []json.RawMessage
	if len(body) > 0 && body[0] == '[' {
		if err := json.Unmarshal(body, &raw); err != nil {
			http.Error(w, `{"error":"invalid JSON array"}`, 400)
			return
		}
	} else {
		raw = []json.RawMessage{body}
	}

	events := make([]queue.Event, 0, len(raw))
	for _, r := range raw {
		var e struct {
			Event      string                 `json:"event"`
			Status     string                 `json:"status"`
			AuthMethod string                 `json:"auth_method"`
			Host       string                 `json:"host"`
			User       string                 `json:"user"`
			Ruser      string                 `json:"ruser"`
			SourceIP   string                 `json:"source_ip"`
			Service    string                 `json:"service"`
			Tty        string                 `json:"tty"`
			PamType    string                 `json:"pam_type"`
			UA         string                 `json:"ua"`
			Metadata   map[string]interface{} `json:"metadata"`
			Timestamp  string                 `json:"timestamp"`
		}
		if err := json.Unmarshal(r, &e); err != nil {
			continue
		}
		if e.Timestamp == "" {
			continue
		}
		events = append(events, queue.Event{
			OrgID:      orgID,
			Event:      e.Event,
			Status:     e.Status,
			AuthMethod: e.AuthMethod,
			Host:       e.Host,
			User:       e.User,
			Ruser:      e.Ruser,
			SourceIP:   e.SourceIP,
			Service:    e.Service,
			Tty:        e.Tty,
			PamType:    e.PamType,
			UA:         e.UA,
			Metadata:   e.Metadata,
			Timestamp:  e.Timestamp,
		})
	}

	if len(events) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(202)
		w.Write([]byte(`{"queued":0}`))
		return
	}

	// Write to WAL (durable) before acknowledging
	if err := h.wal.Append(events); err != nil {
		log.Printf("[handler] WAL write error: %v", err)
		http.Error(w, `{"error":"queue write failed"}`, 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(202)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"queued":         len(events),
		"organizationId": orgID,
	})
}

// resolveKey validates a webhook key against the DB with caching.
func (h *Handler) resolveKey(key string) (string, error) {
	if v, ok := h.keyCache.Load(key); ok {
		ck := v.(cachedKey)
		if time.Now().Before(ck.expiresAt) {
			return ck.orgID, nil
		}
		h.keyCache.Delete(key)
	}

	var orgID string
	err := h.pool.QueryRow(
		context.Background(),
		`SELECT organization_id FROM webhook_key WHERE key = $1 LIMIT 1`,
		key,
	).Scan(&orgID)

	if err != nil {
		// Cache negative result briefly to avoid DB hammering
		h.keyCache.Store(key, cachedKey{orgID: "", expiresAt: time.Now().Add(10 * time.Second)})
		return "", err
	}

	h.keyCache.Store(key, cachedKey{orgID: orgID, expiresAt: time.Now().Add(h.keyTTL)})
	return orgID, nil
}
