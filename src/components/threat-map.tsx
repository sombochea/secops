"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Play, Pause, SkipBack, SkipForward, Clock } from "lucide-react";
import { useTimezone } from "@/lib/timezone-context";
import { formatTz } from "@/lib/format-date";
import type { GeoPoint } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface GeoFrame { time: string; points: GeoPoint[] }

function MapInner({ points, opacityMap }: { points: GeoPoint[]; opacityMap?: Record<string, number> }) {
  const [comps, setComps] = useState<{
    MapContainer: typeof import("react-leaflet").MapContainer;
    TileLayer: typeof import("react-leaflet").TileLayer;
    CircleMarker: typeof import("react-leaflet").CircleMarker;
    Tooltip: typeof import("react-leaflet").Tooltip;
  } | null>(null);

  useEffect(() => {
    // @ts-expect-error -- CSS import
    import("leaflet/dist/leaflet.css");
    import("react-leaflet").then((m) => setComps({ MapContainer: m.MapContainer, TileLayer: m.TileLayer, CircleMarker: m.CircleMarker, Tooltip: m.Tooltip }));
  }, []);

  if (!comps) return <div className="flex h-[350px] items-center justify-center text-muted-foreground text-sm">Loading map...</div>;

  const { MapContainer, TileLayer, CircleMarker, Tooltip } = comps;
  const maxCount = Math.max(1, ...points.map((p) => p.count));

  return (
    <div style={{ position: "relative", zIndex: 0, isolation: "isolate" }}>
      <MapContainer center={[20, 0]} zoom={2} minZoom={2} maxZoom={12} scrollWheelZoom={true} className="h-[350px] w-full rounded-lg" style={{ background: "hsl(222.2 84% 4.9%)" }} zoomControl={false}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        {points.map((p) => {
          const key = `${p.lat}-${p.lon}`;
          const hasThreat = p.threats > 0;
          const radius = Math.max(4, Math.min(18, (p.count / maxCount) * 18));
          const alpha = opacityMap?.[key] ?? 0.6;
          return (
            <CircleMarker key={key} center={[p.lat, p.lon]} radius={radius} pathOptions={{ color: hasThreat ? "hsl(0,72%,51%)" : "hsl(221,83%,53%)", fillColor: hasThreat ? "hsl(0,72%,51%)" : "hsl(221,83%,53%)", fillOpacity: alpha, weight: 1, opacity: alpha }}>
              <Tooltip><div className="text-xs"><p className="font-medium">{p.city ? `${p.city}, ${p.country}` : p.country}</p><p>{p.count} events · {p.threats} threats</p></div></Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

function accumulate(frames: GeoFrame[], upTo: number, trail: number) {
  const merged: Record<string, GeoPoint & { age: number }> = {};
  for (let i = Math.max(0, upTo - trail + 1); i <= upTo; i++) {
    const f = frames[i];
    if (!f) continue;
    const age = upTo - i;
    for (const p of f.points) {
      const k = `${p.lat}-${p.lon}`;
      if (merged[k]) { merged[k].count += p.count; merged[k].threats += p.threats; merged[k].age = Math.min(merged[k].age, age); }
      else merged[k] = { ...p, age };
    }
  }
  const pts: GeoPoint[] = [];
  const op: Record<string, number> = {};
  for (const [k, p] of Object.entries(merged)) {
    pts.push(p);
    op[k] = Math.max(0.15, 1 - (p.age / trail) * 0.8);
  }
  return { points: pts, opacityMap: op };
}

export function ThreatMap({ points, loading }: { points: GeoPoint[]; loading: boolean }) {
  const [mode, setMode] = useState<"live" | "timeline">("live");
  const [hours, setHours] = useState("24");
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef(false);
  const { timezone } = useTimezone();

  const { data: geoData } = useSWR(
    mode === "timeline" ? `/api/events/geo-timeline?hours=${hours}&buckets=${Number(hours) < 24 ? Number(hours) * 4 : hours}` : null,
    fetcher,
  );

  const frames: GeoFrame[] = geoData?.frames ?? [];
  const total = frames.length;

  // Reset on data change
  useEffect(() => { setFrameIdx(0); setPlaying(false); playRef.current = false; }, [total, hours]);

  // Keep ref in sync
  useEffect(() => { playRef.current = playing; }, [playing]);

  // Playback via ref to avoid stale closure
  useEffect(() => {
    if (!playing || total <= 1) return;
    const id = setInterval(() => {
      if (!playRef.current) return;
      setFrameIdx((prev) => {
        if (prev >= total - 1) {
          playRef.current = false;
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [playing, total]);

  const trail = Math.max(3, Math.round(total / 4));
  const { points: accPts, opacityMap } = mode === "timeline" && total > 0
    ? accumulate(frames, frameIdx, trail)
    : { points, opacityMap: undefined };

  const curTime = frames[frameIdx]?.time;

  const handleSlider = (val: number[]) => {
    setPlaying(false);
    playRef.current = false;
    setFrameIdx(val[0]);
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      playRef.current = false;
    } else {
      // If at end, restart
      if (frameIdx >= total - 1) setFrameIdx(0);
      setPlaying(true);
      playRef.current = true;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Globe className="h-4 w-4" />Threat Map
          </CardTitle>
          <div className="flex items-center gap-2">
            {mode === "live" && points.length > 0 && (
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Events</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Threats</span>
                <Badge variant="secondary" className="text-[9px]">{points.length} locations</Badge>
              </div>
            )}
            <Button variant={mode === "timeline" ? "secondary" : "outline"} size="sm" className="h-7 text-[10px] gap-1" onClick={() => setMode(mode === "live" ? "timeline" : "live")}>
              <Clock className="h-3 w-3" />{mode === "timeline" ? "Live View" : "Timeline"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !points.length && mode === "live" ? (
          <div className="flex h-[350px] items-center justify-center text-muted-foreground text-sm">Loading...</div>
        ) : mode === "live" && !points.length ? (
          <div className="flex h-[350px] items-center justify-center text-muted-foreground text-sm">No geo data yet</div>
        ) : mode === "timeline" && total === 0 ? (
          <div className="flex h-[350px] items-center justify-center text-muted-foreground text-sm">
            {geoData ? "No geo data for this period" : "Loading timeline..."}
          </div>
        ) : (
          <MapInner points={accPts} opacityMap={opacityMap} />
        )}

        {/* Timeline controls — always visible in timeline mode */}
        {mode === "timeline" && (
          <div className="relative z-[1000] flex items-center gap-2 bg-card rounded-md border px-2 py-1.5">
            <div className="flex items-center gap-0.5 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setPlaying(false); playRef.current = false; setFrameIdx(0); }}>
                <SkipBack className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={togglePlay} disabled={total <= 1}>
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setPlaying(false); playRef.current = false; setFrameIdx(Math.max(0, total - 1)); }}>
                <SkipForward className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1 px-1">
              <Slider value={[frameIdx]} min={0} max={Math.max(1, total - 1)} step={1} onValueChange={handleSlider} disabled={total <= 1} />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground w-[100px] text-right shrink-0">
              {curTime ? formatTz(curTime, "MMM d, HH:mm", timezone) : "—"}
            </span>
            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger className="h-7 w-[70px] text-[10px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6h</SelectItem>
                <SelectItem value="12">12h</SelectItem>
                <SelectItem value="24">24h</SelectItem>
                <SelectItem value="72">3d</SelectItem>
                <SelectItem value="168">7d</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
