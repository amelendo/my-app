import { useEffect, useState } from "react";
import { Mountain } from "lucide-react";
import TrackUploader from "@/components/TrackUploader";
import MapView from "@/components/MapView";
import TrackStats from "@/components/TrackStats";
import { parseGPX, GPXTrack } from "@/utils/gpxParser";
import {
  saveReferenceTrack,
  loadReferenceTrack,
  clearReferenceTrack,
} from "@/lib/trackStore";
import { toast } from "sonner";
import heroImage from "@/assets/hero-trail.jpg";

const Index = () => {
  const [currentTrack, setCurrentTrack] = useState<GPXTrack | null>(null);
  const [restoring, setRestoring] = useState(true);

  // Au démarrage : recharge la trace importée depuis IndexedDB
  // (permet de la retrouver hors-ligne, après un rechargement/kill de l'onglet).
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
      void saveReferenceTrack(track); // persiste pour l'usage hors-ligne
      toast.success(`Trace « ${track.name} » chargée !`);
    } catch (error) {
      toast.error("Échec de lecture du fichier GPX. Vérifiez le format.");
      console.error(error);
    }
  };

  const handleReset = () => {
    setCurrentTrack(null);
    void clearReferenceTrack();
  };

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
        {!currentTrack ? (
          <div className="max-w-2xl mx-auto">
            {!restoring && <TrackUploader onFileUpload={handleFileUpload} />}
          </div>
        ) : (
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-bold mb-2">{currentTrack.name}</h2>
              <p className="text-muted-foreground">
                Suivez votre position en temps réel pendant votre course
              </p>
            </div>

            <TrackStats track={currentTrack} />

            <MapView track={currentTrack.points} trackName={currentTrack.name} />

            <div className="flex justify-center">
              <button
                onClick={handleReset}
                className="text-accent hover:text-accent/80 font-medium transition-colors"
              >
                Importer une autre trace
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
