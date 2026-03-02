export interface SecurityEvent {
  id: string;
  event: string;
  status: string | null;
  authMethod: string | null;
  host: string | null;
  user: string | null;
  ruser: string | null;
  sourceIp: string | null;
  service: string | null;
  tty: string | null;
  pamType: string | null;
  metadata: unknown;
  timestamp: string;
  receivedAt: string;
}

export interface AggregationItem {
  name: string | null;
  count: number;
}

export interface Aggregations {
  byType: AggregationItem[];
  byHost: AggregationItem[];
  byIp: AggregationItem[];
  byService: AggregationItem[];
}

export interface TimelinePoint {
  date: string;
  total: number;
  threats: number;
}

export interface RiskSource {
  sourceIp: string;
  count: number;
  lastSeen: string;
  events: string[];
}

export interface Stats {
  total: number;
  uniqueHosts: number;
  uniqueIps: number;
  uniqueUsers: number;
  last24h: number;
  last7d: number;
  threats: number;
}
