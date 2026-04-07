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
import { ResponsiveContainer, LineChart, Line, XAxis } from "recharts";


interface MapViewProps {
  track: TrackPoint[];
  trackName: string;
}

const MapView = ({ track, trackName }: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const userMarker = useRef<mapboxgl.Marker | null>(null);
  const [sportMode, setSportMode] = useState(false);
  

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

  // --------- MAP INITIALIZATION ----------
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

      // Route principale GPX
      map.current!.addSource("route", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates } },
      });
      map.current!.addLayer({
        id: "route",
        type: "line",
        source: "route",
        paint: { "line-color": "hsl(15,85%,55%)", "line-width": 4 },
      });

      // Chemin utilisateur
      map.current!.addSource("userPath", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: [] } },
      });
      map.current!.addLayer({
        id: "userPathLine",
        type: "line",
        source: "userPath",
        paint: {
          "line-color": "hsl(215,85%,45%)",
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      });

      // Restaure les points sauvegardés
      const saved = loadPath();
      if (saved.length > 0) {
        const coords = saved.map((p) => [p.lon, p.lat]);
        const source = map.current?.getSource("userPath") as mapboxgl.GeoJSONSource;
        if (source) {
          source.setData({
            type: "Feature",
            geometry: { type: "LineString", coordinates: coords },
          });
        }
      }
    });

    return () => map.current?.remove();
  }, [track]);

  // --------- USER PATH LIVE UPDATE ----------
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
  
  // --------- USER MARKER (POINT DE REPÈRE) ----------
useEffect(() => {
  if (!map.current) return;
  const last = userPath[userPath.length - 1];
  if (!last) return;

  // créer ou mettre à jour le marker
  if (!userMarker.current) {
    const el = document.createElement("div");
    el.style.width = "18px";
    el.style.height = "18px";
    el.style.borderRadius = "50%";
    el.style.background = "hsl(215, 85%, 45%)";
    el.style.border = "3px solid white";
    el.style.boxShadow = "0 0 8px hsl(215, 85%, 45%)";
    userMarker.current = new mapboxgl.Marker(el)
      .setLngLat([last.lon, last.lat])
      .addTo(map.current);
  } else {
    userMarker.current.setLngLat([last.lon, last.lat]);
  }

  // centrer doucement la carte sur la position utilisateur
  map.current.easeTo({ center: [last.lon, last.lat], duration: 500 });
}, [userPath]);


  // --------- UI -----------
  return (
    <Card className="overflow-hidden">
      {/* ==== Carte principale ==== */}
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
              {isTracking ? "Stop Tracking" : "Start Tracking"}
            </Button>

            {isTracking && (
              <div className="text-sm space-y-1">
                <p>
                  Distance : <b>{distanceDone.toFixed(2)} km</b>
                </p>
                <p>
                  Dénivelé + : <b>{Math.round(elevationDone)} m</b>
                </p>
                <p>
                  Vitesse moy : <b>{avgSpeed.toFixed(1)} km/h</b>
                </p>
              </div>
			  )}

            {!isTracking && userPath.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => exportToGpx(userPath, `${trackName}_run`)}
              >
                Exporter GPX
              </Button>
            )}
          </Card>
        </div>
      </div>
{/* ✅ ==> AJOUTE CE BLOC ICI, juste après la carte */}
        {track.length > 1 && (
          <div className="px-4 py-3 bg-muted border-t">
            <h4 className="text-sm text-muted-foreground mb-2">Profil d’altitude</h4>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={track}>
                <XAxis
                  dataKey="cumDist"
                  tickFormatter={(v) => `${v.toFixed(1)} km`}
                  stroke="#aaa"
                />
                <Line dataKey="ele" stroke="#2f80ed" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {/* ✅ Fin du bloc à ajouter */}

      {/* ==== Graphique d’altitude ==== */}
      {userPath.length > 1 && (
        <div className="px-4 py-3 bg-muted border-t">
          <h4 className="text-sm text-muted-foreground mb-2">
            Profil d’altitude
          </h4>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={userPath}>
              <XAxis
                dataKey="cumDist"
                tickFormatter={(v) => `${v.toFixed(1)} km`}
                stroke="#aaa"
              />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                formatter={(value) => `${Math.round(value as number)} m`}
                labelFormatter={(v) => `${v.toFixed(2)} km`}
              />
              <Line
                type="natural"
                dataKey="ele"
                stroke="#2f80ed"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

export default MapView;
