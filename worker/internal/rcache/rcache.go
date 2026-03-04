package rcache

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

var client *redis.Client

func Init() {
	url := os.Getenv("REDIS_URL")
	if url == "" {
		return
	}
	opts, err := redis.ParseURL(url)
	if err != nil {
		log.Printf("[redis] invalid URL: %v", err)
		return
	}
	client = redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		log.Printf("[redis] connection failed: %v (cache invalidation disabled)", err)
		client = nil
		return
	}
	log.Println("[redis] connected for cache invalidation")
}

// InvalidateOrg deletes all cached keys for an org.
func InvalidateOrg(orgID string) {
	if client == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		pattern := "org:" + orgID + ":*"
		var cursor uint64
		for {
			keys, next, err := client.Scan(ctx, cursor, pattern, 200).Result()
			if err != nil {
				return
			}
			if len(keys) > 0 {
				client.Del(ctx, keys...)
			}
			cursor = next
			if cursor == 0 {
				break
			}
		}
	}()
}
