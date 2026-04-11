"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { TrackPoint } from "@/utils/gpxParser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navigation } from "lucide-react";
import { exportToGpx } from "@/utils/exportGpx";
import { useTracker } from "@/hooks/useTracker";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

interface MapViewProps {
  track: TrackPoint[];
  trackName: string;
}

const MapView = ({ track, trackName }: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const userMarker = useRef<mapboxgl.Marker | null>(null);

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const {
    isTracking,
    userPath,
    distanceDone,
    elevationDone,
    avgSpeed,
    startTracking,
    stopTracking,
    loadPath,
  } = useTracker();

  // 👉 DATA utilisée pour le graphique
  const graphData = userPath.length > 1 ? userPath : track;

  // --------- MAP INIT ----------
  useEffect(() => {
    if (!mapContainer.current || track.length === 0) return;

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [track[0].lon, track[0].lat],
      zoom: 13,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      const coordinates = track.map((p) => [p.lon, p.lat]);

      // GPX route
      map.current!.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates },
        },
      });

      map.current!.addLayer({
        id: "route",
        type: "line",
        source: "route",
        paint: {
          "line-color": "#ff5a1f",
          "line-width": 4,
        },
      });

      // User path
      map.current!.addSource("userPath", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [] },
        },
      });

      map.current!.addLayer({
        id: "userPathLine",
        type: "line",
        source: "userPath",
        paint: {
          "line-color": "#2f80ed",
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      });

      // restore saved path
      const saved = loadPath();
      if (saved.length > 0) {
        const coords = saved.map((p) => [p.lon, p.lat]);
        const source = map.current?.getSource("userPath") as mapboxgl.GeoJSONSource;
        source?.setData({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
        });
      }
    });

    return () => map.current?.remove();
  }, [track]);

  // --------- UPDATE USER PATH ----------
  useEffect(() => {
    if (!map.current) return;

    const source = map.current.getSource("userPath") as mapboxgl.GeoJSONSource;

    if (source) {
      const coords = userPath.map((p) => [p.lon, p.lat]);

      source.setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
      });
    }
  }, [userPath]);

  // --------- USER MARKER ----------
  useEffect(() => {
    if (!map.current) return;

    const last = userPath[userPath.length - 1];
    if (!last) return;

    if (!userMarker.current) {
      const el = document.createElement("div");
      el.style.width = "16px";
      el.style.height = "16px";
      el.style.borderRadius = "50%";
      el.style.background = "#2f80ed";
      el.style.border = "3px solid white";
      el.style.boxShadow = "0 0 10px rgba(47,128,237,0.7)";

      userMarker.current = new mapboxgl.Marker(el)
        .setLngLat([last.lon, last.lat])
        .addTo(map.current);
    } else {
      userMarker.current.setLngLat([last.lon, last.lat]);
    }
  }, [userPath]);

  // --------- GRAPH → MAP SYNC ----------
  useEffect(() => {
    if (hoverIndex == null || !map.current) return;

    const point = graphData[hoverIndex];
    if (!point) return;

    map.current.easeTo({
      center: [point.lon, point.lat],
      duration: 200,
    });
  }, [hoverIndex, graphData]);

  return (
    <Card className="overflow-hidden">

      {/* ==== MAP ==== */}
      <div className="relative h-[600px]">
        <div ref={mapContainer} className="absolute inset-0" />

        <div className="absolute top-4 left-4 z-10">
          <Card className="p-3 bg-card/95 space-y-2">
            <h3 className="font-semibold text-sm">{trackName}</h3>

            <Button
              size="sm"
              onClick={isTracking ? stopTracking : startTracking}
              variant={isTracking ? "destructive" : "default"}
              className="w-full"
            >
              <Navigation className="h-4 w-4 mr-2" />
              {isTracking ? "Stop" : "Start"}
            </Button>

            {isTracking && (
              <div className="text-sm space-y-1">
                <p><b>{distanceDone.toFixed(2)} km</b></p>
                <p><b>{Math.round(elevationDone)} m D+</b></p>
                <p><b>{avgSpeed.toFixed(1)} km/h</b></p>
              </div>
            )}

            {!isTracking && userPath.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => exportToGpx(userPath, `${trackName}_run`)}
              >
                Export GPX
              </Button>
            )}
          </Card>
        </div>
      </div>

      {/* ==== GRAPH ==== */}
      {graphData.length > 1 && (
        <div className="px-4 py-3 bg-muted border-t">
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart
              data={graphData}
              onMouseMove={(state) => {
                if (state?.activeTooltipIndex != null) {
                  setHoverIndex(state.activeTooltipIndex);
                }
              }}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <defs>
                <linearGradient id="elevationGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2f80ed" stopOpacity={0.8}/>
                  <stop offset="100%" stopColor="#2f80ed" stopOpacity={0.1}/>
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />

              <XAxis
                dataKey="cumDist"
                tickFormatter={(v) => `${v.toFixed(1)} km`}
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />

              <YAxis
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                domain={["dataMin - 20", "dataMax + 20"]}
              />

              <Tooltip
                contentStyle={{
                  background: "#111",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff"
                }}
                formatter={(value) => [`${Math.round(value as number)} m`, "Altitude"]}
                labelFormatter={(v) => `Distance ${v.toFixed(2)} km`}
              />

              <Area
                type="monotone"
                dataKey="ele"
                stroke="#2f80ed"
                fill="url(#elevationGradient)"
                strokeWidth={2}
                dot={false}
              />

              {hoverIndex !== null && graphData[hoverIndex] && (
                <ReferenceLine
                  x={graphData[hoverIndex].cumDist}
                  stroke="#999"
                  strokeDasharray="3 3"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

export default MapView;