"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Globe } from "lucide-react";
import type { GeoPoint } from "@/lib/types";

interface Props {
  points: GeoPoint[];
  loading: boolean;
}

// Equirectangular projection: lon/lat → SVG x/y
function project(lat: number, lon: number): [number, number] {
  const x = ((lon + 180) / 360) * 800;
  const y = ((90 - lat) / 180) * 400;
  return [x, y];
}

// Simplified world outline paths (continents)
const WORLD_PATHS = [
  // North America
  "M 50,100 L 80,70 L 130,60 L 170,70 L 190,90 L 180,120 L 160,140 L 140,160 L 120,170 L 100,160 L 80,150 L 60,130 Z",
  // South America
  "M 140,180 L 160,170 L 180,180 L 190,210 L 185,250 L 170,280 L 155,300 L 140,290 L 130,260 L 125,230 L 130,200 Z",
  // Europe
  "M 350,60 L 380,55 L 410,60 L 420,80 L 410,100 L 390,110 L 370,105 L 355,95 L 345,80 Z",
  // Africa
  "M 350,120 L 380,110 L 420,120 L 440,150 L 435,200 L 420,240 L 400,270 L 380,275 L 360,260 L 345,230 L 340,190 L 345,150 Z",
  // Asia
  "M 420,50 L 480,40 L 550,45 L 620,55 L 660,70 L 670,100 L 650,130 L 600,140 L 550,135 L 500,130 L 460,120 L 430,100 L 420,75 Z",
  // Oceania
  "M 600,220 L 650,210 L 690,220 L 700,250 L 680,270 L 640,275 L 610,260 L 600,240 Z",
];

function PointDot({ point, maxCount }: { point: GeoPoint; maxCount: number }) {
  const [x, y] = project(point.lat, point.lon);
  const size = Math.max(3, Math.min(12, (point.count / maxCount) * 12));
  const hasThreat = point.threats > 0;

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <g>
            {hasThreat && (
              <circle cx={x} cy={y} r={size + 3} fill="hsl(0, 72%, 51%)" opacity={0.15}>
                <animate attributeName="r" values={`${size + 2};${size + 6};${size + 2}`} dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.2;0.05;0.2" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
            <circle
              cx={x}
              cy={y}
              r={size}
              fill={hasThreat ? "hsl(0, 72%, 51%)" : "hsl(221, 83%, 53%)"}
              opacity={0.8}
              className="cursor-pointer"
            />
            <circle cx={x} cy={y} r={1.5} fill="white" opacity={0.9} />
          </g>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-0.5">
            <p className="font-medium">{point.city ? `${point.city}, ${point.country}` : point.country}</p>
            <p className="text-muted-foreground">{point.count} events · {point.threats} threats</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ThreatMap({ points, loading }: Props) {
  const maxCount = Math.max(1, ...points.map((p) => p.count));

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
          <div className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">Loading...</div>
        ) : !points.length ? (
          <div className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">No geo data yet</div>
        ) : (
          <div className="w-full overflow-hidden rounded-lg bg-muted/30 border">
            <svg viewBox="0 0 800 400" className="w-full h-auto" style={{ maxHeight: 300 }}>
              {/* Grid lines */}
              {[0, 1, 2, 3, 4].map((i) => (
                <line key={`h${i}`} x1={0} y1={i * 100} x2={800} y2={i * 100} stroke="currentColor" strokeOpacity={0.05} />
              ))}
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <line key={`v${i}`} x1={i * 100} y1={0} x2={i * 100} y2={400} stroke="currentColor" strokeOpacity={0.05} />
              ))}
              {/* Continent outlines */}
              {WORLD_PATHS.map((d, i) => (
                <path key={i} d={d} fill="currentColor" fillOpacity={0.06} stroke="currentColor" strokeOpacity={0.12} strokeWidth={0.5} />
              ))}
              {/* Data points */}
              {points.map((p) => (
                <PointDot key={`${p.lat}-${p.lon}`} point={p} maxCount={maxCount} />
              ))}
            </svg>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
