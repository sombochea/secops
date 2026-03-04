package geoip

import (
	"bytes"
	"encoding/json"
	"net"
	"net/http"
	"sync"
	"time"
)

type Result struct {
	Country string  `json:"country"`
	City    string  `json:"city"`
	Lat     float64 `json:"lat"`
	Lon     float64 `json:"lon"`
}

var (
	cache   sync.Map
	client  = &http.Client{Timeout: 5 * time.Second}
	empty   = Result{}
)

func isPrivate(ip string) bool {
	p := net.ParseIP(ip)
	if p == nil {
		return true
	}
	return p.IsLoopback() || p.IsPrivate() || p.IsLinkLocalUnicast()
}

// BatchLookup resolves up to 100 IPs via ip-api.com batch endpoint.
func BatchLookup(ips []string) map[string]Result {
	results := make(map[string]Result, len(ips))
	var toFetch []string

	for _, ip := range ips {
		if isPrivate(ip) {
			results[ip] = empty
			continue
		}
		if v, ok := cache.Load(ip); ok {
			results[ip] = v.(Result)
			continue
		}
		toFetch = append(toFetch, ip)
	}

	if len(toFetch) == 0 {
		return results
	}

	// ip-api.com batch: max 100
	for i := 0; i < len(toFetch); i += 100 {
		end := i + 100
		if end > len(toFetch) {
			end = len(toFetch)
		}
		batch := toFetch[i:end]

		body, _ := json.Marshal(batch)
		resp, err := client.Post(
			"http://ip-api.com/batch?fields=status,query,country,city,lat,lon",
			"application/json",
			bytes.NewReader(body),
		)
		if err != nil {
			for _, ip := range batch {
				results[ip] = empty
			}
			continue
		}

		var data []struct {
			Status  string  `json:"status"`
			Query   string  `json:"query"`
			Country string  `json:"country"`
			City    string  `json:"city"`
			Lat     float64 `json:"lat"`
			Lon     float64 `json:"lon"`
		}
		json.NewDecoder(resp.Body).Decode(&data)
		resp.Body.Close()

		for _, d := range data {
			r := empty
			if d.Status == "success" {
				r = Result{Country: d.Country, City: d.City, Lat: d.Lat, Lon: d.Lon}
			}
			cache.Store(d.Query, r)
			results[d.Query] = r
		}
	}

	return results
}
