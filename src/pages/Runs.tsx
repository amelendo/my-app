// src/pages/Runs.tsx — liste des sorties enregistrées sur le compte.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Download } from "lucide-react";
import { listRuns, getRun, deleteRun, type RunRecord } from "@/lib/runs";
import { exportToGpx } from "@/utils/exportGpx";
import { toast } from "sonner";

function formatDuration(s: number | null): string {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}h${String(m).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const Runs = () => {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    listRuns()
      .then(setRuns)
      .catch((e) => toast.error(e?.message ?? "Chargement impossible"))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const handleExport = async (id: string, name: string | null) => {
    try {
      const run = await getRun(id);
      if (!run?.points?.length) {
        toast.error("Cette sortie ne contient pas de tracé.");
        return;
      }
      exportToGpx(run.points, (name ?? "sortie").replace(/\s+/g, "_"));
    } catch (e: any) {
      toast.error(e?.message ?? "Export impossible");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette sortie ?")) return;
    try {
      await deleteRun(id);
      setRuns((r) => r.filter((x) => x.id !== id));
      toast.success("Sortie supprimée.");
    } catch (e: any) {
      toast.error(e?.message ?? "Suppression impossible");
    }
  };

  return (
    <main className="container mx-auto px-4 py-12 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Mes sorties</h1>

      {loading ? (
        <p className="text-muted-foreground">Chargement…</p>
      ) : runs.length === 0 ? (
        <Card className="p-8 text-center space-y-4">
          <p className="text-muted-foreground">
            Aucune sortie enregistrée pour l'instant.
          </p>
          <Button asChild>
            <Link to="/">Démarrer une sortie</Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Card key={run.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold">{run.name ?? "Sortie"}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(run.started_at)}
                </p>
                <p className="text-sm mt-1">
                  <b>{(run.distance_km ?? 0).toFixed(2)} km</b> ·{" "}
                  {Math.round(run.elevation_m ?? 0)} m D+ ·{" "}
                  {formatDuration(run.duration_s)}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleExport(run.id, run.name)}
                  aria-label="Exporter en GPX"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDelete(run.id)}
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
};

export default Runs;
