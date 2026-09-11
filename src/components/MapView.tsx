"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { TrackPoint } from "@/utils/gpxParser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navigation, AlertTriangle, Download, X, Upload, Pause, Play, Map as MapIcon, Gauge } from "lucide-react";
import { exportToGpx } from "@/utils/exportGpx";
import { useTracker } from "@/hooks/useTracker";
import { computeNavInfo, type NavInfo } from "@/utils/navigation";
import {
  prefetchArea,
  prefetchBounds,
  estimateBounds,
  gridAround,
  type Estimate,
} from "@/utils/prefetchTiles";
import ElevationProfile from "@/components/ElevationProfile";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { saveRun } from "@/lib/runs";

const MAP_STYLE = "mapbox://styles/mapbox/outdoors-v12";

interface MapViewProps {
  track: TrackPoint[];
  trackName: string;
  resumeInitial?: TrackPoint[]; // tracé à reprendre (course interrompue)
}

const MapView = ({ track, trackName, resumeInitial }: MapViewProps) => {
  const freeMode = track.length === 0;

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapWrapper = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const userMarker = useRef<mapboxgl.Marker | null>(null);
  const lastNearest = useRef(0);

  const [currentPosition, setCurrentPosition] = useState<TrackPoint | null>(null);
  const [nav, setNav] = useState<NavInfo | null>(null);
  const [prefetch, setPrefetch] = useState<{
    running: boolean;
    done: number;
    total: number;
  }>({ running: false, done: 0, total: 0 });
  const prefetchAbort = useRef<AbortController | null>(null);
  const [prefetchRadius, setPrefetchRadius] = useState(3); // km, mode libre
  const [zoneEstimate, setZoneEstimate] = useState<Estimate | null>(null);
  const [hiRes, setHiRes] = useState(false); // ajoute le zoom 16

  const {
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
    getMovingMs,
  } = useTracker(setCurrentPosition);

  const totalKm = useMemo(
    () => track[track.length - 1]?.cumDist ?? 0,
    [track]
  );

  /* ---------------- MAP INIT ---------------- */
  useEffect(() => {
    if (!mapContainer.current) return;

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

    // Centre initial : 1er point de la trace, sinon centre neutre (recentré au GPS)
    const initialCenter: [number, number] = freeMode
      ? [2.35, 46.6]
      : [track[0].lon, track[0].lat];

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: initialCenter,
      zoom: freeMode ? 5 : 13,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      // Calque de la trace de référence (uniquement si trace présente)
      if (!freeMode) {
        map.current!.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: track.map((p) => [p.lon, p.lat]),
            },
          },
        });
        map.current!.addLayer({
          id: "route",
          type: "line",
          source: "route",
          paint: { "line-color": "#ff5a1f", "line-width": 4 },
        });
      }

      // Calque du parcours enregistré (toujours présent)
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

      // En sortie libre : recentre sur la position GPS actuelle
      if (freeMode && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            map.current?.easeTo({
              center: [pos.coords.longitude, pos.coords.latitude],
              zoom: 14,
            }),
          () => {
            /* pas de position : on reste sur le centre neutre */
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      }
    });

    return () => map.current?.remove();
  }, [track, freeMode]);

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

    // Navigation : distance restante + hors-trace (seulement avec une trace)
    if (!freeMode) {
      const info = computeNavInfo(currentPosition, track, lastNearest.current);
      if (info) {
        lastNearest.current = info.nearestIndex;
        setNav(info);
      }
    }
  }, [currentPosition, track, freeMode]);

  /* ---------------- MODE COURSE (plein écran CSS) ---------------- */
  // On n'utilise plus le Fullscreen API du navigateur : Android l'annule au
  // verrouillage et ne peut pas le réactiver seul. À la place, un "mode course"
  // géré en CSS fait occuper 100% de l'écran à la carte. Avantage : il SURVIT
  // au verrouillage (ce n'est que de la mise en page, pas une permission).
  const [raceMode, setRaceMode] = useState(false);
  const [view, setView] = useState<"data" | "map">("data"); // vue par défaut : données
  const [, setTick] = useState(0); // rafraîchit le chrono chaque seconde
  const { session } = useAuth();
  const startedAtRef = useRef<number | null>(null);

  // Chrono : rafraîchit l'affichage chaque seconde pendant la course
  useEffect(() => {
    if (!isTracking || isPaused) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isTracking, isPaused]);

  const handleStart = () => {
    startedAtRef.current = Date.now();
    startTracking(freeMode);
    setRaceMode(true);
    setView("data");
    toast.info("Gardez l'écran allumé pour un suivi continu.", {
      duration: 5000,
    });
  };

  const handleStop = async () => {
    stopTracking();
    setRaceMode(false);

    // Sauvegarde sur le compte si connecté et sortie non vide
    if (session && userPath.length > 1) {
      try {
        const durationS = startedAtRef.current
          ? Math.round((Date.now() - startedAtRef.current) / 1000)
          : 0;
        await saveRun({
          name: freeMode ? "Sortie libre" : trackName,
          startedAt: startedAtRef.current ?? Date.now(),
          durationS,
          distanceKm: distanceDone,
          elevationM: elevationDone,
          points: userPath,
        });
        toast.success("Sortie enregistrée dans « Mes sorties ».");
      } catch (e: any) {
        toast.error(e?.message ?? "Échec de l'enregistrement de la sortie");
      }
    } else if (!session && userPath.length > 1) {
      toast.info("Connectez-vous pour enregistrer vos sorties.");
    }
  };

  // La carte doit se recalculer quand on entre/sort du mode course
  useEffect(() => {
    const t = setTimeout(() => map.current?.resize(), 150);
    return () => clearTimeout(t);
  }, [raceMode]);

  // Reprise d'une course interrompue : restaure le tracé et relance le suivi
  useEffect(() => {
    if (resumeInitial && resumeInitial.length > 1) {
      startedAtRef.current = Date.now();
      resumeSession(resumeInitial);
      setRaceMode(true);
      setView("data");
      toast.success("Sortie reprise — enregistrement relancé.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- PREFETCH TUILES ---------------- */
  const startPrefetch = async () => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) {
      toast.error("Token Mapbox manquant.");
      return;
    }

    // Points cibles : le corridor de la trace, ou une grille autour de la position
    let points = track;
    if (freeMode) {
      const center = await resolvePosition();
      if (!center) {
        toast.error("Position GPS indisponible pour le téléchargement.");
        return;
      }
      points = gridAround(center, prefetchRadius); // rayon réglable autour de vous
    }

    const controller = new AbortController();
    prefetchAbort.current = controller;
    setPrefetch({ running: true, done: 0, total: 0 });
    toast.info(
      freeMode
        ? "Téléchargement de la carte autour de vous…"
        : "Téléchargement de la carte de la zone…"
    );

    try {
      const res = await prefetchArea({
        token,
        style: MAP_STYLE,
        points,
        zooms: [13, 14, 15],
        signal: controller.signal,
        onProgress: (done, total) =>
          setPrefetch({ running: true, done, total }),
      });

      if (res.aborted) {
        toast.message("Téléchargement interrompu.");
      } else {
        toast.success(
          res.capped
            ? `Zone partiellement téléchargée (${res.done} tuiles, limite atteinte).`
            : `Carte disponible hors-ligne (${res.done} tuiles).`
        );
      }
    } catch (err) {
      console.error(err);
      toast.error("Échec du téléchargement des tuiles.");
    } finally {
      prefetchAbort.current = null;
      setPrefetch({ running: false, done: 0, total: 0 });
    }
  };

  // Renvoie la position courante (celle du suivi, sinon un fix GPS ponctuel)
  const resolvePosition = (): Promise<{ lat: number; lon: number } | null> => {
    if (currentPosition) {
      return Promise.resolve({
        lat: currentPosition.lat,
        lon: currentPosition.lon,
      });
    }
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  };

  /* ---------------- TÉLÉCHARGEMENT ZONE VISIBLE ---------------- */
  const zoneZooms = () => (hiRes ? [13, 14, 15, 16] : [13, 14, 15]);

  const currentBounds = () => {
    const b = map.current?.getBounds();
    if (!b) return null;
    return {
      west: b.getWest(),
      east: b.getEast(),
      south: b.getSouth(),
      north: b.getNorth(),
    };
  };

  // Recalcule l'estimation (à l'ouverture du panneau et au changement de détail)
  const refreshEstimate = () => {
    const b = currentBounds();
    if (b) setZoneEstimate(estimateBounds(b, zoneZooms()));
  };

  const openZonePanel = () => {
    refreshEstimate();
  };

  const downloadZone = async () => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    const b = currentBounds();
    if (!token || !b) {
      toast.error("Zone indisponible.");
      return;
    }
    setZoneEstimate(null);
    const controller = new AbortController();
    prefetchAbort.current = controller;
    setPrefetch({ running: true, done: 0, total: 0 });
    toast.info("Téléchargement de la zone visible…");

    try {
      const res = await prefetchBounds({
        token,
        style: MAP_STYLE,
        bounds: b,
        zooms: zoneZooms(),
        maxTiles: 5000,
        signal: controller.signal,
        onProgress: (done, total) => setPrefetch({ running: true, done, total }),
      });
      if (res.aborted) toast.message("Téléchargement interrompu.");
      else
        toast.success(
          res.capped
            ? `Zone partiellement téléchargée (${res.done} tuiles, limite atteinte).`
            : `Zone disponible hors-ligne (${res.done} tuiles).`
        );
    } catch (err) {
      console.error(err);
      toast.error("Échec du téléchargement de la zone.");
    } finally {
      prefetchAbort.current = null;
      setPrefetch({ running: false, done: 0, total: 0 });
    }
  };

  const cancelPrefetch = () => prefetchAbort.current?.abort();

  /* ---------------- EXPORT POUR STRAVA (manuel) ---------------- */
  // L'API Strava est désormais réservée aux abonnés payants. On télécharge
  // donc le GPX et on ouvre la page d'import Strava : l'utilisateur y dépose
  // le fichier. Gratuit, sans OAuth ni serverless.
  const handleExportForStrava = () => {
    exportToGpx(userPath, `${trackName}_run`);
    toast.info("GPX téléchargé — déposez-le sur la page Strava qui s'ouvre.");
    window.open("https://www.strava.com/upload/select", "_blank", "noopener");
  };

  /* ---------------- FORMATAGE DONNÉES ---------------- */
  const formatPace = (kmh: number) => {
    if (!kmh || kmh < 0.3) return "--:--";
    const minPerKm = 60 / kmh;
    const m = Math.floor(minPerKm);
    const s = Math.round((minPerKm - m) * 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const formatDuration = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  };

  /* ---------------- UI ---------------- */
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div
          ref={mapWrapper}
          className={
            raceMode
              ? "fixed inset-0 z-[100] bg-background"
              : "relative h-[600px] bg-background"
          }
        >
          <div ref={mapContainer} className="absolute inset-0" />

          {/* Vue DONNÉES (plein écran, par défaut pendant la course) */}
          {/* Vue DONNÉES (plein écran, fond sombre, style course) */}
          {raceMode && view === "data" && (
            <div className="absolute inset-0 z-20 bg-[#0f172a] text-white flex flex-col">
              {/* Bandeau haut : statut */}
              <div className="px-5 pt-5 flex items-center justify-between text-sm">
                <span className="font-medium truncate">
                  {freeMode ? "Sortie libre" : trackName}
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      isPaused
                        ? "bg-amber-400"
                        : wakeActive
                        ? "bg-green-400"
                        : "bg-red-400"
                    }`}
                  />
                  <span className="text-white/70">
                    {isPaused ? "En pause" : wakeActive ? "Actif" : "Écran ?"}
                  </span>
                </span>
              </div>

              {/* Deux chiffres dominants */}
              <div className="flex-1 flex flex-col justify-center px-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-[15px] uppercase tracking-widest text-white/50">
                      Distance
                    </p>
                    <p className="text-7xl font-bold tabular-nums leading-none mt-1">
                      {distanceDone.toFixed(2)}
                    </p>
                    <p className="text-white/50 mt-1">km</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[15px] uppercase tracking-widest text-white/50">
                      Allure
                    </p>
                    <p className="text-7xl font-bold tabular-nums leading-none mt-1">
                      {formatPace(avgSpeed)}
                    </p>
                    <p className="text-white/50 mt-1">min/km</p>
                  </div>
                </div>

                {/* Ligne secondaire : D+, durée, (restant) */}
                <div className="mt-10 grid grid-cols-3 gap-3 text-center border-t border-white/10 pt-6">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/50">
                      D+
                    </p>
                    <p className="text-3xl font-semibold tabular-nums">
                      {Math.round(elevationDone)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/50">
                      Durée
                    </p>
                    <p className="text-3xl font-semibold tabular-nums">
                      {formatDuration(getMovingMs())}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/50">
                      {freeMode ? "Vitesse" : "Restant"}
                    </p>
                    <p className="text-3xl font-semibold tabular-nums">
                      {freeMode
                        ? avgSpeed.toFixed(1)
                        : nav
                        ? nav.remainingKm.toFixed(1)
                        : "--"}
                    </p>
                  </div>
                </div>

                {!freeMode && nav?.offTrack && (
                  <p className="text-center text-red-400 mt-4 font-medium">
                    ⚠ Hors trace ({Math.round(nav.distanceToTrackM)} m)
                  </p>
                )}
              </div>

              {/* Gros boutons tactiles */}
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={isPaused ? resumeTracking : pauseTracking}
                    className="h-16 rounded-2xl bg-white/15 hover:bg-white/25 active:bg-white/30 flex items-center justify-center gap-2 text-lg font-semibold"
                  >
                    {isPaused ? (
                      <><Play className="h-6 w-6" />Reprendre</>
                    ) : (
                      <><Pause className="h-6 w-6" />Pause</>
                    )}
                  </button>
                  <button
                    onClick={handleStop}
                    className="h-16 rounded-2xl bg-red-600 hover:bg-red-500 active:bg-red-700 flex items-center justify-center gap-2 text-lg font-semibold"
                  >
                    <Navigation className="h-6 w-6" />
                    Stop
                  </button>
                </div>
                <button
                  onClick={() => {
                    setView("map");
                    setTimeout(() => map.current?.resize(), 100);
                  }}
                  className="w-full h-12 rounded-xl border border-white/20 hover:bg-white/10 flex items-center justify-center gap-2 text-base"
                >
                  <MapIcon className="h-5 w-5" />
                  Voir la carte
                </button>
              </div>
            </div>
          )}

          <div className="absolute top-4 left-4 z-10 w-64 sm:w-72 max-w-[calc(100%-2rem)]">
            <Card className="p-4 bg-card/95 space-y-2.5">
              <h3 className="font-semibold text-sm">
                {freeMode ? "Sortie libre" : trackName}
              </h3>

              <Button
                size="sm"
                onClick={isTracking ? handleStop : handleStart}
                variant={isTracking ? "destructive" : "default"}
                className="w-full"
              >
                <Navigation className="h-4 w-4 mr-2" />
                {isTracking ? "Stop" : "Start"}
              </Button>

              {raceMode && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => setView("data")}
                >
                  <Gauge className="h-4 w-4 mr-2" />
                  Données
                </Button>
              )}

              {isTracking && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={isPaused ? resumeTracking : pauseTracking}
                >
                  {isPaused ? (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Reprendre
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </>
                  )}
                </Button>
              )}

              {isPaused && (
                <p className="text-sm text-center text-accent font-medium">
                  ⏸ En pause
                </p>
              )}

              {isTracking && !isPaused && (
                <div
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs ${
                    wakeActive
                      ? "bg-green-500/10 text-green-700"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      wakeActive ? "bg-green-500" : "bg-destructive"
                    }`}
                  />
                  <span>
                    {wakeActive
                      ? "Écran maintenu actif"
                      : "Écran non maintenu — ne verrouillez pas"}
                  </span>
                </div>
              )}

              {/* Téléchargement hors-ligne de la zone */}
              {!prefetch.running ? (
                <div className="space-y-1.5">
                  {freeMode && (
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground mr-1">
                        Rayon
                      </span>
                      {[3, 5, 10].map((r) => (
                        <button
                          key={r}
                          onClick={() => setPrefetchRadius(r)}
                          className={`flex-1 rounded px-2 py-1 text-sm border transition-colors ${
                            prefetchRadius === r
                              ? "bg-accent text-accent-foreground border-accent"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          {r} km
                        </button>
                      ))}
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={startPrefetch}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Carte hors-ligne
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      Téléchargement…{" "}
                      {prefetch.total
                        ? `${Math.round((prefetch.done / prefetch.total) * 100)}%`
                        : ""}
                    </span>
                    <button
                      onClick={cancelPrefetch}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Annuler"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{
                        width: prefetch.total
                          ? `${(prefetch.done / prefetch.total) * 100}%`
                          : "0%",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Télécharger la zone visible (rectangle cadré à l'écran) */}
              {!prefetch.running && !zoneEstimate && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={openZonePanel}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Zone visible
                </Button>
              )}

              {!prefetch.running && zoneEstimate && (
                <div className="space-y-2 rounded-md border border-border p-2">
                  <p className="text-sm">
                    ≈ <b>{zoneEstimate.tiles}</b> tuiles ·{" "}
                    <b>~{zoneEstimate.megabytes} Mo</b> · ~{zoneEstimate.minutes} min
                  </p>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hiRes}
                      onChange={(e) => {
                        setHiRes(e.target.checked);
                        const b = currentBounds();
                        if (b)
                          setZoneEstimate(
                            estimateBounds(
                              b,
                              e.target.checked ? [13, 14, 15, 16] : [13, 14, 15]
                            )
                          );
                      }}
                    />
                    Haute résolution (zoom 16)
                  </label>
                  {zoneEstimate.tiles > 3000 && (
                    <p className="text-sm text-destructive">
                      Zone volumineuse : une partie pourrait être purgée du cache.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={downloadZone}
                    >
                      Télécharger
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setZoneEstimate(null)}
                    >
                      Annuler
                    </Button>
                  </div>
                </div>
              )}

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
                <div className="space-y-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={() => exportToGpx(userPath, `${trackName}_run`)}
                  >
                    Export GPX
                  </Button>
                  <Button
                    size="sm"
                    className="w-full bg-[#fc4c02] hover:bg-[#e34402] text-white"
                    onClick={handleExportForStrava}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Exporter pour Strava
                  </Button>
                </div>
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

      {!freeMode && (
        <ElevationProfile track={track} currentCumDist={nav?.currentCumDist} />
      )}
    </div>
  );
};

export default MapView;
