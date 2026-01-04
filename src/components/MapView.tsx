import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { TrackPoint } from "@/utils/gpxParser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navigation } from "lucide-react";
import { toast } from "sonner";

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

  /* ---------------- MAP ---------------- */

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

      const coordinates = track.map((p) => [p.lon, p.lat]);

      map.current.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates },
          properties: {},
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

      const bounds = coordinates.reduce(
        (b, c) => b.extend(c as [number, number]),
        new mapboxgl.LngLatBounds(coordinates[0] as [number, number], coordinates[0] as [number, number])
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
    const { latitude, longitude } = pos.coords;

    if (!map.current) return;

    if (!userMarker.current) {
      const el = document.createElement("div");
      el.style.width = "18px";
      el.style.height = "18px";
      el.style.borderRadius = "50%";
      el.style.background = "hsl(215, 85%, 45%)";
      el.style.border = "3px solid white";

      userMarker.current = new mapboxgl.Marker(el)
        .setLngLat([longitude, latitude])
        .addTo(map.current);
    } else {
      userMarker.current.setLngLat([longitude, latitude]);
    }

    // FORCE VISIBILITY
    map.current.jumpTo({ center: [longitude, latitude] });
  };

  const handleError = (err: GeolocationPositionError) => {
    if (err.code === err.TIMEOUT) {
      toast.warning("Waiting for GPS signal…");
      return;
    }
    toast.error(err.message);
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }

    setIsTracking(true);

    watchId.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 10000,
      }
    );
  };

  const stopTracking = () => {
    if (watchId.current) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsTracking(false);
  };

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
          </Card>
        </div>
      </div>
    </Card>
  );
};

export default MapView;
