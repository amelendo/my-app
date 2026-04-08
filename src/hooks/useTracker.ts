import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { TrackPoint } from "@/utils/gpxParser";

/* ------------------- Constantes ------------------- */
const PATH_STORAGE_KEY = "currentPath";

/* ------------------- Hook principal ------------------- */
export function useTracker() {
  const [isTracking, setIsTracking] = useState(false);
  const [userPath, setUserPath] = useState<TrackPoint[]>([]);
  const [distanceDone, setDistanceDone] = useState(0);
  const [elevationDone, setElevationDone] = useState(0);
  const [avgSpeed, setAvgSpeed] = useState(0);

  const watchId = useRef<number | null>(null);
  const wakeLock = useRef<any>(null);
  const startTime = useRef<number | null>(null);

  /* ------------------- UTILS ------------------- */
  const getDistanceKm = (p1: TrackPoint, p2: TrackPoint) => {
    const R = 6371; // rayon terrestre en km
    const φ1 = (p1.lat * Math.PI) / 180;
    const φ2 = (p2.lat * Math.PI) / 180;
    const Δφ = ((p2.lat - p1.lat) * Math.PI) / 180;
    const Δλ = ((p2.lon - p1.lon) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  /* ------------------- LOCAL STORAGE ------------------- */
  const savePath = (points: TrackPoint[]) => {
    localStorage.setItem(PATH_STORAGE_KEY, JSON.stringify(points));
  };

  const loadPath = (): TrackPoint[] => {
    const data = localStorage.getItem(PATH_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  };

 
    /* ------------------- WAKE LOCK ------------------- */
  const requestWakeLock = async () => {
    try {
      // Vérifie que l'API existe et est accessible
      if ("wakeLock" in navigator && typeof (navigator as any).wakeLock.request === "function") {
        wakeLock.current = await (navigator as any).wakeLock.request("screen");

        // Log propre quand le verrouillage est libéré
        wakeLock.current.addEventListener("release", () => {
          console.log("🔓 Wake Lock libéré (l'écran peut s'éteindre)");
        });

        console.log("✅ Wake Lock activé : l'écran restera allumé");
      } else {
        console.warn("⚠️ Wake Lock non supporté sur ce navigateur.");
      }
    } catch (err) {
      console.warn("⚠️ Impossible d'activer le Wake Lock :", err);
      // Option : informer l'utilisateur sans casser le flux
      // toast.info("Le maintien de l’écran éveillé n’est pas supporté sur ce navigateur mobile.");
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLock.current) {
        await wakeLock.current.release();
        wakeLock.current = null;
        console.log("🔓 Wake Lock désactivé manuellement");
      }
    } catch (err) {
      console.warn("⚠️ Erreur lors de la libération du Wake Lock :", err);
    }
  };


  /* ------------------- GPS ------------------- */
  const handlePosition = (pos: GeolocationPosition) => {
    const { latitude, longitude, altitude, accuracy } = pos.coords;
    const time = pos.timestamp;

    if (accuracy > 25) return; // filtre signaux GPS faibles

    setUserPath((prev) => {
      const newPoint: TrackPoint = {
        lat: latitude,
        lon: longitude,
        ele: altitude ?? undefined,
        time,
      };

      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        const dist = getDistanceKm(last, newPoint);

        // Ignore les sauts GPS > 100 m
        if (dist > 0.1) return prev;

        // distance cumulée = dernière + nouvelle portion
        newPoint.cumDist = (last.cumDist ?? 0) + dist;
      } else {
        newPoint.cumDist = 0;
      }

      const newPath = [...prev, newPoint];
      savePath(newPath);

      // ----------- Statistiques -----------
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
    if (err.code === err.TIMEOUT) toast.warning("⏳ En attente du signal GPS…");
    else toast.error(err.message);
  };

  const startTracking = () => {
    if (!navigator.geolocation) return toast.error("⚠️ Geolocation non supportée");

    setUserPath([]);
    setDistanceDone(0);
    setElevationDone(0);
    setAvgSpeed(0);
    startTime.current = Date.now();
    setIsTracking(true);

    requestWakeLock();

    watchId.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    );
  };

  const stopTracking = () => {
    if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setIsTracking(false);
    releaseWakeLock();
  };

  /* ------------------- CLEANUP ------------------- */
  useEffect(() => {
    return () => {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      releaseWakeLock();
    };
  }, []);

  return {
    // états et valeurs exposés
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
