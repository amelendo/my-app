import { useRef, useEffect, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navigation } from "lucide-react";
import { exportToGpx } from "@/utils/exportGpx";
import { useTracker } from "@/hooks/useTracker";
import { TrackPoint } from "@/utils/gpxParser";

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

  useEffect(() => {
    if (!mapContainer.current || track.length === 0) return;

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [track[0].lon, track[0].lat],
      zoom: 13,
    });

    map.current.on("load", () => {
      const coordinates = track.map((p) => [p.lon, p.lat]);

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

      // Restaure la trace précédente
      const saved = loadPath();
      if (saved.length > 0) {
        const coords = saved.map((p) => [p.lon, p.lat]);
        const source = map.current?.getSource("userPath") as mapboxgl.GeoJSONSource;
        source.setData({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
        });
      }
    });

    return () => map.current?.remove();
  }, [track]);

  // Mise à jour live du chemin de l’utilisateur
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

  return (
    <Card className="overflow-hidden">
      <div className="relative h-[600px]">
        <div ref={mapContainer} className="absolute inset-0" />

        <div className="absolute top-4 left-4 z-10">
          {/* Interface simplifiée */}
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
                <p>Distance : <b>{distanceDone.toFixed(2)} km</b></p>
                <p>Dénivelé + : <b>{Math.round(elevationDone)} m</b></p>
                <p>Vitesse moy : <b>{avgSpeed.toFixed(1)} km/h</b></p>
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
    </Card>
  );
};

export default MapView;
