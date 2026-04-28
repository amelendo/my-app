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

interface MapViewProps {
  track: TrackPoint[];
  trackName: string;
}

const MapView = ({ track, trackName }: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const userMarker = useRef<mapboxgl.Marker | null>(null);

  const [currentPosition, setCurrentPosition] = useState<TrackPoint | null>(null);

  const {
    isTracking,
    userPath,
    distanceDone,
    elevationDone,
    avgSpeed,
    startTracking,
    stopTracking,
  } = useTracker(setCurrentPosition); // 👈 on injecte le setter

  /* ---------------- MAP INIT ---------------- */

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
    });

    return () => map.current?.remove();
  }, [track]);

  /* ---------------- UPDATE PATH ---------------- */

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

  /* ---------------- MARKER (ULTRA FIABLE) ---------------- */

  useEffect(() => {
    if (!map.current || !currentPosition) return;

    if (!userMarker.current) {
      const el = document.createElement("div");
      el.style.width = "16px";
      el.style.height = "16px";
      el.style.borderRadius = "50%";
      el.style.background = "#2f80ed";
      el.style.border = "3px solid white";
      el.style.boxShadow = "0 0 10px rgba(47,128,237,0.7)";

      userMarker.current = new mapboxgl.Marker(el)
        .setLngLat([currentPosition.lon, currentPosition.lat])
        .addTo(map.current);
    } else {
      userMarker.current.setLngLat([
        currentPosition.lon,
        currentPosition.lat,
      ]);
    }

    // centrage doux (type Strava)
    map.current.easeTo({
      center: [currentPosition.lon, currentPosition.lat],
      duration: 500,
    });
  }, [currentPosition]);

  /* ---------------- UI ---------------- */

  return (
    <Card className="overflow-hidden">
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
    </Card>
  );
};

export default MapView;