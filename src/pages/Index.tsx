import { useEffect, useState } from "react";
import { Mountain, Play } from "lucide-react";
import TrackUploader from "@/components/TrackUploader";
import MapView from "@/components/MapView";
import TrackStats from "@/components/TrackStats";
import { Button } from "@/components/ui/button";
import { parseGPX, GPXTrack, TrackPoint } from "@/utils/gpxParser";
import {
  saveReferenceTrack,
  loadReferenceTrack,
  clearReferenceTrack,
  getActiveSession,
  endSession,
} from "@/lib/trackStore";
import { toast } from "sonner";
import type { TrackPoint as TP } from "@/utils/gpxParser";
import heroImage from "@/assets/hero-trail.jpg";

// Référence stable : évite de réinitialiser la carte à chaque rendu en mode libre
const EMPTY_POINTS: TrackPoint[] = [];

const Index = () => {
  const [currentTrack, setCurrentTrack] = useState<GPXTrack | null>(null);
  const [freeRun, setFreeRun] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [recover, setRecover] = useState<{
    points: TP[];
    freeMode: boolean;
  } | null>(null);
  const [resumeInitial, setResumeInitial] = useState<TP[] | undefined>();

  // Détecte une course interrompue (app tuée/suspendue) au lancement
  useEffect(() => {
    getActiveSession()
      .then((s) => {
        if (s) setRecover(s);
      })
      .catch(() => {});
  }, []);

  const acceptRecovery = () => {
    if (!recover) return;
    setResumeInitial(recover.points);
    if (recover.freeMode) setFreeRun(true);
    // en mode trace, la trace de référence est restaurée par ailleurs
    setRecover(null);
  };

  const dismissRecovery = () => {
    void endSession();
    setRecover(null);
  };

  // Au démarrage : recharge la trace importée depuis IndexedDB
  useEffect(() => {
    let cancelled = false;
    loadReferenceTrack()
      .then((track) => {
        if (!cancelled && track) {
          setCurrentTrack(track);
          toast.info(`Trace « ${track.name} » restaurée`);
        }
      })
      .catch((err) => console.warn("Restauration de la trace impossible :", err))
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileUpload = async (file: File) => {
    try {
      const content = await file.text();
      const track = parseGPX(content);
      setCurrentTrack(track);
      void saveReferenceTrack(track);
      toast.success(`Trace « ${track.name} » chargée !`);
    } catch (error) {
      toast.error("Échec de lecture du fichier GPX. Vérifiez le format.");
      console.error(error);
    }
  };

  const handleReset = () => {
    setCurrentTrack(null);
    setFreeRun(false);
    void clearReferenceTrack();
  };

  const showMap = currentTrack || freeRun;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="relative h-[400px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-primary/80 via-primary/60 to-background" />
        </div>
        <div className="relative h-full container mx-auto px-4 flex flex-col justify-center items-center text-center">
          <Mountain className="h-16 w-16 text-accent mb-4" />
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 drop-shadow-lg">
            Trail Navigator
          </h1>
          <p className="text-xl text-white/90 max-w-2xl drop-shadow-md">
            Importez vos traces GPX et naviguez au GPS en temps réel sur les sentiers
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        {recover && (
          <div className="max-w-2xl mx-auto mb-6 rounded-lg border border-accent bg-accent/10 p-4">
            <p className="font-semibold mb-1">Sortie interrompue détectée</p>
            <p className="text-sm text-muted-foreground mb-3">
              Une course n'a pas été arrêtée correctement. Vous pouvez la
              reprendre pour ne pas perdre le tracé déjà enregistré.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={acceptRecovery}>
                Reprendre la sortie
              </Button>
              <Button size="sm" variant="ghost" onClick={dismissRecovery}>
                Ignorer
              </Button>
            </div>
          </div>
        )}

        {!showMap ? (
          <div className="max-w-2xl mx-auto space-y-6">
            {!restoring && (
              <>
                <TrackUploader onFileUpload={handleFileUpload} />

                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-sm">ou</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <Button
                  variant="outline"
                  className="w-full h-14 text-base"
                  onClick={() => setFreeRun(true)}
                >
                  <Play className="h-5 w-5 mr-2" />
                  Sortie libre (sans trace)
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-bold mb-2">
                {currentTrack ? currentTrack.name : "Sortie libre"}
              </h2>
              <p className="text-muted-foreground">
                {currentTrack
                  ? "Suivez votre position en temps réel pendant votre course"
                  : "Enregistrez votre parcours au fil de votre sortie"}
              </p>
            </div>

            {currentTrack && <TrackStats track={currentTrack} />}

            <MapView
              track={currentTrack ? currentTrack.points : EMPTY_POINTS}
              trackName={currentTrack ? currentTrack.name : "Sortie libre"}
              resumeInitial={resumeInitial}
            />

            <div className="flex justify-center">
              <button
                onClick={handleReset}
                className="text-accent hover:text-accent/80 font-medium transition-colors"
              >
                {currentTrack ? "Importer une autre trace" : "Terminer la sortie"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
