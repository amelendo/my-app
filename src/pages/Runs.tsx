// src/pages/Runs.tsx — liste des sorties de l'utilisateur (vide en phase 1).
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const Runs = () => {
  return (
    <main className="container mx-auto px-4 py-12 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Mes sorties</h1>

      <Card className="p-8 text-center space-y-4">
        <p className="text-muted-foreground">
          Aucune sortie enregistrée pour l'instant.
        </p>
        <p className="text-sm text-muted-foreground">
          Lancez une course depuis l'accueil : une fois l'enregistrement
          sauvegardé sur votre compte, vos sorties apparaîtront ici.
        </p>
        <Button asChild>
          <Link to="/">Démarrer une sortie</Link>
        </Button>
      </Card>
    </main>
  );
};

export default Runs;
