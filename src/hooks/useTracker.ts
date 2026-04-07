import { useEffect, useRef, useState } from "react";
import { TrackPoint } from "@/utils/gpxParser";
import { toast } from "sonner";

const PATH_STORAGE_KEY = "currentPath";

export function useTracker() {
  const [isTracking, setIsTracking] = useState(false);
  const [userPath, setUserPath] = useState<TrackPoint[]>([]);
  const [distanceDone, setDistanceDone] = useState(0);
  const [elevationDone, setElevationDone] = useState(0);
  const [avgSpeed, setAvgSpeed] = useState(0);

  const watchId = useRef<number | null>(null);
  const wakeLock = useRef<any>(null);
  const startTime = useRef<number | null>(null);

  /* ------------------- WAKE LOCK ------------------- */
  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLock.current = await (navigator as any).wakeLock.request("screen");
        wakeLock.current.addEventListener("release", () =>
          console.log("Wake lock released")
        );
      }
    } catch (err) {
      console.error("Cannot obtain wake lock:", err);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLock.current) {
      await wakeLock.current.release();
      wakeLock.current = null;
    }
  };

  /* ------------------- LOCAL STORAGE ------------------- */
  const savePath = (points: TrackPoint[]) => {
    localStorage.setItem(PATH_STORAGE_KEY, JSON.stringify(points));
  };

  const loadPath = (): TrackPoint[] => {
    const data = localStorage.getItem(PATH_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  };

  /* ------------------- UTILS ------------------- */
  function getDistanceKm(p1: TrackPoint, p2: TrackPoint) {
    const R = 6371;
    const φ1 = (p1.lat * Math.PI) / 180;
    const φ2 = (p2.lat * Math.PI) / 180;
    const Δφ = ((p2.lat - p1.lat) * Math.PI) / 180;
    const Δλ = ((p2.lon - p1.lon) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  /* ------------------- GPS ------------------- */
  const handlePosition = (pos: GeolocationPosition) => {
    const { latitude, longitude, altitude, accuracy } = pos.coords;
    if (accuracy > 25) return; // filtre les signaux faibles
    const time = pos.timestamp;

    setUserPath((prev) => {
      const newPoint: TrackPoint = { lat: latitude, lon: longitude, ele: altitude ?? undefined, time };

      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        const dist = getDistanceKm(last, newPoint);

        // Ignore les sauts GPS > 100m
        if (dist > 0.1) return prev;
      }

      const newPath = [...prev, newPoint];
      savePath(newPath);

      // STATISTIQUES
      if (newPath.length >= 2) {
        const last = newPath[newPath.length - 1];
        const prevPoint = newPath[newPath.length - 2];
        const dist = getDistanceKm(prevPoint, last);

        setDistanceDone((d) => {
          const newDist = d + dist;
          if (startTime.current) {
            const elapsedHours = (Date.now() - startTime.current) / 3600000;
            if (elapsedHours > 0) setAvgSpeed(newDist / elapsedHours);
          }
          return newDist;
        });

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
    if (!navigator.geolocation) return toast.error("Geolocation not supported");

    setUserPath([]);
    setDistanceDone(0);
    setElevationDone(0);
    setAvgSpeed(0);
    startTime.current = Date.now();
    setIsTracking(true);

    requestWakeLock();

    watchId.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 1000,
    });
  };

  const stopTracking = () => {
    if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setIsTracking(false);
    releaseWakeLock();
  };

  // nettoyage global
  useEffect(() => {
    return () => {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      releaseWakeLock();
    };
  }, []);

  return {
    isTracking,
    userPath,
    distanceDone,
    elevationDone,
    avgSpeed,
    startTracking,
    stopTracking,
    loadPath,
  };
}
