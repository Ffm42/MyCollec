# Ma Collection — PWA iPhone

## Mise en ligne (une seule fois, ~5 min)
1. Sur github.com : **New repository** → nom `ma-collection` → **Public** → Create.
2. **Add file → Upload files** → glisser TOUT le contenu de ce dossier (y compris le dossier `icons`) → Commit.
3. **Settings → Pages** → Source : *Deploy from a branch* → Branch `main` / `(root)` → Save.
4. Attendre 1-2 min : l'app est sur `https://<ton-pseudo>.github.io/ma-collection/`.

## Installation sur l'iPhone
1. Ouvrir l'adresse dans **Safari**.
2. Bouton Partager → **Sur l'écran d'accueil** → Ajouter.
3. Lancer l'app depuis l'icône (toujours depuis l'icône, pas depuis Safari : les données sont liées à l'app installée).

L'app fonctionne ensuite hors ligne.

## Mises à jour
Remplacer les fichiers modifiés sur GitHub **et** incrémenter `CACHE` dans `sw.js` (ex. `v1.0.1`).
Au prochain lancement avec du réseau, un bandeau « Nouvelle version disponible » apparaît.

## Sauvegarde
Réglages → Exporter mes données → « Enregistrer dans Fichiers » (iCloud Drive conseillé). À faire régulièrement.
