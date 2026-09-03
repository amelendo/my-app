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

### Carte de la zone (pré-téléchargement)
Bouton **« Carte hors-ligne »** (visible quand une trace est chargée) :
à lancer **avec du réseau, de préférence en Wi-Fi**, avant de partir.

- Met en cache les tuiles d'un corridor autour de la trace, aux zooms 13-14-15.
- Barre de progression + annulation possible.
- Ensuite, ces tuiles s'affichent hors-ligne.

**Limites à connaître :**
- Volume potentiellement élevé (dizaines de Mo sur une longue trace).
- Hors-ligne, seuls les **zooms 13-14-15** sont disponibles ; en dehors, carte
  blanche. (Ajouter le zoom 16 est possible mais ~×4 de tuiles.)
- À refaire pour chaque nouvelle trace dans une zone différente.
- Ce n'est pas l'offline « officiel » Mapbox (SDK natif) : c'est un
  préchauffage de cache best-effort.

### Le GPS ne dépend PAS du réseau
Positionnement, distance, D+, détection hors-trace et profil d'élévation
continuent de fonctionner sans réseau (le GPS est satellitaire).

---

## 4. Tester le hors-ligne

1. Charger une trace, cliquer **« Carte hors-ligne »**, attendre 100 %.
2. DevTools → **Network → Offline**.
3. Recharger la page : l'app + la trace doivent revenir.
4. Naviguer le long de la trace : la carte reste visible (dans les zooms couverts).

---

## 5. Reste à faire (optionnel)

- Renommer le projet dans `package.json` (encore `vite_react_shadcn_ts`).
- Corriger les balises `og:image` / `twitter:site` de `index.html` (encore Lovable).
- Domaine Vercel personnalisé (au lieu de `my-app-ochre-mu-84.vercel.app`).
- Suivi d'une sortie libre sans trace de référence + récap de fin de course.
