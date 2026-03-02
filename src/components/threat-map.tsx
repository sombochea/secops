"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe } from "lucide-react";
import type { GeoPoint } from "@/lib/types";

interface Props {
  points: GeoPoint[];
  loading: boolean;
}

// Dynamically import leaflet components to avoid SSR issues
function MapInner({ points }: { points: GeoPoint[] }) {
  const [components, setComponents] = useState<{
    MapContainer: typeof import("react-leaflet").MapContainer;
    TileLayer: typeof import("react-leaflet").TileLayer;
    CircleMarker: typeof import("react-leaflet").CircleMarker;
    Tooltip: typeof import("react-leaflet").Tooltip;
  } | null>(null);

  useEffect(() => {
    // @ts-expect-error -- CSS import for leaflet styles
    import("leaflet/dist/leaflet.css");
    import("react-leaflet").then((mod) => {
      setComponents({
        MapContainer: mod.MapContainer,
        TileLayer: mod.TileLayer,
        CircleMarker: mod.CircleMarker,
        Tooltip: mod.Tooltip,
      });
    });
  }, []);

  if (!components) {
    return <div className="flex h-[350px] items-center justify-center text-muted-foreground text-sm">Loading map...</div>;
  }

  const { MapContainer, TileLayer, CircleMarker, Tooltip } = components;
  const maxCount = Math.max(1, ...points.map((p) => p.count));

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      minZoom={2}
      maxZoom={12}
      scrollWheelZoom={true}
      className="h-[350px] w-full rounded-lg z-0"
      style={{ background: "hsl(222.2 84% 4.9%)" }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {points.map((p) => {
        const hasThreat = p.threats > 0;
        const radius = Math.max(4, Math.min(18, (p.count / maxCount) * 18));
        return (
          <CircleMarker
            key={`${p.lat}-${p.lon}`}
            center={[p.lat, p.lon]}
            radius={radius}
            pathOptions={{
              color: hasThreat ? "hsl(0, 72%, 51%)" : "hsl(221, 83%, 53%)",
              fillColor: hasThreat ? "hsl(0, 72%, 51%)" : "hsl(221, 83%, 53%)",
              fillOpacity: 0.6,
              weight: 1,
            }}
          >
            <Tooltip>
              <div className="text-xs space-y-0.5">
                <p className="font-medium">{p.city ? `${p.city}, ${p.country}` : p.country}</p>
                <p>{p.count} events · {p.threats} threats</p>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

export function ThreatMap({ points, loading }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Globe className="h-4 w-4" />
            Threat Map
          </CardTitle>
          {points.length > 0 && (
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> Events
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Threats
              </span>
              <Badge variant="secondary" className="text-[9px]">{points.length} locations</Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading && !points.length ? (
          <div className="flex h-[350px] items-center justify-center text-muted-foreground text-sm">Loading...</div>
        ) : !points.length ? (
          <div className="flex h-[350px] items-center justify-center text-muted-foreground text-sm">No geo data yet</div>
        ) : (
          <MapInner points={points} />
        )}
      </CardContent>
    </Card>
  );
}
