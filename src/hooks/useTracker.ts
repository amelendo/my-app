import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { TrackPoint } from "@/utils/gpxParser";
import { savePath, endSession, beginSession, loadPath as loadStoredPath } from "@/lib/trackStore";

/* ------------------- Constantes ------------------- */
const ACCURACY_MAX_M = 25;        // rejet des fixes trop imprécis
const JUMP_MAX_M = 100;           // rejet des sauts GPS aberrants
const ELEVATION_THRESHOLD_M = 3;  // seuil anti-bruit pour le D+ (comme gpxParser)
const EMA_ALPHA = 0.35;           // lissage exponentiel de la position
const SAVE_INTERVAL_MS = 4000;    // fréquence max de sauvegarde IndexedDB
const WEAK_SIGNAL_STREAK = 8;     // nb de fixes rejetés avant alerte

/* ------------------- Utils géo ------------------- */
function haversineMeters(p1: TrackPoint, p2: TrackPoint): number {
  const R = 6371000;
  const f1 = (p1.lat * Math.PI) / 180;
  const f2 = (p2.lat * Math.PI) / 180;
  const df = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dl = ((p2.lon - p1.lon) * Math.PI) / 180;
  const a =
    Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/* ------------------- Hook principal ------------------- */
export function useTracker(setCurrentPosition?: (p: TrackPoint) => void) {
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [wakeActive, setWakeActive] = useState(false); // écran maintenu allumé
  const [userPath, setUserPath] = useState<TrackPoint[]>([]);
  const [distanceDone, setDistanceDone] = useState(0); // km
  const [elevationDone, setElevationDone] = useState(0); // m (D+)
  const [avgSpeed, setAvgSpeed] = useState(0); // km/h

  // Sources de vérité (refs) — évite les setState imbriqués
  const pathRef = useRef<TrackPoint[]>([]);
  const distanceKmRef = useRef(0);
  const elevationRef = useRef(0);
  const eleBufferRef = useRef(0);
  const emaRef = useRef<{ lat: number; lon: number } | null>(null);
  const lastSavedRef = useRef(0);
  const weakStreakRef = useRef(0);

  // Pause : suspension de l'enregistrement + temps réellement en mouvement
  const pausedRef = useRef(false);
  const reanchorRef = useRef(false); // ré-ancre le 1er point après reprise
  const movingAccumRef = useRef(0); // ms cumulés des segments en mouvement
  const segStartRef = useRef<number | null>(null); // début du segment courant

  const watchId = useRef<number | null>(null);
  const wakeLock = useRef<any>(null);
  const startTime = useRef<number | null>(null);

  /* ------------------- WAKE LOCK ------------------- */
  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator && (navigator as any).wakeLock?.request) {
        wakeLock.current = await (navigator as any).wakeLock.request("screen");
        setWakeActive(true);
        // Le verrou peut être relâché par le système (écran éteint, onglet caché)
        wakeLock.current.addEventListener?.("release", () => {
          setWakeActive(false);
        });
      }
    } catch (err) {
      setWakeActive(false);
      console.warn("Wake Lock indisponible :", err);
    }
  };

  const releaseWakeLock = async () => {
    try {
      await wakeLock.current?.release();
    } catch (err) {
      console.warn("Release Wake Lock :", err);
    } finally {
      wakeLock.current = null;
      setWakeActive(false);
    }
  };

  /* ------------------- GPS ------------------- */
  const handlePosition = (pos: GeolocationPosition) => {
    if (pausedRef.current) return; // en pause : on n'enregistre rien

    const { latitude, longitude, altitude, accuracy } = pos.coords;

    // Filtre précision, avec alerte si le signal reste faible
    if (accuracy > ACCURACY_MAX_M) {
      weakStreakRef.current += 1;
      if (weakStreakRef.current === WEAK_SIGNAL_STREAK) {
        toast.warning("Signal GPS faible — position peu fiable");
      }
      return;
    }
    weakStreakRef.current = 0;

    // Lissage exponentiel non destructif de la position
    if (!emaRef.current) {
      emaRef.current = { lat: latitude, lon: longitude };
    } else {
      emaRef.current = {
        lat: EMA_ALPHA * latitude + (1 - EMA_ALPHA) * emaRef.current.lat,
        lon: EMA_ALPHA * longitude + (1 - EMA_ALPHA) * emaRef.current.lon,
      };
    }

    const point: TrackPoint = {
      lat: emaRef.current.lat,
      lon: emaRef.current.lon,
      ele: altitude ?? undefined,
      time: pos.timestamp,
    };

    const prev = pathRef.current[pathRef.current.length - 1];

    if (prev && !reanchorRef.current) {
      const seg = haversineMeters(prev, point);
      if (seg > JUMP_MAX_M) return; // saut GPS aberrant

      // Distance : accumulateur unique (source de vérité)
      distanceKmRef.current += seg / 1000;
      point.cumDist = distanceKmRef.current;

      // Dénivelé positif filtré (buffer + seuil, comme le parser GPX)
      if (prev.ele !== undefined && point.ele !== undefined) {
        eleBufferRef.current += point.ele - prev.ele;
        if (eleBufferRef.current > ELEVATION_THRESHOLD_M) {
          elevationRef.current += eleBufferRef.current;
          eleBufferRef.current = 0;
        } else if (eleBufferRef.current < -ELEVATION_THRESHOLD_M) {
          eleBufferRef.current = 0; // on ne compte que le D+
        }
      }
    } else {
      // Premier point, ou premier après une reprise : on ré-ancre sans
      // compter le segment (évite une ligne droite parasite sur le tracé).
      point.cumDist = distanceKmRef.current;
      reanchorRef.current = false;
    }

    pathRef.current = [...pathRef.current, point];

    // Vitesse moyenne, calculée sur le temps RÉELLEMENT en mouvement
    const movingMs =
      movingAccumRef.current +
      (segStartRef.current ? Date.now() - segStartRef.current : 0);
    const hours = movingMs / 3600000;
    if (hours > 0) setAvgSpeed(distanceKmRef.current / hours);

    // Marqueur temps réel
    setCurrentPosition?.(point);

    // Commit d'état (React 18 batch ces updates automatiquement)
    setUserPath(pathRef.current);
    setDistanceDone(distanceKmRef.current);
    setElevationDone(elevationRef.current);

    // Sauvegarde throttlée
    const now = Date.now();
    if (now - lastSavedRef.current > SAVE_INTERVAL_MS) {
      lastSavedRef.current = now;
      void savePath(pathRef.current);
    }
  };

  const handleError = (err: GeolocationPositionError) => {
    if (err.code === err.TIMEOUT) toast.warning("En attente du GPS…");
    else toast.error(err.message);
  };

  /* ------------------- CONTROLS ------------------- */
  const startTracking = (freeMode = false) => {
    if (!navigator.geolocation) {
      toast.error("Géolocalisation non supportée par ce navigateur");
      return;
    }

    pathRef.current = [];
    distanceKmRef.current = 0;
    elevationRef.current = 0;
    eleBufferRef.current = 0;
    emaRef.current = null;
    weakStreakRef.current = 0;
    lastSavedRef.current = 0;
    startTime.current = Date.now();

    pausedRef.current = false;
    reanchorRef.current = false;
    movingAccumRef.current = 0;
    segStartRef.current = Date.now();

    setUserPath([]);
    setDistanceDone(0);
    setElevationDone(0);
    setAvgSpeed(0);
    setIsPaused(false);
    setIsTracking(true);

    void beginSession(freeMode); // marque la course comme active
    void requestWakeLock();

    watchId.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
    );
  };

  /**
   * Reprend une course interrompue à partir d'un tracé restauré :
   * recalcule distance et D+, puis relance l'enregistrement par-dessus.
   */
  const resumeSession = (points: TrackPoint[]) => {
    if (!navigator.geolocation || points.length === 0) return;

    // Recalcule distance et D+ depuis les points restaurés
    let dist = 0;
    let elev = 0;
    let eleBuf = 0;
    for (let i = 1; i < points.length; i++) {
      dist += haversineMeters(points[i - 1], points[i]) / 1000;
      const a = points[i - 1].ele;
      const b = points[i].ele;
      if (a !== undefined && b !== undefined) {
        eleBuf += b - a;
        if (eleBuf > ELEVATION_THRESHOLD_M) {
          elev += eleBuf;
          eleBuf = 0;
        } else if (eleBuf < -ELEVATION_THRESHOLD_M) {
          eleBuf = 0;
        }
      }
      points[i].cumDist = dist;
    }

    pathRef.current = [...points];
    distanceKmRef.current = dist;
    elevationRef.current = elev;
    eleBufferRef.current = 0;
    const last = points[points.length - 1];
    emaRef.current = { lat: last.lat, lon: last.lon };
    weakStreakRef.current = 0;
    lastSavedRef.current = 0;
    startTime.current = Date.now();

    // Temps en mouvement approximatif d'après les horodatages restaurés
    const t0 = Number(points[0].time);
    const t1 = Number(last.time);
    movingAccumRef.current =
      Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0 ? t1 - t0 : 0;
    segStartRef.current = Date.now();
    pausedRef.current = false;
    reanchorRef.current = true; // évite un saut au premier nouveau point

    setUserPath(pathRef.current);
    setDistanceDone(dist);
    setElevationDone(elev);
    setAvgSpeed(0);
    setIsPaused(false);
    setIsTracking(true);

    void requestWakeLock();
    watchId.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
    );
  };

  const pauseTracking = () => {
    if (!isTracking || pausedRef.current) return;
    pausedRef.current = true;
    // Fige le temps en mouvement accumulé jusqu'ici
    if (segStartRef.current) {
      movingAccumRef.current += Date.now() - segStartRef.current;
      segStartRef.current = null;
    }
    setIsPaused(true);
    void savePath(pathRef.current);
  };

  const resumeTracking = () => {
    if (!isTracking || !pausedRef.current) return;
    pausedRef.current = false;
    reanchorRef.current = true; // pas de segment parasite au redémarrage
    emaRef.current = null; // ré-amorce le lissage
    segStartRef.current = Date.now();
    setIsPaused(false);
  };

  const stopTracking = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    // Fige le dernier segment de mouvement
    if (!pausedRef.current && segStartRef.current) {
      movingAccumRef.current += Date.now() - segStartRef.current;
    }
    segStartRef.current = null;
    pausedRef.current = false;
    setIsPaused(false);
    setIsTracking(false);
    void releaseWakeLock();
    void endSession(); // fin propre : rien à reprendre
  };

  /* ------------------- Récupération après crash ------------------- */
  const loadPath = () => loadStoredPath();
  const resetPath = () => endSession();

  /* ------------------- Effets ------------------- */
  // Réacquiert le wake lock quand l'app revient au premier plan
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && isTracking && !isPaused) {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isTracking, isPaused]);

  // Réacquisition périodique : si le verrou a été relâché, on le reprend
  useEffect(() => {
    if (!isTracking || isPaused) return;
    const id = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        (!wakeLock.current || wakeLock.current.released)
      ) {
        void requestWakeLock();
      }
    }, 15000);
    return () => clearInterval(id);
  }, [isTracking, isPaused]);

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      void releaseWakeLock();
    };
  }, []);

  return {
    isTracking,
    isPaused,
    wakeActive,
    userPath,
    distanceDone,
    elevationDone,
    avgSpeed,
    startTracking,
    stopTracking,
    pauseTracking,
    resumeTracking,
    resumeSession,
    loadPath,
    resetPath,
  };
}
