// src/pages/Login.tsx — connexion / inscription (email+mdp et Google).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mountain } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const Login = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleEmail = async () => {
    if (!email || !password) {
      toast.error("Renseignez email et mot de passe.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate("/");
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Compte créé ! Vérifiez vos emails si demandé.");
        navigate("/");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Échec de l'authentification");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) toast.error(error.message);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6 space-y-5">
        <div className="flex flex-col items-center text-center">
          <Mountain className="h-10 w-10 text-accent mb-2" />
          <h1 className="text-2xl font-bold">Trail Navigator</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signin" ? "Connexion à votre compte" : "Créer un compte"}
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button className="w-full" onClick={handleEmail} disabled={busy}>
            {mode === "signin" ? "Se connecter" : "S'inscrire"}
          </Button>
        </div>

        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs">ou</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogle}>
          Continuer avec Google
        </Button>

        <button
          className="w-full text-sm text-accent hover:underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin"
            ? "Pas de compte ? S'inscrire"
            : "Déjà un compte ? Se connecter"}
        </button>
      </Card>
    </div>
  );
};

export default Login;
