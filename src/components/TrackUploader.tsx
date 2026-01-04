import { Upload } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface TrackUploaderProps {
  onFileUpload: (file: File) => void;
}

const TrackUploader = ({ onFileUpload }: TrackUploaderProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".gpx")) {
      onFileUpload(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  };

  return (
    <Card
      className="border-2 border-dashed border-border hover:border-accent transition-all duration-300 cursor-pointer bg-card/50 backdrop-blur-sm"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => fileInputRef.current?.click()}
    >
      <div className="flex flex-col items-center justify-center p-12 gap-4">
        <div className="rounded-full bg-accent/10 p-6">
          <Upload className="h-12 w-12 text-accent" />
        </div>
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-2">Upload GPX Track</h3>
          <p className="text-muted-foreground">
            Drag and drop your GPX file here, or click to browse
          </p>
        </div>
        <Button variant="default" className="mt-2">
          Choose File
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".gpx"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </Card>
  );
};

export default TrackUploader;