"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { TrackPoint } from "@/utils/gpxParser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navigation, AlertTriangle } from "lucide-react";
import { exportToGpx } from "@/utils/exportGpx";
import { useTracker } from "@/hooks/useTracker";
import { computeNavInfo, type NavInfo } from "@/utils/navigation";
import ElevationProfile from "@/components/ElevationProfile";

interface MapViewProps {
  track: TrackPoint[];
  trackName: string;
}

const MapView = ({ track, trackName }: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const userMarker = useRef<mapboxgl.Marker | null>(null);
  const lastNearest = useRef(0);

  const [currentPosition, setCurrentPosition] = useState<TrackPoint | null>(null);
  const [nav, setNav] = useState<NavInfo | null>(null);

  const {
    isTracking,
    userPath,
    distanceDone,
    elevationDone,
    avgSpeed,
    startTracking,
    stopTracking,
  } = useTracker(setCurrentPosition);

  const totalKm = useMemo(
    () => track[track.length - 1]?.cumDist ?? 0,
    [track]
  );

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

      map.current!.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates },
        },
      });
      map.current!.addLayer({
        id: "route",
        type: "line",
        source: "route",
        paint: { "line-color": "#ff5a1f", "line-width": 4 },
      });

      map.current!.addSource("userPath", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
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
    const source = map.current?.getSource("userPath") as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (source) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: userPath.map((p) => [p.lon, p.lat]),
        },
      });
    }
  }, [userPath]);

  /* ---------------- MARKER + NAV ---------------- */
  useEffect(() => {
    if (!map.current || !currentPosition) return;

    // Marqueur position
    if (!userMarker.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:16px;height:16px;border-radius:50%;background:#2f80ed;border:3px solid white;box-shadow:0 0 10px rgba(47,128,237,0.7)";
      userMarker.current = new mapboxgl.Marker(el)
        .setLngLat([currentPosition.lon, currentPosition.lat])
        .addTo(map.current);
    } else {
      userMarker.current.setLngLat([currentPosition.lon, currentPosition.lat]);
    }

    map.current.easeTo({
      center: [currentPosition.lon, currentPosition.lat],
      duration: 500,
    });

    // Navigation : distance restante + hors-trace
    const info = computeNavInfo(currentPosition, track, lastNearest.current);
    if (info) {
      lastNearest.current = info.nearestIndex;
      setNav(info);
    }
  }, [currentPosition, track]);

  /* ---------------- UI ---------------- */
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="relative h-[600px]">
          <div ref={mapContainer} className="absolute inset-0" />

          <div className="absolute top-4 left-4 z-10 w-52">
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
                  <p><b>{distanceDone.toFixed(2)} km</b> parcourus</p>
                  <p><b>{Math.round(elevationDone)} m</b> D+</p>
                  <p><b>{avgSpeed.toFixed(1)} km/h</b></p>
                  {nav && (
                    <p className="text-muted-foreground">
                      Reste <b>{nav.remainingKm.toFixed(2)} km</b> / {totalKm.toFixed(1)}
                    </p>
                  )}
                </div>
              )}

              {isTracking && nav?.offTrack && (
                <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Hors trace ({Math.round(nav.distanceToTrackM)} m)
                  </span>
                </div>
              )}

              {!isTracking && userPath.length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => exportToGpx(userPath, `${trackName}_run`)}
                >
                  Export GPX
                </Button>
              )}
            </Card>
          </div>

          {/* Barre de progression en bas de carte */}
          {isTracking && nav && (
            <div className="absolute bottom-0 left-0 right-0 z-10 h-1.5 bg-black/10">
              <div
                className="h-full bg-accent transition-all duration-500"
                style={{ width: `${Math.round(nav.progressRatio * 100)}%` }}
              />
            </div>
          )}
        </div>
      </Card>

      <ElevationProfile track={track} currentCumDist={nav?.currentCumDist} />
    </div>
  );
};

export default MapView;
