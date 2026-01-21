import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { TrackPoint } from "@/utils/gpxParser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navigation } from "lucide-react";
import { toast } from "sonner";
import { exportToGpx } from "@/utils/exportGpx";

interface MapViewProps {
  track: TrackPoint[];
  trackName: string;
}

const MapView = ({ track, trackName }: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const userMarker = useRef<mapboxgl.Marker | null>(null);
  const watchId = useRef<number | null>(null);

  const [isTracking, setIsTracking] = useState(false);
  const [userPath, setUserPath] = useState<TrackPoint[]>([]);

  const [distanceDone, setDistanceDone] = useState(0); // km
  const [elevationDone, setElevationDone] = useState(0); // m
  const [startTime, setStartTime] = useState<number | null>(null);
  const [avgSpeed, setAvgSpeed] = useState(0); // km/h

  /* ---------------- MAP INIT ---------------- */

  useEffect(() => {
    if (!mapContainer.current || track.length === 0) return;

    mapboxgl.accessToken =
      "pk.eyJ1IjoiYW1lbGVuZG83MyIsImEiOiJjbWdsZHliNTExMzh3Mmxxd2oxYzZ3aXQ1In0.Jj2bDeD2J_ZJ0xX2I2cynQ";

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [track[0].lon, track[0].lat],
      zoom: 13,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      if (!map.current) return;

      // --- GPX Track ---
      const coordinates = track.map((p) => [p.lon, p.lat]);

      map.current.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates },
        },
      });

      map.current.addLayer({
        id: "route",
        type: "line",
        source: "route",
        paint: {
          "line-color": "hsl(15, 85%, 55%)",
          "line-width": 4,
        },
      });

      // --- User Path ---
      map.current.addSource("userPath", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [] },
        },
      });

      map.current.addLayer({
        id: "userPathLine",
        type: "line",
        source: "userPath",
        paint: {
          "line-color": "hsl(215, 85%, 45%)",
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      });

      // Fit bounds GPX
      const bounds = coordinates.reduce(
        (b, c) => b.extend(c as [number, number]),
        new mapboxgl.LngLatBounds(
          coordinates[0] as [number, number],
          coordinates[0] as [number, number]
        )
      );

      map.current.fitBounds(bounds, { padding: 50, duration: 0 });
    });

    return () => {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      map.current?.remove();
    };
  }, [track]);

  /* ---------------- GPS ---------------- */

  const handlePosition = (pos: GeolocationPosition) => {
    const { latitude, longitude, altitude } = pos.coords;
    const time = pos.timestamp;

    if (!map.current) return;

    // --- User Marker ---
    if (!userMarker.current) {
      const el = document.createElement("div");
      el.style.width = "18px";
      el.style.height = "18px";
      el.style.borderRadius = "50%";
      el.style.background = "hsl(215, 85%, 45%)";
      el.style.border = "3px solid white";
      el.style.boxShadow = "0 0 8px hsl(215, 85%, 45%)";

      userMarker.current = new mapboxgl.Marker(el)
        .setLngLat([longitude, latitude])
        .addTo(map.current);
    } else {
      userMarker.current.setLngLat([longitude, latitude]);
    }

    // recentre la carte en douceur
    map.current.easeTo({ center: [longitude, latitude], duration: 300 });

    // --- Update user path ---
    setUserPath((prev) => {
      const newPoint: TrackPoint = {
        lat: latitude,
        lon: longitude,
        ele: altitude ?? undefined,
        time: time,
      };

      const newPath = [...prev, newPoint];

      // draw line
      const source = map.current?.getSource("userPath") as
        | mapboxgl.GeoJSONSource
        | undefined;

      if (source) {
        const coords = newPath.map((p) => [p.lon, p.lat]);
        source.setData({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
        });
      }

      // --- Stats ---
      if (newPath.length >= 2) {
        const last = newPath[newPath.length - 1];
        const prevPoint = newPath[newPath.length - 2];

        // Distance incrementale
        const dist = getDistanceKm(prevPoint, last);
        setDistanceDone((d) => {
          const newDist = d + dist;

          // Average speed
          if (startTime) {
            const elapsedHours = (Date.now() - startTime) / 1000 / 3600;
            if (elapsedHours > 0) {
              setAvgSpeed(newDist / elapsedHours);
            }
          }

          return newDist;
        });

        // Elevation gain
        if (last.ele !== undefined && prevPoint.ele !== undefined) {
          const diff = last.ele - prevPoint.ele;
          if (diff > 0) setElevationDone((e) => e + diff);
        }
      }

      return newPath;
    });
  };

  const handleError = (err: GeolocationPositionError) => {
    if (err.code === err.TIMEOUT) toast.warning("Waiting for GPS signal…");
    else toast.error(err.message);
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }

    // reset stats
    setUserPath([]);
    setDistanceDone(0);
    setElevationDone(0);
    setAvgSpeed(0);
    setStartTime(Date.now());

    setIsTracking(true);

    watchId.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    );
  };

  const stopTracking = () => {
    if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setIsTracking(false);
  };

  /* ---------------- HELPERS ---------------- */

  function getDistanceKm(p1: TrackPoint, p2: TrackPoint) {
    const R = 6371;
    const φ1 = (p1.lat * Math.PI) / 180;
    const φ2 = (p2.lat * Math.PI) / 180;
    const Δφ = ((p2.lat - p1.lat) * Math.PI) / 180;
    const Δλ = ((p2.lon - p1.lon) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /* ---------------- UI ---------------- */

  return (
    <Card className="overflow-hidden">
      <div className="relative h-[600px]">
        <div ref={mapContainer} className="absolute inset-0" />

        <div className="absolute top-4 left-4 z-10">
          <Card className="p-3 bg-card/95">
            <h3 className="font-semibold text-sm mb-2">{trackName}</h3>

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
              <div className="mt-3 text-sm space-y-1">
                <p>
                  Distance : <b>{distanceDone.toFixed(2)} km</b>
                </p>
                <p>
                  Dénivelé + : <b>{Math.round(elevationDone)} m</b>
                </p>
                <p>
                  Vitesse moyenne : <b>{avgSpeed.toFixed(1)} km/h</b>
                </p>
              </div>
            )}

            {!isTracking && userPath.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                className="w-full mt-2"
                onClick={() =>
                  exportToGpx(userPath, trackName + "_run")
                }
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
