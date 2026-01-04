import { useState } from "react";
import { Mountain } from "lucide-react";
import TrackUploader from "@/components/TrackUploader";
import MapView from "@/components/MapView";
import TrackStats from "@/components/TrackStats";
import { parseGPX, GPXTrack } from "@/utils/gpxParser";
import { toast } from "sonner";
import heroImage from "@/assets/hero-trail.jpg";

const Index = () => {
  const [currentTrack, setCurrentTrack] = useState<GPXTrack | null>(null);

  const handleFileUpload = async (file: File) => {
    try {
      const content = await file.text();
      const track = parseGPX(content);
      setCurrentTrack(track);
      toast.success(`Track "${track.name}" loaded successfully!`);
    } catch (error) {
      toast.error("Failed to parse GPX file. Please check the file format.");
      console.error(error);
    }
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
            Upload your GPX tracks and navigate with real-time GPS positioning in the hills
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        {!currentTrack ? (
          <div className="max-w-2xl mx-auto">
            <TrackUploader onFileUpload={handleFileUpload} />
          </div>
        ) : (
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-bold mb-2">{currentTrack.name}</h2>
              <p className="text-muted-foreground">
                Track your position in real-time as you run
              </p>
            </div>
            
            <TrackStats track={currentTrack} />
            
            <MapView track={currentTrack.points} trackName={currentTrack.name} />
            
            <div className="flex justify-center">
              <button
                onClick={() => setCurrentTrack(null)}
                className="text-accent hover:text-accent/80 font-medium transition-colors"
              >
                Upload another track
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;