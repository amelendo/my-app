# Déploiement & fonctionnement — Trail Navigator

Guide de mise en ligne (Vercel) et notice des fonctions hors-ligne.

---

## 1. Checklist de déploiement (dans l'ordre)

### a. Appliquer les changements de code
Depuis la racine du dépôt :

```bash
git apply trail-navigator.patch   # (ou déposer les fichiers de trail-navigator-fixes/)
npm install                       # récupère idb, vite-plugin-pwa, recharts
npm run build                     # doit se terminer sans erreur
```

### b. Sortir le token du suivi git
Le `.env` ne doit plus être versionné (le `.gitignore` est déjà corrigé) :

```bash
git rm --cached .env
git commit -m "Retire .env du suivi git"
```

> Le token reste présent dans l'HISTORIQUE git des anciens commits.
> Considérez-le comme compromis → voir l'étape (d), renouvellement/restriction.

### c. Déclarer le token dans Vercel
Dashboard Vercel → projet **my-app** → **Settings → Environment Variables** :

| Champ | Valeur |
|-------|--------|
| Key   | `VITE_MAPBOX_TOKEN` |
| Value | votre token public `pk...` |
| Type  | **Plaintext** (ou Sensitive) — **PAS** "config" |
| Envs  | Production + Preview + Development |

> Piège vérifié : une variable de type « config » n'est **pas** injectée dans
> le build. Elle doit être une Environment Variable rattachée au projet.
>
> Le préfixe `VITE_` est obligatoire : sans lui, Vite ignore la variable.

Puis **Deployments → ⋯ → Redeploy**, en **décochant "Use existing Build Cache"**.
Le token est figé au moment du build : sans redeploy, aucun changement.

### d. Restreindre le token Mapbox
Sur https://account.mapbox.com → Tokens :
- Idéalement, créez un **nouveau** token (l'ancien est dans l'historique git).
- **URL restrictions** : ajoutez le domaine de production Vercel + `http://localhost:8080`.
- Scopes publics uniquement (styles:read, fonts:read…). Jamais de scope secret.

### e. Icônes PWA
Les deux fichiers doivent être dans `public/` à la racine (servis à `/pwa-192.png`
et `/pwa-512.png`, chemins attendus par le manifest) :

```
public/
  pwa-192.png
  pwa-512.png
```

Vérification après déploiement : ouvrir `https://<domaine>/pwa-192.png` →
l'icône montagne doit s'afficher (pas un 404).

---

## 2. Vérifier qu'un déploiement a bien pris

- Le hash du fichier `mapbox-*.js` **change** après un vrai rebuild sans cache.
- La carte s'affiche après chargement d'une trace (= token OK).
- `/(pwa-192.png)` renvoie l'image (= dossier `public/` OK).
- DevTools → Application → Service Workers : un SW **activé** est présent.

---

## 3. Fonctions hors-ligne — mode d'emploi

Trois briques rendent l'app utilisable sans réseau sur le terrain.

### App installable (PWA)
Le shell de l'app (JS/CSS/HTML) est précaché à l'installation. L'app se lance
sans réseau. Sur mobile : « Ajouter à l'écran d'accueil ».

### Trace rechargée automatiquement
La trace GPX importée est persistée dans IndexedDB. Au démarrage, l'app la
recharge seule (toast « Trace restaurée »), même hors-ligne et après un
rechargement/fermeture de l'onglet. « Importer une autre trace » l'efface.

### Sortie libre (sans trace)
Depuis l'accueil, bouton **« Sortie libre »** : ouvre la carte centrée sur la
position GPS, sans trace de référence. Start enregistre le parcours (distance,
D+, vitesse, tracé), Stop l'arrête → Export GPX / envoi Strava disponibles.
En mode libre, les éléments liés à une trace (distance restante, hors-trace,
profil d'élévation, barre de progression) sont masqués.

### Carte hors-ligne — trois modes de téléchargement
À lancer **avec du réseau, de préférence en Wi-Fi**, avant de partir. Un bouton
**« Carte hors-ligne »** et un bouton **« Zone visible »** selon le besoin.

1. **Corridor de trace** (bouton « Carte hors-ligne », mode trace) :
   met en cache les tuiles le long de la trace GPX chargée.
2. **Autour de moi** (bouton « Carte hors-ligne », sortie libre) :
   rayon réglable **3 / 5 / 10 km** autour de la position GPS.
3. **Zone visible** (bouton « Zone visible », les deux modes) :
   cadrez la zone à l'écran, puis téléchargez le rectangle affiché. Une
   **estimation** (nombre de tuiles, ~Mo, ~min) s'affiche AVANT de lancer,
   avec une case **« Haute résolution (zoom 16) »** et un avertissement si la
   zone est volumineuse.

Tous affichent une barre de progression et un bouton d'annulation.

**Limites à connaître :**
- Volume : croît avec le carré de la surface, et ~×4 par niveau de zoom.
  L'estimation de « Zone visible » aide à doser avant de lancer.
- Hors-ligne, seuls les **zooms téléchargés** s'affichent (13-15, +16 en haute
  résolution) ; en dehors, carte blanche.
