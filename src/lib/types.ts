export interface SecurityEvent {
  id: string;
  organizationId: string | null;
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
  ua: string | null;
  geoCountry: string | null;
  geoCity: string | null;
  geoLat: number | null;
  geoLon: number | null;
  metadata: unknown;
  riskScore: number | null;
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
  byUser: AggregationItem[];
  byAuthMethod: AggregationItem[];
  byUa: AggregationItem[];
  byCountry: AggregationItem[];
}

export interface GeoPoint {
  lat: number;
  lon: number;
  country: string;
  city: string;
  count: number;
  threats: number;
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
  whitelisted?: boolean;
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

export interface DateRange {
  from: string;
  to: string;
}

export interface WhitelistedIp {
  id: string;
  ip: string;
  note: string | null;
  createdAt: string;
}

export interface WebhookKeyInfo {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  createdBy: string;
  createdByName: string | null;
}
