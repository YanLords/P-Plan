# Plan de feu

Générateur **local** de plans de disposition de feux d'artifice — sans compte,
sans serveur, sans envoi de données.

Cartographie du site de tir, placement des éléments, distances de sécurité, export PDF.

## Ce que fait l'application

- **Carte** : fond plan (OpenStreetMap) ou satellite (Esri World Imagery), zoom/pan, échelle.
- **Éléments** : artifice (avec cercle de distance de sécurité), barriérage, zone public,
  **zone perso** (même tracé que la zone public, couleur et libellé personnalisables), accès
  secours, point accueil secours, point d'eau, extincteur, échelle, marqueur libre. Les zones
  portent leur icône en leur centre (recalculée quand un sommet bouge).
- **Artifice générique** : un pin personnalisable (libellé, référence, calibre, distance de
  sécurité). Le cercle de sécurité se règle à la souris : sélectionnez l'artifice, une poignée
  orange apparaît à l'est du point, glissez-la pour ajuster la distance.
- **Édition** : libellé, référence, calibre, distance de sécurité, notes ; sommets de
  barriérage / zone déplaçables ; suppression (bouton ou touche `Suppr`). Le curseur de la carte
  prend l'icône et la couleur de l'outil actif.
- **GPS automatique** (WGS84) sur chaque élément, dans le panneau et dans le PDF.
- **Export PDF A4 paysage** : page 1 = carte + cartouche (compteurs, DS max, centre, échelle,
  fond) ; page 2+ = légende détaillée numérotée (réf, calibre, DS, GPS).
- **Réglages** (roue crantée du rail) : taille de l'interface (80 → 130 %), fond de carte par
  défaut, cercles de sécurité / légende / étiquettes affichés ou non, confirmation de
  suppression, sauvegarde automatique, et **raccourcis clavier configurables**.
- **Fichiers** : plan `.planfeu.json` (enregistrer / ouvrir) + autosauvegarde locale.
- **Historique** : `⌘Z` / `⇧⌘Z` (annuler / rétablir) sur les 100 dernières modifications,
  via deux boutons dans la barre de titre.

## Démarrage

```bash
npm install
npm run dev          # http://127.0.0.1:5173 (navigateur)
npm run tauri:dev    # fenêtre desktop Tauri
```

## Build

```bash
npm run build           # frontend seul (dist/)
npm run tauri:build     # .app/.dmg (macOS) ou .msi/.exe (Windows)
```

## Tests

```bash
npm test        # node --test : conversions m/px, parsing distances, aire, échelle
npm run check   # svelte-check (0 erreur attendu)
```

## Raccourcis

| Touche | Outil |
| --- | --- |
| `V` | Sélection |
| `A` | Artifice |
| `P` | Zone public |
| `Z` | Zone perso |
| `B` | Barriérage |
| `S` | Accès secours |
| `Q` | Accueil secours |
| `E` | Point d'eau |
| `W` | Extincteur |
| `X` | Échelle |
| `M` | Marqueur |
| `Entrée` | terminer le tracé (barriérage / zone) |
| `Échap` | annuler le tracé en cours, sinon désélectionner |
| `Suppr` | supprimer l'élément sélectionné |
| `⌘Z` / `Ctrl+Z` | annuler la dernière modification |
| `⇧⌘Z` / `Ctrl+Y` | rétablir |

Toutes les touches d'outil sont modifiables dans **Réglages → Raccourcis clavier**
(une touche déjà utilisée est retirée de l'outil précédent ; `Retour arrière` pour désactiver).

## Limites assumées (v0.1)

- Pas de géocodage / recherche d'adresse : on se positionne à la souris.
- Fond de carte = réseau requis. L'export PDF embarque l'image, donc le PDF reste
  consultable hors ligne.
- Pas de gestion multi-plans dans une session, pas d'i18n.
- Un seul fond par plan (plan ou satellite).

## Stack

Svelte 5 (runes) + Vite + TypeScript, Leaflet (carte), jsPDF (export), Tauri 2 (desktop).
Thème aligné sur la suite Pyroutils (accent `#FCA04B`, rail 76 px, Feather-style icons).
