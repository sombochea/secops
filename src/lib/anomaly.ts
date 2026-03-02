import { db } from "@/db";
import { securityEvent } from "@/db/schema";
import { eq, sql, and, gte } from "drizzle-orm";

/**
 * Anomaly detection engine for security events.
 *
 * Computes a risk score (0–100) per event using multiple signals:
 *
 * 1. IP Frequency Burst — Z-score of event count per IP in the last hour
 *    vs the IP's rolling 24h average. Detects brute-force bursts.
 *
 * 2. Time-of-Day Anomaly — Events outside business hours (22:00–06:00 UTC)
 *    get a penalty. Most legitimate access is during work hours.
 *
 * 3. Failed Auth Velocity — Ratio of failed events from this IP in the
 *    last hour. High failure rate = likely attack.
 *
 * 4. New IP Signal — IP never seen before for this org gets a novelty bonus.
 *
 * 5. User Enumeration — Multiple distinct usernames from the same IP in a
 *    short window indicates username enumeration / credential stuffing.
 *
 * Each signal contributes a weighted sub-score. The final score is clamped
 * to 0–100. Events scoring ≥ 60 are flagged as "suspicious".
 */

const SUSPICIOUS_THRESHOLD = 60;

interface EventInput {
  sourceIp: string | null;
  user: string | null;
  status: string | null;
  authMethod: string | null;
  event: string;
  timestamp: Date;
  organizationId: string;
}

interface IpStats {
  lastHourCount: number;
  avg24hHourly: number;
  stddev24h: number;
  lastHourFailed: number;
  lastHourTotal: number;
  distinctUsers1h: number;
  isNew: boolean;
}

async function getIpStats(orgId: string, ip: string): Promise<IpStats> {
  const [result] = await db.execute<{
    last_hour_count: number;
    avg_24h_hourly: number;
    stddev_24h: number;
    last_hour_failed: number;
    last_hour_total: number;
    distinct_users_1h: number;
    total_ever: number;
  }>(sql`
    WITH hourly AS (
      SELECT
        date_trunc('hour', ${securityEvent.timestamp}) AS h,
        count(*)::int AS cnt
      FROM ${securityEvent}
      WHERE ${securityEvent.organizationId} = ${orgId}
        AND ${securityEvent.sourceIp} = ${ip}
        AND ${securityEvent.timestamp} > now() - interval '24 hours'
      GROUP BY h
    )
    SELECT
      coalesce((SELECT cnt FROM hourly WHERE h = date_trunc('hour', now())), 0)::int AS last_hour_count,
      coalesce(avg(cnt), 0)::float AS avg_24h_hourly,
      coalesce(stddev_pop(cnt), 0)::float AS stddev_24h,
      (SELECT count(*) FROM ${securityEvent}
       WHERE ${securityEvent.organizationId} = ${orgId}
         AND ${securityEvent.sourceIp} = ${ip}
         AND ${securityEvent.timestamp} > now() - interval '1 hour'
         AND ${securityEvent.status} = 'failed')::int AS last_hour_failed,
      (SELECT count(*) FROM ${securityEvent}
       WHERE ${securityEvent.organizationId} = ${orgId}
         AND ${securityEvent.sourceIp} = ${ip}
         AND ${securityEvent.timestamp} > now() - interval '1 hour')::int AS last_hour_total,
      (SELECT count(DISTINCT ${securityEvent.user}) FROM ${securityEvent}
       WHERE ${securityEvent.organizationId} = ${orgId}
         AND ${securityEvent.sourceIp} = ${ip}
         AND ${securityEvent.timestamp} > now() - interval '1 hour')::int AS distinct_users_1h,
      (SELECT count(*) FROM ${securityEvent}
       WHERE ${securityEvent.organizationId} = ${orgId}
         AND ${securityEvent.sourceIp} = ${ip})::int AS total_ever
    FROM hourly
  `);

  return {
    lastHourCount: result?.last_hour_count ?? 0,
    avg24hHourly: result?.avg_24h_hourly ?? 0,
    stddev24h: result?.stddev_24h ?? 0,
    lastHourFailed: result?.last_hour_failed ?? 0,
    lastHourTotal: result?.last_hour_total ?? 0,
    distinctUsers1h: result?.distinct_users_1h ?? 0,
    isNew: (result?.total_ever ?? 0) === 0,
  };
}

function computeScore(event: EventInput, stats: IpStats): number {
  let score = 0;

  // 1. IP Frequency Burst (Z-score) — weight: 30
  if (stats.stddev24h > 0) {
    const z = (stats.lastHourCount - stats.avg24hHourly) / stats.stddev24h;
    score += Math.min(30, Math.max(0, z * 10));
  } else if (stats.lastHourCount > 5) {
    // No variance yet but high count
    score += Math.min(30, stats.lastHourCount * 3);
  }

  // 2. Time-of-Day Anomaly — weight: 15
  const hour = event.timestamp.getUTCHours();
  if (hour >= 22 || hour < 6) {
    score += 15;
  }

  // 3. Failed Auth Velocity — weight: 25
  if (stats.lastHourTotal > 0) {
    const failRate = stats.lastHourFailed / stats.lastHourTotal;
    score += Math.round(failRate * 25);
  }

  // 4. New IP Signal — weight: 10
  if (stats.isNew) {
    score += 10;
  }

  // 5. User Enumeration — weight: 20
  if (stats.distinctUsers1h >= 3) {
    score += Math.min(20, (stats.distinctUsers1h - 2) * 5);
  }

  // Bonus: known-bad patterns
  if (event.authMethod === "invalid_user") score += 10;
  if (event.event === "ssh_attempt" && event.status === "failed") score += 5;

  return Math.min(100, Math.max(0, Math.round(score)));
}

export async function scoreEvent(event: EventInput): Promise<number> {
  if (!event.sourceIp) return 0;

  const stats = await getIpStats(event.organizationId, event.sourceIp);
  return computeScore(event, stats);
}

export function isSuspicious(score: number): boolean {
  return score >= SUSPICIOUS_THRESHOLD;
}

export { SUSPICIOUS_THRESHOLD };
