// src/components/ElevationProfile.tsx
// Profil d'élévation de la trace avec repère de position en direct.

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { TrackPoint } from "@/utils/gpxParser";

interface ElevationProfileProps {
  track: TrackPoint[];
  /** Distance cumulée (km) de la position courante, pour le repère vertical. */
  currentCumDist?: number;
  /** Nombre max de points affichés (sous-échantillonnage pour la perf). */
  maxPoints?: number;
}

const ElevationProfile = ({
  track,
  currentCumDist,
  maxPoints = 300,
}: ElevationProfileProps) => {
  const data = useMemo(() => {
    const pts = track.filter((p) => p.ele !== undefined && p.cumDist !== undefined);
    if (pts.length === 0) return [];

    // Sous-échantillonnage régulier
    const step = Math.max(1, Math.ceil(pts.length / maxPoints));
    const sampled = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);

    return sampled.map((p) => ({
      dist: Number((p.cumDist ?? 0).toFixed(2)),
      ele: Math.round(p.ele ?? 0),
    }));
  }, [track, maxPoints]);

  if (data.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Aucune donnée d'altitude dans cette trace.
        </p>
      </Card>
    );
  }

  const eles = data.map((d) => d.ele);
  const minEle = Math.min(...eles);
  const maxEle = Math.max(...eles);
  const pad = Math.max(10, Math.round((maxEle - minEle) * 0.1));

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Profil d'élévation</h3>
        <span className="text-xs text-muted-foreground">
          {minEle} – {maxEle} m
        </span>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="eleFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(215 85% 45%)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="hsl(215 85% 45%)" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="dist"
            type="number"
            domain={[0, "dataMax"]}
            tickFormatter={(v) => `${v}`}
            tick={{ fontSize: 11 }}
            unit=" km"
            stroke="hsl(215 15% 45%)"
          />
          <YAxis
            domain={[minEle - pad, maxEle + pad]}
            tick={{ fontSize: 11 }}
            width={44}
            unit=" m"
            stroke="hsl(215 15% 45%)"
          />
          <Tooltip
            formatter={(value: number) => [`${value} m`, "Altitude"]}
            labelFormatter={(label) => `${label} km`}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid hsl(215 20% 85%)",
            }}
          />

          <Area
            type="monotone"
            dataKey="ele"
            stroke="hsl(215 85% 45%)"
            strokeWidth={2}
            fill="url(#eleFill)"
            isAnimationActive={false}
          />

          {currentCumDist !== undefined && (
            <ReferenceLine
              x={Number(currentCumDist.toFixed(2))}
              stroke="hsl(15 85% 55%)"
              strokeWidth={2}
              label={{
                value: "Vous",
                position: "top",
                fill: "hsl(15 85% 55%)",
                fontSize: 11,
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
};

export default ElevationProfile;
