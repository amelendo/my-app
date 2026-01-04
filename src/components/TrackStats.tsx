import { Card } from "@/components/ui/card";
import { MapPin, TrendingUp, TrendingDown } from "lucide-react";
import { GPXTrack } from "@/utils/gpxParser";

interface TrackStatsProps {
  track: GPXTrack;
}

const TrackStats = ({ track }: TrackStatsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-2 hover:shadow-lg transition-all duration-300">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-accent/10 p-3">
            <MapPin className="h-6 w-6 text-accent" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Distance</p>
            <p className="text-2xl font-bold">{track.distance} km</p>
          </div>
        </div>
      </Card>
      
      <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-2 hover:shadow-lg transition-all duration-300">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-3">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Elevation Gain</p>
            <p className="text-2xl font-bold">{track.elevationGain} m</p>
          </div>
        </div>
      </Card>
      
      <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-2 hover:shadow-lg transition-all duration-300">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-destructive/10 p-3">
            <TrendingDown className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Elevation Loss</p>
            <p className="text-2xl font-bold">{track.elevationLoss} m</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default TrackStats;