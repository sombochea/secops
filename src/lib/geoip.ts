/**
 * GeoIP lookup using ip-api.com (free, no key needed, 45 req/min).
 * Results are cached in-memory to avoid repeated lookups for the same IP.
 */

interface GeoResult {
  country: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
}

const cache = new Map<string, GeoResult>();
const EMPTY: GeoResult = { country: null, city: null, lat: null, lon: null };

// Private/reserved IPs — skip lookup
function isPrivateIp(ip: string): boolean {
  return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1|fc|fd|fe80)/.test(ip);
}

export async function geoLookup(ip: string): Promise<GeoResult> {
  if (!ip || isPrivateIp(ip)) return EMPTY;

  const cached = cache.get(ip);
  if (cached) return cached;

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,lat,lon`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();

    if (data.status === "success") {
      const result: GeoResult = {
        country: data.country ?? null,
        city: data.city ?? null,
        lat: data.lat ?? null,
        lon: data.lon ?? null,
      };
      cache.set(ip, result);
      return result;
    }
  } catch {
    // Timeout or network error — don't block event ingestion
  }

  cache.set(ip, EMPTY);
  return EMPTY;
}

/** Batch lookup — ip-api.com supports batch of up to 100 IPs */
export async function geoBatchLookup(ips: string[]): Promise<Map<string, GeoResult>> {
  const results = new Map<string, GeoResult>();
  const toFetch: string[] = [];

  for (const ip of ips) {
    if (!ip || isPrivateIp(ip)) {
      results.set(ip, EMPTY);
    } else if (cache.has(ip)) {
      results.set(ip, cache.get(ip)!);
    } else {
      toFetch.push(ip);
    }
  }

  if (toFetch.length > 0) {
    try {
      const res = await fetch("http://ip-api.com/batch?fields=status,query,country,city,lat,lon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toFetch.slice(0, 100)),
        signal: AbortSignal.timeout(5000),
      });
      const data: Array<{ status: string; query: string; country?: string; city?: string; lat?: number; lon?: number }> = await res.json();

      for (const d of data) {
        const result: GeoResult = d.status === "success"
          ? { country: d.country ?? null, city: d.city ?? null, lat: d.lat ?? null, lon: d.lon ?? null }
          : EMPTY;
        cache.set(d.query, result);
        results.set(d.query, result);
      }
    } catch {
      for (const ip of toFetch) {
        results.set(ip, EMPTY);
      }
    }
  }

  return results;
}