- Le cache de tuiles est plafonné (6000 entrées) et se purge si le stockage
  sature : une zone très large peut être partiellement évincée.
- À refaire pour chaque nouvelle zone.
- Ce n'est pas l'offline « officiel » Mapbox (SDK natif) : préchauffage de
  cache best-effort. Le cache se remplit aussi tout seul au fil de la course
  si l'app reste ouverte avec du réseau par intermittence.

### Le GPS ne dépend PAS du réseau
Positionnement, distance, D+, détection hors-trace et profil d'élévation
continuent de fonctionner sans réseau (le GPS est satellitaire).

---

## 4. Tester le hors-ligne

1. Charger une trace (ou « Sortie libre »), cadrer la zone, cliquer
   **« Zone visible »** → vérifier l'estimation → **Télécharger**, attendre 100 %.
2. DevTools → **Network → Offline**.
3. Recharger la page : l'app + la trace doivent revenir.
4. Naviguer sur la zone : la carte reste visible (dans les zooms couverts).

---

## 5. Reste à faire (optionnel)

- Renommer le projet dans `package.json` (encore `vite_react_shadcn_ts`).
- Corriger les balises `og:image` / `twitter:site` de `index.html` (encore Lovable).
- Domaine Vercel personnalisé (au lieu de `my-app-ochre-mu-84.vercel.app`).
- Récapitulatif de fin de course (résumé de la sortie enregistrée).

---

## 6. Intégration Strava (envoi des courses)

### Principe
- Fonctions serverless dans `api/strava/` : elles détiennent le **Client Secret**
  (jamais exposé au front) et contournent l'absence de CORS de l'API Strava.
- Front (`src/lib/strava.ts`) : connexion OAuth, stockage/rafraîchissement du
  token, upload de la trace enregistrée.
- Bouton « Connecter Strava » puis « Envoyer vers Strava » (après une course).

### a. Créer l'application Strava
Sur https://www.strava.com/settings/api :
- Notez le **Client ID** et le **Client Secret**.
- **Authorization Callback Domain** : votre domaine Vercel SANS https ni chemin,
  ex. `my-app-ochre-mu-84.vercel.app` (ou votre domaine perso).

### b. Variables d'environnement Vercel
Settings → Environment Variables (Production + Preview + Development) :

| Key | Valeur | Exposée au front ? |
|-----|--------|--------------------|
| `VITE_STRAVA_CLIENT_ID` | Client ID | Oui (public, normal) |
| `STRAVA_CLIENT_ID`      | Client ID | Non (serverless) |
| `STRAVA_CLIENT_SECRET`  | Client Secret | **Non — jamais VITE_** |

> Le `STRAVA_CLIENT_SECRET` ne doit JAMAIS être préfixé `VITE_` : ce préfixe
> l'intégrerait au bundle front. Il reste côté serverless uniquement.

Redéployez (sans cache) après ajout.

### c. Routage
Le fichier `vercel.json` renvoie les routes SPA vers `index.html` tout en
laissant passer `/api/*` vers les fonctions serverless. Ne pas le supprimer.

### d. Utilisation
1. Terminer une course (Start → Stop).
2. « Connecter Strava » → autoriser sur Strava → retour à l'app.
3. « Envoyer vers Strava » → la trace est publiée (traitement asynchrone).

### Limites
- Tokens stockés en localStorage (usage perso mono-utilisateur). Pour du
  multi-utilisateurs, passer à des cookies httpOnly côté serveur.
- Strava refuse les doublons (une même trace envoyée deux fois → erreur).
- L'upload est asynchrone : le statut final peut prendre quelques secondes.
