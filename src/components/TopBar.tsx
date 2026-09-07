// src/components/TopBar.tsx — barre supérieure : liens + état de connexion.
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export default function TopBar() {
  const { session, user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="w-full border-b bg-card/80 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 h-12 flex items-center justify-between">
        <Link to="/" className="font-semibold text-sm">
          Trail Navigator
        </Link>

        <div className="flex items-center gap-3 text-sm">
          {session ? (
            <>
              <Link to="/runs" className="hover:text-accent">
                Mes sorties
              </Link>
              <span className="text-muted-foreground hidden sm:inline">
                {user?.email}
              </span>
              <Button size="sm" variant="ghost" onClick={handleSignOut}>
                Déconnexion
              </Button>
            </>
          ) : (
            <Link to="/login" className="hover:text-accent">
              Se connecter
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
